// Verifica que en modo oscuro no quede texto oscuro sobre fondo oscuro, y que
// la barra del navegador del celular también se ponga oscura.
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

/*
 * Chrome devuelve los colores en el espacio en que fueron escritos: para
 * `oklch()` responde `lab(...)`, que no se puede leer como rgb. Esta función se
 * inyecta en la página y usa un canvas para obtener el sRGB real.
 */
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

/** Luminancia relativa a partir de un [r, g, b]. */
function luminance(rgb) {
  const [r, g, b] = Array.isArray(rgb)
    ? rgb
    : rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Mide sobre los píxeles realmente pintados. Consultar el CSS no alcanza: un
 * iframe puede reportar fondo transparente y verse blanco igual.
 */
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
  const total = data.length / info.channels;
  const background = sorted[0][0].split(",").map(Number);

  // El color más frecuente que contrasta con el fondo es la tinta del texto
  const ink =
    sorted
      .slice(1, 40)
      .map(([key]) => key.split(",").map(Number))
      .find((rgb) => contrast(rgb, background) >= 3) ?? null;

  return {
    background,
    backgroundShare: sorted[0][1] / total,
    ink,
  };
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(`console: ${m.text()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("theme", "dark"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

check(
  "El modo oscuro queda activo",
  await page.evaluate(() => document.documentElement.classList.contains("dark")),
);

/* ------------------------------------------- barra del navegador en móvil */

const themeColor = await page.evaluate(() => {
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  return metas.map((m) => ({
    content: m.getAttribute("content"),
    media: m.getAttribute("media"),
  }));
});
const active = themeColor.find((m) => !m.media);
check(
  "Hay un theme-color sin media query que siga al tema de la app",
  Boolean(active),
  JSON.stringify(themeColor),
);
if (active) {
  const rgb = await page.evaluate(
    ([color, fn]) => eval(fn)(color),
    [active.content, TO_RGB],
  );
  const lum = luminance(rgb);
  check(
    "La barra del navegador es oscura en modo oscuro",
    lum < 0.2,
    `${active.content} (luminancia ${lum.toFixed(3)})`,
  );

  const appBg = await page.evaluate(
    ([fn]) => eval(fn)(getComputedStyle(document.body).backgroundColor),
    [TO_RGB],
  );
  check(
    "La barra del navegador coincide con el fondo de la app",
    rgb.every((v, i) => Math.abs(v - appBg[i]) <= 2),
    `barra ${rgb} vs app ${appBg}`,
  );
}

/* --------------------------------------------------------------- EPUB */

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

if (
  !check(
    "El EPUB carga en modo oscuro",
    frame !== null,
    pageErrors.slice(0, 3).join(" | "),
  )
) {
  await page.screenshot({ path: join(shots, "d0-epub-fallo.png") });
}

if (frame) {
  await page.waitForTimeout(1200);
  const colors = await frame.evaluate(([fn]) => {
    const toRgb = eval(fn);
    const p = document.querySelector("p");
    const h1 = document.querySelector("h1");
    const opaqueBg = (el) => {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          return toRgb(bg);
        }
        node = node.parentElement;
      }
      return null;
    };
    return {
      paragraph: toRgb(getComputedStyle(p).color),
      heading: toRgb(getComputedStyle(h1).color),
      bodyBgRaw: getComputedStyle(document.body).backgroundColor,
      insideBg: opaqueBg(p),
    };
  }, [TO_RGB]);

  // Si el libro no pinta nada, el fondo visible es el de la app detrás del iframe
  const surfaceBg = await page.evaluate(
    ([fn]) =>
      eval(fn)(
        getComputedStyle(document.querySelector(".epub-surface")).backgroundColor,
      ),
    [TO_RGB],
  );
  const bg = colors.insideBg ?? surfaceBg;
  const cParagraph = contrast(colors.paragraph, bg);
  check(
    "El texto del EPUB es de color claro",
    luminance(colors.paragraph) > 0.4,
    `párrafo ${colors.paragraph}`,
  );

  // La verdad la dicen los píxeles: acá se cayó el falso positivo anterior,
  // donde el texto ya era claro pero la hoja seguía blanca.
  const surfaceBox = await page.locator(".epub-surface").boundingBox();
  const pixels = await inspectPixels(await page.screenshot({ clip: surfaceBox }));

  check(
    "La hoja del EPUB se ve oscura de verdad",
    luminance(pixels.background) < 0.15,
    `fondo real rgb(${pixels.background}) — ${(pixels.backgroundShare * 100).toFixed(0)}% de la superficie`,
  );
  check(
    "El texto se lee sobre la hoja renderizada",
    pixels.ink !== null && contrast(pixels.ink, pixels.background) >= 4.5,
    pixels.ink
      ? `tinta rgb(${pixels.ink}) → ${contrast(pixels.ink, pixels.background).toFixed(2)}:1`
      : "no se encontró texto",
  );
  check(
    "El contraste declarado en CSS coincide con lo que se ve",
    Math.abs(cParagraph - contrast(colors.paragraph, pixels.background)) < 2,
    `CSS ${cParagraph.toFixed(2)}:1 vs real ${contrast(colors.paragraph, pixels.background).toFixed(2)}:1`,
  );

  await page.screenshot({ path: join(shots, "d1-epub-oscuro.png") });

  // Y el modal, abierto desde el EPUB
  await frame.locator('span.pw[data-word="window"]').first().click();
  await page.locator('[data-slot="drawer-content"]').waitFor({ state: "visible" });
  await page.waitForSelector("text=En español", { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "d2-modal-oscuro.png") });

  /* ------------------------------ el modal también tiene que leerse */

  const sheetContrast = await page.evaluate(([fn]) => {
    const toRgb = eval(fn);
    const sheet = document.querySelector('[data-slot="drawer-content"]');
    const definition = sheet.querySelector("ol li span:last-child");
    return {
      text: toRgb(getComputedStyle(definition).color),
      bg: toRgb(getComputedStyle(sheet).backgroundColor),
    };
  }, [TO_RGB]);
  const cSheet = contrast(sheetContrast.text, sheetContrast.bg);
  check(
    "Las definiciones del modal se leen en oscuro",
    cSheet >= 4.5,
    `${cSheet.toFixed(2)}:1`,
  );

  /* --------------------------------------- toggle inglés / español */

  const toEs = page.getByRole("button", {
    name: "Ver las explicaciones en español",
  });
  check("El modal tiene toggle de idioma", await toEs.isVisible());

  const before = await page
    .locator('[data-slot="drawer-content"] ol li')
    .first()
    .innerText();

  await toEs.click();
  await page.waitForTimeout(9000);
  const after = await page
    .locator('[data-slot="drawer-content"] ol li')
    .first()
    .innerText();

  check(
    "Al pasar a ES la explicación cambia de idioma",
    after !== before,
    `“${before.slice(0, 40)}…” → “${after.slice(0, 40)}…”`,
  );
  check(
    "La explicación traducida está realmente en español",
    /\b(de|la|el|los|las|un|una|que|para|con|se)\b/i.test(after),
    after.slice(0, 60),
  );
  await page.screenshot({ path: join(shots, "d4-modal-es.png") });

  await page.getByRole("button", { name: "Ver las explicaciones en inglés" }).click();
  await page.waitForTimeout(600);
  check(
    "Se puede volver al inglés",
    (await page.locator('[data-slot="drawer-content"] ol li').first().innerText()) ===
      before,
  );

  // La preferencia tiene que sobrevivir a recargar
  await toEs.click();
  await page.waitForTimeout(1200);
  check(
    "La preferencia de idioma queda guardada",
    await page.evaluate(() =>
      (localStorage.getItem("lectura:prefs") ?? "").includes('"definitionsLang":"es"'),
    ),
  );
}

/* ---------------------------------------------------------------- PDF */

await page.goto(BASE, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', join(here, "fixtures", "sample.pdf"));
await page.waitForSelector("text=Tus libros", { timeout: 30000 });
await page.getByRole("link", { name: /A Quiet Morning/ }).first().click();
await page.waitForSelector(".textLayer span.pw", { timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: join(shots, "d3-pdf-oscuro.png") });

await browser.close();
console.log("\n" + results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} verificaciones OK`);
process.exit(failures > 0 ? 1 : 0);
