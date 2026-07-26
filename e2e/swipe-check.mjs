// Verifica que se pueda pasar de página deslizando el dedo, en PDF y en EPUB.
import { chromium, devices } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3010";

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

/** Deslizamiento real: los eventos táctiles llegan también dentro del iframe del EPUB. */
async function swipe(direction) {
  const { width, height } = page.viewportSize();
  const y = Math.round(height / 2);
  const from = direction === "left" ? Math.round(width * 0.8) : Math.round(width * 0.2);
  const to = direction === "left" ? Math.round(width * 0.2) : Math.round(width * 0.8);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from, y }],
  });
  for (let step = 1; step <= 4; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: Math.round(from + ((to - from) * step) / 4), y }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
}

function check(label, condition) {
  if (!condition) throw new Error(`falló: ${label}`);
  console.log(`ok — ${label}`);
}

await page.goto(BASE, { waitUntil: "networkidle" });

/* ------------------------------------------------------------------- PDF */

await page.setInputFiles('input[type="file"]', join(here, "fixtures", "sample.pdf"));
await page.getByRole("link", { name: /A Quiet Morning/ }).first().click();
await page.waitForSelector(".textLayer span.pw", { timeout: 30000 });

const positionText = () => page.locator("footer span.tabular-nums").innerText();
check("el PDF abre en la página 1", (await positionText()).includes("Página 1 de 2"));

await swipe("left");
check("deslizar hacia la izquierda avanza", (await positionText()).includes("Página 2 de 2"));

await swipe("right");
check("deslizar hacia la derecha retrocede", (await positionText()).includes("Página 1 de 2"));

// El deslizamiento no debe abrir además la palabra que quedó bajo el dedo.
check(
  "el gesto no abre el diccionario",
  (await page.locator('[data-slot="drawer-content"]').count()) === 0,
);

/* ------------------------------------------------------------------ EPUB */

await page.goto(BASE, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', join(here, "fixtures", "sample.epub"));
await page.getByRole("link", { name: /The Lighthouse Keeper/ }).first().click();
await page.waitForSelector("iframe", { timeout: 30000 });
await page.waitForTimeout(1500);

const prevButton = page.getByRole("button", { name: "Página anterior" });
check("el EPUB abre al principio", await prevButton.isDisabled());

await swipe("left");
check("deslizar avanza en el EPUB", await prevButton.isEnabled());

await swipe("right");
check("deslizar hacia atrás vuelve al principio", await prevButton.isDisabled());

console.log("deslizamiento verificado");
await browser.close();
