// Verifica que la app cumpla los requisitos de instalación y funcione offline.
import { chromium, devices } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });

/* ------------------------------------------------------------- manifest */

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  return (await fetch(link.getAttribute("href"))).json();
});

check("La página declara un manifest", manifest !== null);
check("El manifest tiene name y short_name", Boolean(manifest?.name && manifest?.short_name));
check("display es standalone", manifest?.display === "standalone", manifest?.display);
check("start_url definida", Boolean(manifest?.start_url), manifest?.start_url);

const icons = manifest?.icons ?? [];
const has = (size, purpose = "any") =>
  icons.some(
    (i) =>
      i.sizes?.includes(size) &&
      i.type === "image/png" &&
      (i.purpose ?? "any").includes(purpose),
  );
check("Ícono PNG de 192×192", has("192x192"));
check("Ícono PNG de 512×512", has("512x512"));
check("Ícono maskable", has("512x512", "maskable"));

// Los íconos tienen que existir de verdad, no solo estar declarados
for (const icon of icons) {
  const res = await page.request.get(new URL(icon.src, BASE).href);
  check(`Se sirve ${icon.src}`, res.ok(), `HTTP ${res.status()}`);
}

const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', "href");
check("Declara apple-touch-icon para iOS", Boolean(appleIcon), appleIcon ?? "falta");

/* ------------------------------------------------------ service worker */

const swReady = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "sin soporte";
  const reg = await Promise.race([
    navigator.serviceWorker.ready.then(() => "activo"),
    new Promise((r) => setTimeout(() => r("timeout"), 15000)),
  ]);
  return reg;
});
check("El service worker queda activo", swReady === "activo", swReady);

const controlling = await page.evaluate(
  () => navigator.serviceWorker.controller !== null,
);
check("El service worker controla la página", controlling);

/* -------------------------------------------------------------- offline */

// Se navega un poco para que el worker cachee lo necesario
await page.goto(`${BASE}/ajustes`, { waitUntil: "networkidle" });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await context.setOffline(true);
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
  const visible = await page
    .getByText("Subí un libro")
    .isVisible()
    .catch(() => false);
  check("La app abre sin conexión", visible);
  await page.screenshot({ path: join(shots, "p1-offline.png") });
} catch (err) {
  check("La app abre sin conexión", false, err.message.split("\n")[0]);
}
await context.setOffline(false);

/* ----------------------------------------------------------- UI de instalar */

await page.goto(`${BASE}/ajustes`, { waitUntil: "networkidle" });
const settingsText = await page.locator("body").innerText();
check(
  "Ajustes ofrece instalar la app",
  /Instalar la app/i.test(settingsText),
);
// En Chromium headless no se dispara beforeinstallprompt, así que cae al
// instructivo o al aviso de navegador no compatible: cualquiera es válido.
check(
  "Muestra un camino concreto para instalar",
  /Agregar a inicio|Instalar la app|no ofrece instalar/i.test(settingsText),
);
await page.screenshot({ path: join(shots, "p2-ajustes-instalar.png") });

/* ------------------------------------------------------------------------
   Chromium headless nunca dispara beforeinstallprompt, así que lo simulamos
   para probar el camino que va a recorrer un Chrome de verdad: aparece el
   botón, se llama a prompt() y se avisa cuando se acepta.
------------------------------------------------------------------------ */

await page.evaluate(() => {
  const event = new Event("beforeinstallprompt");
  Object.assign(event, {
    prompt: () => {
      window.__promptLlamado = true;
      return Promise.resolve();
    },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  window.dispatchEvent(event);
});

const installButton = page.getByRole("button", { name: /Instalar la app/ });
check(
  "Aparece el botón de instalar cuando el navegador lo ofrece",
  await installButton.isVisible().catch(() => false),
);

await installButton.click();
check(
  "El botón dispara el diálogo nativo de instalación",
  await page.evaluate(() => window.__promptLlamado === true),
);
check(
  "Confirma cuando la instalación se acepta",
  await page
    .getByText("Lectura se instaló en tu dispositivo")
    .isVisible()
    .catch(() => false),
);

// Y el mismo camino desde el banner de la biblioteca
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => {
  const event = new Event("beforeinstallprompt");
  Object.assign(event, {
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  window.dispatchEvent(event);
});
check(
  "La biblioteca muestra el banner para instalar",
  await page
    .getByText("Tenela a mano")
    .isVisible()
    .catch(() => false),
);
await page.screenshot({ path: join(shots, "p3-banner-instalar.png") });

await page.getByRole("button", { name: "No mostrar más" }).click();
await page.waitForTimeout(300);
check(
  "El banner se puede cerrar y no vuelve",
  !(await page
    .getByText("Tenela a mano")
    .isVisible()
    .catch(() => false)) &&
    (await page.evaluate(
      () => localStorage.getItem("lectura:install-dismissed") === "1",
    )),
);

await browser.close();

console.log("\n" + results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} verificaciones OK`);
process.exit(failures > 0 ? 1 : 0);
