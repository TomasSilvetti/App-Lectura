import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copia literal del worker de pdf.js: no es código nuestro.
    "public/pdf.worker.min.mjs",
    // Corre en el scope de service worker, no en el del navegador.
    "public/sw.js",
  ]),
]);

export default eslintConfig;
