/** Palabras inglesas, admitiendo apóstrofo y guion internos (don't, well-known). */
const WORD_RE = /[A-Za-z]+(?:['’‐-][A-Za-z]+)*/g;

export const WORD_CLASS = "pw";
export const WORD_ATTR = "data-word";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "CODE",
  "PRE",
]);

/** Reemplaza un nodo de texto por la misma cadena con cada palabra en un span. */
function wrapTextNode(node: Text): void {
  const text = node.nodeValue;
  if (!text || !/[A-Za-z]/.test(text)) return;

  const doc = node.ownerDocument;
  if (!doc) return;

  const fragment = doc.createDocumentFragment();
  let cursor = 0;
  WORD_RE.lastIndex = 0;

  for (let match = WORD_RE.exec(text); match; match = WORD_RE.exec(text)) {
    if (match.index > cursor) {
      fragment.append(doc.createTextNode(text.slice(cursor, match.index)));
    }
    const span = doc.createElement("span");
    span.className = WORD_CLASS;
    span.setAttribute(WORD_ATTR, match[0]);
    span.textContent = match[0];
    fragment.append(span);
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return;
  if (cursor < text.length) {
    fragment.append(doc.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
}

/** Envuelve en spans clickeables todas las palabras dentro de un elemento. */
export function wrapWordsInElement(root: HTMLElement | null | undefined): void {
  if (!root) return;
  const doc = root.ownerDocument;
  if (!doc) return;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains(WORD_CLASS)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Se recolecta primero: mutar el árbol mientras se camina invalida el walker.
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  nodes.forEach(wrapTextNode);
}

/**
 * Devuelve la palabra tocada, si el evento cayó sobre una.
 *
 * Nada de `instanceof Element`: dentro del iframe del EPUB los nodos son de
 * otro realm y el `instanceof` contra los constructores de la ventana padre
 * siempre da false.
 */
export function wordFromEvent(event: Event): {
  word: string;
  element: HTMLElement;
} | null {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== "function") return null;
  const element = target.closest(`.${WORD_CLASS}`) as HTMLElement | null;
  if (!element || typeof element.getAttribute !== "function") return null;
  const word = element.getAttribute(WORD_ATTR);
  return word ? { word, element } : null;
}

/** Marca visualmente la palabra tocada y limpia la anterior. */
export function setActiveWord(
  root: Document | HTMLElement,
  element: HTMLElement | null,
): void {
  root
    .querySelectorAll(`.${WORD_CLASS}[data-active="true"]`)
    .forEach((el) => el.removeAttribute("data-active"));
  element?.setAttribute("data-active", "true");
}
