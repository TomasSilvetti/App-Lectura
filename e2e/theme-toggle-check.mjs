/*
 * Verifica el tema alternándolo en caliente, que es donde aparecían los bugs:
 * la suite anterior fijaba el tema en localStorage y recargaba, así que nunca
 * pasaba por el camino que fallaba (tocar el botón con el libro ya abierto).
 *
 * En cada tema y después de cada toggle exige lo mismo: la app, la hoja del
 * libro y la barra del sistema van todas para el mismo lado, y el texto se lee.
 */
import { chromium, devices } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "screenshots");
const BASE = process.env.BASE_URL ?? "http://localhost:3010";

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASA" : "FALLA"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}

/* Chrome devuelve `lab(...)` para los colores escritos en oklch: el canvas los
 * baja a sRGB real. */
const TO_RGB = `(color) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}`;

function luminance(rgb) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(fg, bg) {
  const [hi, lo] = luminance(fg) > luminance(bg)
    ? [luminance(fg), luminance(bg)]
    : [luminance(bg), luminance(fg)];
  return (hi + 0.05) / (lo + 0.05);
}

/** La verdad la dicen los píxeles: el CSS puede declarar un fondo que no se ve. */
async function inspectPixels(buffer) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const background = sorted[0][0].split(",").map(Number);
  const ink =
    sorted
      .slice(1, 60)
      .map(([key]) => key.split(",").map(Number))
      .find((rgb) => contrast(rgb, background) >= 3) ?? null;

  return { background, ink };
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', join(here, "fixtures", "sample.epub"));
await page.waitForSelector("text=The Lighthouse Keeper", { timeout: 30000 });
await page.getByRole("link", { name: /The Lighthouse Keeper/ }).first().click();

let frame = null;
for (let i = 0; i < 40; i++) {
  const candidate = page.frames().find((f) => f !== page.mainFrame());
  if (candidate && (await candidate.locator("span.pw").count().catch(() => 0)) > 0) {
    frame = candidate;
    break;
  }
  await page.waitForTimeout(500);
}
if (!check("El EPUB abre", frame !== null)) {
  await browser.close();
  console.log("\n" + results.join("\n"));
  process.exit(1);
}

/**
 * Mide todo lo que tiene que estar de acuerdo entre sí en un momento dado.
 */
async function audit(label) {
  // Un frame para que se aplique el estilo, sin timeouts arbitrarios largos.
  await page.waitForTimeout(400);

  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );

  const appBg = await page.evaluate(
    ([fn]) => eval(fn)(getComputedStyle(document.body).backgroundColor),
    [TO_RGB],
  );
  const headerInk = await page.evaluate(
    ([fn]) => eval(fn)(getComputedStyle(document.querySelector("header span")).color),
    [TO_RGB],
  );
  const bar = await page.evaluate(
    ([fn]) => {
      const meta = document.querySelector('meta[name="theme-color"][data-owner="app"]');
      return meta ? eval(fn)(meta.content) : null;
    },
    [TO_RGB],
  );
  const colorScheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );

  const surface = await page.locator(".epub-surface").boundingBox();
  const pixels = await inspectPixels(await page.screenshot({ clip: surface }));

  await page.screenshot({ path: join(shots, `t-${label}.png`) });

  const want = isDark ? "oscuro" : "claro";
  const side = (rgb) => (luminance(rgb) < 0.35 ? "oscuro" : "claro");

  check(
    `[${label}] La app está en ${want} y su fondo también`,
    side(appBg) === want,
    `fondo rgb(${appBg})`,
  );
  check(
    `[${label}] El texto del header contrasta con el fondo de la app`,
    contrast(headerInk, appBg) >= 4.5,
    `${contrast(headerInk, appBg).toFixed(2)}:1`,
  );
  check(
    `[${label}] La hoja del libro está en ${want}`,
    bar !== null && side(pixels.background) === want,
    `hoja rgb(${pixels.background})`,
  );
  check(
    `[${label}] La hoja del libro acompaña al fondo de la app`,
    Math.abs(luminance(pixels.background) - luminance(appBg)) < 0.25,
    `hoja ${luminance(pixels.background).toFixed(3)} vs app ${luminance(appBg).toFixed(3)}`,
  );
  check(
    `[${label}] El texto del libro se lee sobre la hoja renderizada`,
    pixels.ink !== null && contrast(pixels.ink, pixels.background) >= 4.5,
    pixels.ink
      ? `tinta rgb(${pixels.ink}) → ${contrast(pixels.ink, pixels.background).toFixed(2)}:1`
      : "no se encontró texto legible",
  );
  check(
    `[${label}] La barra del sistema coincide con el fondo de la app`,
    bar !== null && bar.every((v, i) => Math.abs(v - appBg[i]) <= 2),
    bar ? `barra rgb(${bar}) vs app rgb(${appBg})` : "no hay meta theme-color",
  );
  check(
    `[${label}] color-scheme es ${want} (barra de navegación de Android)`,
    colorScheme === (isDark ? "dark" : "light"),
    colorScheme,
  );
}

const toggle = page.getByRole("button", { name: "Cambiar entre modo claro y oscuro" });

await audit("00-inicial");
await toggle.click();
await audit("01-toggle");
await toggle.click();
await audit("02-vuelta");
await toggle.click();
await audit("03-toggle-otra-vez");

/* Pasar de página después de togglear: cada página es un iframe nuevo y tiene
 * que nacer con el tema vigente, no con el del montaje. */
await page.getByRole("button", { name: "Página siguiente" }).click();
await audit("04-pagina-nueva");
await toggle.click();
await audit("05-toggle-en-pagina-nueva");

await browser.close();
console.log("\n" + results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} verificaciones OK`);
process.exit(failures > 0 ? 1 : 0);
