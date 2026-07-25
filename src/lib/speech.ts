export type AudioSource = "human" | "device" | "none";

let currentAudio: HTMLAudioElement | null = null;

function supportsSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Las voces se cargan de forma asíncrona: en el primer render casi siempre
 * devuelve una lista vacía y recién después dispara `voiceschanged`.
 */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!supportsSynthesis()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function onVoicesChanged(cb: () => void): () => void {
  if (!supportsSynthesis()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

/* La lista se cachea porque `useSyncExternalStore` exige que dos lecturas
   seguidas devuelvan exactamente la misma referencia. */
const NO_VOICES: SpeechSynthesisVoice[] = [];
let voicesCache: SpeechSynthesisVoice[] | null = null;

export function subscribeToVoices(cb: () => void): () => void {
  return onVoicesChanged(() => {
    voicesCache = null;
    cb();
  });
}

export function getVoicesSnapshot(): SpeechSynthesisVoice[] {
  if (!voicesCache) {
    const voices = getEnglishVoices();
    voicesCache = voices.length ? voices : NO_VOICES;
  }
  return voicesCache;
}

export function getServerVoicesSnapshot(): SpeechSynthesisVoice[] {
  return NO_VOICES;
}

async function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const immediate = getEnglishVoices();
  if (immediate.length) return immediate;

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      off();
      resolve(getEnglishVoices());
    };
    const off = onVoicesChanged(done);
    const timer = setTimeout(done, timeoutMs);
  });
}

/** Las voces de red (Google/Microsoft Natural) suenan bastante mejor. */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (name.includes("natural")) score += 6;
  if (name.includes("google")) score += 5;
  if (name.includes("premium") || name.includes("enhanced")) score += 4;
  if (!voice.localService) score += 3;
  if (voice.lang.toLowerCase() === "en-us") score += 2;
  if (voice.lang.toLowerCase() === "en-gb") score += 1;
  if (name.includes("compact")) score -= 4;
  return score;
}

export function pickVoice(preferredURI?: string | null): SpeechSynthesisVoice | null {
  const voices = getEnglishVoices();
  if (!voices.length) return null;
  if (preferredURI) {
    const match = voices.find((v) => v.voiceURI === preferredURI);
    if (match) return match;
  }
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

export function stopPlayback(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (supportsSynthesis()) window.speechSynthesis.cancel();
}

function playAudioFile(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    currentAudio = audio;
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", () => reject(new Error("audio")), {
      once: true,
    });
    audio.play().catch(reject);
  });
}

async function speak(word: string, preferredURI?: string | null): Promise<void> {
  if (!supportsSynthesis()) throw new Error("sin síntesis de voz");
  await waitForVoices();

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(word);
    const voice = pickVoice(preferredURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 0.9;
    utterance.addEventListener("end", () => resolve(), { once: true });
    utterance.addEventListener("error", () => reject(new Error("tts")), {
      once: true,
    });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export interface PlayOptions {
  audioUrl?: string | null;
  preferHuman?: boolean;
  voiceURI?: string | null;
}

/**
 * Reproduce la pronunciación priorizando el audio grabado por una persona y
 * cayendo a la voz del dispositivo si no existe o si falla la descarga.
 */
export async function playPronunciation(
  word: string,
  { audioUrl, preferHuman = true, voiceURI }: PlayOptions = {},
): Promise<AudioSource> {
  stopPlayback();

  if (audioUrl && preferHuman) {
    try {
      await playAudioFile(audioUrl);
      return "human";
    } catch {
      // sigue con la voz del dispositivo
    }
  }

  try {
    await speak(word, voiceURI);
    return "device";
  } catch {
    return "none";
  }
}
