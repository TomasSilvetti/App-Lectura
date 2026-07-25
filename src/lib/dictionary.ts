import { getCachedLookup, setCachedLookup } from "@/lib/db";

export interface WordDefinition {
  definition: string;
  example: string | null;
}

export interface WordSense {
  partOfSpeech: string;
  definitions: WordDefinition[];
}

export interface WordEntry {
  /** Lo que se tocó en el texto */
  queried: string;
  /** La forma que efectivamente encontró el diccionario (puede ser el lema) */
  word: string;
  phonetic: string | null;
  audioUrl: string | null;
  senses: WordSense[];
  /**
   * Las mismas acepciones traducidas al español. Se calculan solo cuando se
   * piden, porque traducir consume la cuota diaria del servicio.
   */
  sensesEs: WordSense[] | null;
  synonyms: string[];
  translation: string | null;
  example: { en: string; es: string | null } | null;
  found: boolean;
}

const DICTIONARY_API = "https://api.dictionaryapi.dev/api/v2/entries/en";
const TRANSLATE_API = "https://api.mymemory.translated.net/get";
const SENTENCES_API = "https://api.tatoeba.org/unstable/sentences";

const POS_ES: Record<string, string> = {
  noun: "sustantivo",
  verb: "verbo",
  adjective: "adjetivo",
  adverb: "adverbio",
  pronoun: "pronombre",
  preposition: "preposición",
  conjunction: "conjunción",
  interjection: "interjección",
  exclamation: "interjección",
  determiner: "determinante",
  article: "artículo",
  numeral: "numeral",
  abbreviation: "abreviatura",
};

export function partOfSpeechEs(pos: string): string {
  return POS_ES[pos.toLowerCase()] ?? pos;
}

/** Limpia lo que se tocó en el texto para poder buscarlo. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^a-z]+/, "")
    .replace(/[^a-z'-]+$/, "")
    .replace(/'s$/, "")
    .trim();
}

/**
 * El diccionario solo conoce lemas: "running" o "boxes" devuelven 404.
 * Estas candidatas cubren los plurales y conjugaciones regulares, que son la
 * enorme mayoría de lo que aparece al leer.
 */
function lemmaCandidates(word: string): string[] {
  const out: string[] = [];
  const push = (w: string) => {
    if (w.length >= 2 && !out.includes(w) && w !== word) out.push(w);
  };

  if (word.endsWith("ies") && word.length > 4) push(word.slice(0, -3) + "y");
  if (word.endsWith("ves") && word.length > 4) {
    push(word.slice(0, -3) + "f");
    push(word.slice(0, -3) + "fe");
  }
  if (/(ches|shes|sses|xes|zes)$/.test(word)) push(word.slice(0, -2));
  if (word.endsWith("es") && word.length > 3) push(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss")) push(word.slice(0, -1));

  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    push(stem);
    push(stem + "e");
    if (/([bdfglmnprt])\1$/.test(stem)) push(stem.slice(0, -1));
  }

  if (word.endsWith("ied") && word.length > 4) push(word.slice(0, -3) + "y");
  if (word.endsWith("ed") && word.length > 4) {
    const stem = word.slice(0, -2);
    push(stem);
    push(stem + "e");
    if (/([bdfglmnprt])\1$/.test(stem)) push(stem.slice(0, -1));
  }

  if (word.endsWith("est") && word.length > 5) push(word.slice(0, -3));
  if (word.endsWith("er") && word.length > 4) push(word.slice(0, -2));
  if (word.endsWith("ly") && word.length > 4) push(word.slice(0, -2));

  return out;
}

interface RawDictionaryEntry {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
    synonyms?: string[];
  }[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchDictionary(word: string): Promise<RawDictionaryEntry[] | null> {
  const data = await fetchJson<RawDictionaryEntry[] | { title?: string }>(
    `${DICTIONARY_API}/${encodeURIComponent(word)}`,
  );
  if (!Array.isArray(data) || data.length === 0) return null;
  return data;
}

/** Traduce al español. Devuelve null si la API falla o responde algo inútil. */
async function translate(text: string): Promise<string | null> {
  if (!text || text.length > 400) return null;
  const data = await fetchJson<{
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
  }>(`${TRANSLATE_API}?q=${encodeURIComponent(text)}&langpair=en|es`);

  const translated = data?.responseData?.translatedText?.trim();
  if (!translated) return null;
  // La API devuelve estos avisos en el mismo campo que la traducción.
  if (/^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID)/i.test(translated)) {
    return null;
  }
  if (translated.toLowerCase() === text.toLowerCase()) return null;

  // Al traducir una palabra suelta el servicio a veces devuelve "preguntaba."
  const isSingleWord = !/\s/.test(text.trim());
  return isSingleWord ? translated.replace(/[.,;:!¡?¿]+$/, "") : translated;
}

