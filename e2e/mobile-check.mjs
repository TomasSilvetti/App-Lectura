import { chromium, devices } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "screenshots");
const BASE = process.env.BASE_URL ?? "http://localhost:3010";

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', join(here, "fixtures", "sample.pdf"));
await page.waitForSelector("text=Tus libros", { timeout: 30000 });
await page.screenshot({ path: join(shots, "m1-biblioteca.png") });

await page.getByRole("link", { name: /A Quiet Morning/ }).first().click();
await page.waitForSelector(".textLayer span.pw", { timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: join(shots, "m2-lector.png") });

await page.locator('.textLayer span.pw[data-word="wondered"]').first().tap();
await page.locator('[data-slot="drawer-content"]').waitFor({ state: "visible" });
await page.waitForSelector("text=En español", { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(shots, "m3-modal.png") });

console.log("capturas móviles listas");
await browser.close();
