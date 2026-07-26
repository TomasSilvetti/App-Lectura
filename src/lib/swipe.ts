/**
 * Navegación por deslizamiento: de derecha a izquierda avanza, al revés vuelve.
 *
 * Se registra sobre un elemento o sobre el `document` de un iframe (el EPUB
 * monta cada página en uno), así que trabaja con eventos táctiles crudos en vez
 * de depender del contenedor.
 */

interface SwipeOptions {
  onPrev: () => void;
  onNext: () => void;
  /**
   * Cuando el contenido se puede desplazar a lo ancho —un PDF ampliado, por
   * ejemplo— el gesto horizontal es para mirar el margen, no para cambiar de
   * página.
   */
  isScrollableX?: () => boolean;
}

/** Recorrido mínimo, en píxeles, para que el gesto cuente como deslizamiento. */
const MIN_DISTANCE = 60;
/** Cuánto más horizontal que vertical tiene que ser para no confundirlo con scroll. */
const DIRECTION_RATIO = 1.5;
/** Un arrastre lento es un ajuste de lectura, no un pase de página. */
const MAX_DURATION = 700;

export function attachSwipeNavigation(
  target: HTMLElement | Document,
  { onPrev, onNext, isScrollableX }: SwipeOptions,
): () => void {
  let start: { x: number; y: number; time: number } | null = null;

  const onTouchStart = (event: Event) => {
    const touches = (event as TouchEvent).touches;
    // Con dos dedos se está ampliando el texto.
    if (touches.length !== 1) {
      start = null;
      return;
    }
    const touch = touches[0];
    start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const onTouchEnd = (event: Event) => {
    const from = start;
    start = null;
    if (!from) return;

    const touch = (event as TouchEvent).changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Date.now() - from.time > MAX_DURATION) return;
    if (Math.abs(dx) < MIN_DISTANCE) return;
    if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;
    if (isScrollableX?.()) return;

    // Cancela el click sintético que sigue al toque: sin esto el deslizamiento
    // abre además la palabra que quedó bajo el dedo.
    if (event.cancelable) event.preventDefault();

    if (dx < 0) onNext();
    else onPrev();
  };

  const onTouchCancel = () => {
    start = null;
  };

  target.addEventListener("touchstart", onTouchStart, { passive: true });
  target.addEventListener("touchend", onTouchEnd, { passive: false });
  target.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchend", onTouchEnd);
    target.removeEventListener("touchcancel", onTouchCancel);
  };
}