interface TatoebaResponse {
  data?: {
    text?: string;
    translations?: { text?: string; lang?: string }[][];
  }[];
}

/** Frase de ejemplo escrita por personas, con su traducción ya hecha. */
async function fetchExampleSentence(
  word: string,
): Promise<{ en: string; es: string | null } | null> {
  const data = await fetchJson<TatoebaResponse>(
    `${SENTENCES_API}?lang=eng&q=${encodeURIComponent(word)}&trans%3Alang=spa&sort=words&limit=5`,
  );
  if (!data?.data?.length) return null;

  const wordRe = new RegExp(`\\b${word.replace(/[^a-z']/gi, "")}`, "i");
  for (const sentence of data.data) {
    const en = sentence.text?.trim();
    if (!en || en.length > 160 || !wordRe.test(en)) continue;
    const es =
      sentence.translations
        ?.flat()
        .find((t) => t?.lang === "spa" && t.text?.trim())
        ?.text?.trim() ?? null;
    return { en, es };
  }
  return null;
}

const MAX_DEFINITIONS_PER_POS = 4;

function buildSenses(
  entries: RawDictionaryEntry[],
  word: string,
): {
  senses: WordSense[];
  synonyms: string[];
} {
  // Un mismo tipo de palabra puede venir en varios grupos, y a veces el primero
  // trae datos de otra palabra. Se guardan por separado para después intercalar
  // y que la acepción buena no quede tapada por un grupo largo.
  const groupsByPos = new Map<string, WordDefinition[][]>();
  const synonyms = new Set<string>();

  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      const pos = meaning.partOfSpeech?.trim();
      if (!pos) continue;

      for (const syn of meaning.synonyms ?? []) {
        const clean = syn.trim().toLowerCase();
        if (clean && clean !== word.toLowerCase() && /^[a-z][a-z' -]*$/.test(clean)) {
          synonyms.add(clean);
        }
      }

      const group: WordDefinition[] = [];
      for (const def of meaning.definitions ?? []) {
        const text = def.definition?.trim();
        if (!text) continue;
        group.push({ definition: text, example: def.example?.trim() || null });
      }
      if (!group.length) continue;

      const existing = groupsByPos.get(pos);
      if (existing) existing.push(group);
      else groupsByPos.set(pos, [group]);
    }
  }

  const senses: WordSense[] = [];
  for (const [partOfSpeech, groups] of groupsByPos) {
    const definitions: WordDefinition[] = [];
    const seen = new Set<string>();
    const depth = Math.max(...groups.map((g) => g.length));

    for (let i = 0; i < depth && definitions.length < MAX_DEFINITIONS_PER_POS; i++) {
      for (const group of groups) {
        const candidate = group[i];
        if (!candidate || seen.has(candidate.definition)) continue;
        seen.add(candidate.definition);
        definitions.push(candidate);
        if (definitions.length >= MAX_DEFINITIONS_PER_POS) break;
      }
    }

    if (definitions.length) senses.push({ partOfSpeech, definitions });
  }

  return { senses, synonyms: [...synonyms].slice(0, 8) };
}

function pickAudio(entries: RawDictionaryEntry[]): string | null {
  for (const entry of entries) {
    for (const p of entry.phonetics ?? []) {
      const audio = p.audio?.trim();
      if (audio) return audio.startsWith("//") ? `https:${audio}` : audio;
    }
  }
  return null;
}

function pickPhonetic(entries: RawDictionaryEntry[]): string | null {
  for (const entry of entries) {
    if (entry.phonetic?.trim()) return entry.phonetic.trim();
    for (const p of entry.phonetics ?? []) {
      if (p.text?.trim()) return p.text.trim();
    }
  }
  return null;
}

