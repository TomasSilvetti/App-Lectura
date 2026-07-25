/**
 * Acceso a los colores del tema desde JavaScript.
 *
 * El origen de verdad son los custom properties de globals.css. Todo lo que no
 * puede leerlos por cascada —la barra del sistema, el iframe del EPUB— los pide
 * por acá en vez de tener su propia copia de la paleta.
 */

const VARS = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  paper: "--reader-paper",
  primary: "--primary",
  muted: "--muted-foreground",
  border: "--border",
  hover: "--word-hover",
  active: "--word-active",
} as const;

export type ThemeTokens = Record<keyof typeof VARS, string>;

/**
 * Devuelve los tokens del tema pedido, esté activo o no.
 *
 * No alcanza con leerlos del <html>: next-themes le pone la clase del tema en
 * un efecto del provider, y React corre los efectos de los hijos antes que los
 * del padre. Un componente que reacciona a `resolvedTheme` y consulta el <html>
 * lee siempre la paleta del tema anterior, y queda un toggle atrasado — ése era
 * el origen de las pantallas mitad claras y mitad oscuras.
 *
 * La sonda lleva la clase del tema destino, así que la cascada le aplica esos
 * valores directamente, sin depender de en qué estado está el <html>.
 */
export function readThemeTokens(isDark: boolean): ThemeTokens {
  const probe = document.createElement("div");
  probe.className = isDark ? "dark" : "light";
  probe.style.cssText =
    "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
  // Suelto no sirve: un elemento fuera del documento no tiene estilo computado.
  document.body.appendChild(probe);

  try {
    const styles = getComputedStyle(probe);
    return Object.fromEntries(
      Object.entries(VARS).map(([key, variable]) => [
        key,
        styles.getPropertyValue(variable).trim(),
      ]),
    ) as ThemeTokens;
  } finally {
    probe.remove();
  }
}

/**
 * Pasa un color CSS a hexadecimal.
 *
 * La paleta está escrita en oklch y hay lugares que no lo aceptan: el
 * `<meta name="theme-color">` lo ignora en varios navegadores móviles. El
 * canvas hace la conversión a sRGB sin tener que implementar la fórmula.
 */
export function toHex(cssColor: string): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}
