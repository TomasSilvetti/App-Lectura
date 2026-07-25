// Prueba de punta a punta: sube un libro, toca una palabra y verifica que el
// modal traiga significado, traducción, ejemplo y audio.
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const shots = join(here, "screenshots");
const BASE = process.env.BASE_URL ?? "http://localhost:3010";

const results = [];
let failures = 0;

/** innerText separa bloques con dobles saltos: hay que saltear los vacíos. */
function valueAfter(text, label) {
  const rest = text.split(new RegExp(label, "i"))[1];
  return rest?.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASA" : "FALLA"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}

async function run() {
  await mkdir(shots, { recursive: true });

  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const audioRequests = [];
  page.on("request", (req) => {
    if (/\.(mp3|ogg|wav)(\?|$)/i.test(req.url())) audioRequests.push(req.url());
  });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`);
  });

  /* ------------------------------------------------------- biblioteca */

  await page.goto(BASE, { waitUntil: "networkidle" });
  check(
    "La biblioteca abre con el estado vacío",
    await page.getByText("Todavía no subiste ningún libro").isVisible(),
  );

  /* -------------------------------------------------------------- PDF */

  await page.setInputFiles('input[type="file"]', join(fixtures, "sample.pdf"));
  await page.waitForSelector("text=Tus libros", { timeout: 30000 });
  check("El PDF aparece en la biblioteca", true);

  await page.screenshot({ path: join(shots, "01-biblioteca.png") });

  await page.getByRole("link", { name: /A Quiet Morning/ }).first().click();
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForSelector(".textLayer span.pw", { timeout: 30000 });

  const wordCount = await page.locator(".textLayer span.pw").count();
  check("El PDF genera palabras clickeables", wordCount > 20, `${wordCount} palabras`);

  await page.screenshot({ path: join(shots, "02-lector-pdf.png") });

  const target = page.locator('.textLayer span.pw[data-word="morning"]').first();
  check("Se encuentra la palabra 'morning' en el texto", (await target.count()) > 0);
  await target.click();

  const sheet = page.locator('[data-slot="drawer-content"]');
  await sheet.waitFor({ state: "visible", timeout: 15000 });
  check("El modal se abre al tocar una palabra", true);

  await page.waitForSelector("text=En español", { timeout: 20000 });
  // innerText aplica text-transform, así que los títulos llegan en mayúsculas.
  const sheetText = await sheet.innerText();
  const translation = valueAfter(sheetText, "en español");

  check("El modal muestra la palabra", /morning/i.test(sheetText));
  check(
    "El modal muestra la traducción al español",
    Boolean(translation) && translation.length > 2,
    translation ?? "sin traducción",
  );
  check("El modal muestra el significado", /significado/i.test(sheetText));
  check("El modal ofrece un ejemplo de uso", /ejemplo de uso/i.test(sheetText));
  check(
    "El modal muestra la fonética",
    /\/.+\//.test(sheetText),
    sheetText.match(/\/[^/\n]+\//)?.[0] ?? "sin fonética",
  );

  await page.screenshot({ path: join(shots, "03-modal-palabra.png") });

  // Ejemplo de uso
  const exampleButton = page.getByRole("button", { name: /Ver ejemplo de uso/ });
  if (await exampleButton.isVisible()) {
    await exampleButton.click();
    await page.waitForTimeout(300);
    const withExample = await sheet.innerText();
    check(
      "El ejemplo de uso se despliega",
      /ejemplo de uso/i.test(withExample) && /[“"]/.test(withExample),
      valueAfter(withExample, "ejemplo de uso"),
    );
  }

  // Audio
  await page.waitForTimeout(1500);
  check(
    "Se descargó el audio de pronunciación",
    audioRequests.length > 0,
    audioRequests[0] ?? "ninguno",
  );

  // Guardar palabra
  await page.getByRole("button", { name: /Guardar palabra/ }).click();
  await page.waitForSelector("text=Guardada en Mis palabras", { timeout: 5000 });
  check("La palabra se puede guardar", true);

  await page.screenshot({ path: join(shots, "04-modal-completo.png") });
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "hidden", timeout: 5000 });

  // Paginación y persistencia de progreso
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await page.waitForTimeout(1200);
  check(
    "La navegación de páginas funciona",
    /Página 2 de 2/.test(await page.locator("footer").innerText()),
    await page.locator("footer").innerText(),
  );

  /* ------------------------------------------------------------- EPUB */

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', join(fixtures, "sample.epub"));
  await page.waitForSelector("text=The Lighthouse Keeper", { timeout: 30000 });
  check("El EPUB aparece en la biblioteca", true);

  await page.getByRole("link", { name: /The Lighthouse Keeper/ }).first().click();
  const frame = await (async () => {
    for (let i = 0; i < 40; i++) {
      const f = page.frames().find((fr) => fr !== page.mainFrame());
      if (f && (await f.locator("span.pw").count()) > 0) return f;
      await page.waitForTimeout(500);
    }
    return null;
  })();

  if (check("El EPUB genera palabras clickeables", frame !== null)) {
    const epubWords = await frame.locator("span.pw").count();
    check("El EPUB tiene palabras envueltas", epubWords > 10, `${epubWords} palabras`);
    await page.screenshot({ path: join(shots, "05-lector-epub.png") });

    await frame.locator('span.pw[data-word="window"]').first().click();
    await sheet.waitFor({ state: "visible", timeout: 15000 });
    check("El modal se abre desde el EPUB", true);

    await page.waitForSelector("text=En español", { timeout: 20000 });
    const epubSheet = await sheet.innerText();
    check(
      "El modal del EPUB trae significado y traducción",
      /window/i.test(epubSheet) && /significado/i.test(epubSheet),
      valueAfter(epubSheet, "en español"),
    );
    await page.screenshot({ path: join(shots, "06-modal-epub.png") });
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden", timeout: 5000 });

    const beforeNav = await page.locator("footer").innerText();
    check(
      "El EPUB no muestra un porcentaje falso al empezar",
      !/100%/.test(beforeNav),
      beforeNav.replace(/\n/g, " "),
    );

    await page.getByRole("button", { name: "Página siguiente" }).click();
    await page.waitForTimeout(2000);
    const afterNav = await page.locator("footer").innerText();
    check(
      "El EPUB avanza de página",
      afterNav !== beforeNav,
      afterNav.replace(/\n/g, " "),
    );
  }

  /* ---------------------------------------------- mis palabras y ajustes */

  await page.goto(`${BASE}/mis-palabras`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check(
    "La palabra guardada aparece en Mis palabras",
    /morning/i.test(await page.locator("main, body").first().innerText()),
  );
  await page.screenshot({ path: join(shots, "07-mis-palabras.png") });

  await page.goto(`${BASE}/ajustes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check(
    "Ajustes carga con todas sus secciones",
    /Apariencia/.test(await page.locator("body").innerText()) &&
      /Pronunciación/.test(await page.locator("body").innerText()) &&
      /Almacenamiento/.test(await page.locator("body").innerText()),
  );

  // Tema oscuro
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await page.waitForTimeout(400);
  check(
    "El modo oscuro se aplica",
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
  );
  await page.screenshot({ path: join(shots, "08-ajustes-oscuro.png") });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, "09-biblioteca-oscuro.png") });

  const relevantErrors = pageErrors.filter(
    (e) => !/favicon|404|Failed to load resource/i.test(e),
  );
  check(
    "Sin errores de JavaScript en consola",
    relevantErrors.length === 0,
    relevantErrors.slice(0, 3).join(" | "),
  );

  await browser.close();
}

try {
  await run();
} catch (err) {
  check("La prueba terminó sin excepciones", false, err.message);
}

console.log("\n" + results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} verificaciones OK`);
process.exit(failures > 0 ? 1 : 0);