function notFoundEntry(queried: string): WordEntry {
  return {
    queried,
    word: queried,
    phonetic: null,
    audioUrl: null,
    senses: [],
    sensesEs: null,
    synonyms: [],
    translation: null,
    example: null,
    found: false,
  };
}

const inFlight = new Map<string, Promise<WordEntry>>();

/**
 * Busca una palabra. El resultado queda cacheado en IndexedDB, así que tocar la
 * misma palabra dos veces no vuelve a pegarle a ninguna API.
 */
export async function lookupWord(rawWord: string): Promise<WordEntry> {
  const queried = normalizeWord(rawWord);
  if (!queried) return notFoundEntry(rawWord);

  const cached = await getCachedLookup(queried);
  if (cached) return cached;

  const pending = inFlight.get(queried);
  if (pending) return pending;

  const promise = performLookup(queried).finally(() => inFlight.delete(queried));
  inFlight.set(queried, promise);
  return promise;
}

async function performLookup(queried: string): Promise<WordEntry> {
  const [directEntries, translation] = await Promise.all([
    fetchDictionary(queried),
    translate(queried),
  ]);

  let entries = directEntries;
  let resolvedWord = queried;

  if (!entries) {
    for (const candidate of lemmaCandidates(queried)) {
      const found = await fetchDictionary(candidate);
      if (found) {
        entries = found;
        resolvedWord = candidate;
        break;
      }
    }
  }

  if (!entries) {
    const entry: WordEntry = {
      ...notFoundEntry(queried),
      translation,
      found: Boolean(translation),
    };
    if (translation) await setCachedLookup(queried, entry);
    return entry;
  }

  const { senses, synonyms } = buildSenses(entries, resolvedWord);

  // Un ejemplo del propio diccionario es más confiable que uno externo.
  const dictExample = senses
    .flatMap((s) => s.definitions)
    .find((d) => d.example)?.example;

  let example: WordEntry["example"] = null;
  if (dictExample) {
    example = { en: dictExample, es: await translate(dictExample) };
  } else {
    const external = await fetchExampleSentence(resolvedWord);
    if (external) {
      example = {
        en: external.en,
        es: external.es ?? (await translate(external.en)),
      };
    }
  }

  const entry: WordEntry = {
    queried,
    word: entries[0]?.word?.trim() || resolvedWord,
    phonetic: pickPhonetic(entries),
    audioUrl: pickAudio(entries),
    senses,
    sensesEs: null,
    synonyms,
    translation,
    example,
    found: true,
  };

  await setCachedLookup(queried, entry);
  return entry;
}

/**
 * Traduce las acepciones al español y guarda el resultado en el cache, así se
 * paga una sola vez por palabra.
 *
 * Se traduce definición por definición a propósito: unir varias en un mismo
 * pedido no ahorra cuota (el límite es por caracteres) y el traductor suele
 * comerse los separadores.
 */
export async function translateSenses(entry: WordEntry): Promise<WordEntry> {
  if (entry.sensesEs || !entry.senses.length) return entry;

  const sensesEs: WordSense[] = [];
  let translatedCount = 0;

  for (const sense of entry.senses) {
    const definitions: WordDefinition[] = [];
    for (const def of sense.definitions) {
      const translated = await translate(def.definition);
      if (translated) translatedCount += 1;
      definitions.push({
        // Si una definición falla se muestra en inglés en vez de vaciarla.
        definition: translated ?? def.definition,
        example: def.example,
      });
    }
    sensesEs.push({ partOfSpeech: sense.partOfSpeech, definitions });
  }

  // Si no se pudo traducir nada, no vale la pena cachear un resultado inútil:
  // probablemente se agotó la cuota diaria y mañana sí va a funcionar.
  if (translatedCount === 0) return entry;

  const updated: WordEntry = { ...entry, sensesEs };
  await setCachedLookup(entry.queried, updated);
  return updated;
}

/** Adelanta la búsqueda para que al hacer click el audio salga instantáneo. */
export function prefetchWord(rawWord: string): void {
  const word = normalizeWord(rawWord);
  if (!word || inFlight.has(word)) return;
  void lookupWord(word).catch(() => {});
}
