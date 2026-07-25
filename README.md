# Lectura

Subís un libro en inglés (PDF o EPUB), tocás cualquier palabra y aparece un
modal con su pronunciación, su significado, la traducción al español y un
ejemplo de uso.

Todo corre en el navegador. **Sin backend, sin base de datos y sin costos de
IA.**

## Cómo funciona

| Necesidad | Cómo se resuelve | Costo |
|---|---|---|
| Leer PDF | `pdfjs-dist` — canvas + capa de texto con cada palabra en un span | — |
| Leer EPUB | `epubjs` — se inyectan los spans dentro del iframe | — |
| Significado y fonética | [dictionaryapi.dev](https://dictionaryapi.dev) | gratis, sin API key |
| Pronunciación (1° opción) | MP3 grabado por una persona que trae la misma API | gratis |
| Pronunciación (2° opción) | Web Speech API del navegador | gratis, offline |
| Traducción al español | [MyMemory](https://mymemory.translated.net) | gratis, sin API key |
| Frase de ejemplo | Ejemplos del diccionario; si no hay, [Tatoeba](https://tatoeba.org) | gratis |

Cada búsqueda queda cacheada en IndexedDB, así que tocar la misma palabra dos
veces no vuelve a pegarle a ninguna API.

### Explicaciones en inglés o en español

El modal tiene un toggle EN/ES sobre las acepciones. Se traducen **solo cuando
se piden** y el resultado queda cacheado junto a la palabra, porque la cuota
gratuita de traducción es por caracteres y las definiciones son largas. La
elección se recuerda: si queda en ES, las siguientes palabras ya se abren
traducidas.

### Modo oscuro

- **PDF**: las páginas son imágenes blancas, así que se invierten con un filtro.
- **EPUB**: casi todos los libros traen su propia hoja de estilos con
  `p { color: #111 }`, que le gana a cualquier regla de `body`. En oscuro se
  fuerza el color del texto; en claro se respeta el diseño del libro. El fondo
  del documento se pinta con un color concreto y no con `transparent`: un iframe
  sin fondo declarado se pinta blanco por defecto.
- **Barra del navegador**: el `theme-color` lo maneja `<ThemeColor/>` en el
  cliente. El de Next depende de `prefers-color-scheme`, o sea del sistema
  operativo, y quedaba desfasado cuando el tema de la app no coincidía.

### Dónde se guardan los datos

En el dispositivo, nada más:

- **Libros** → IndexedDB (se pide `navigator.storage.persist()` al subir el
  primero para que el navegador no los descarte).
- **Progreso, vocabulario y preferencias** → IndexedDB y localStorage.

Los archivos nunca se suben a ningún servidor. La contracara: si se borran los
datos del navegador o se abre desde otro dispositivo, los libros no están.

## Instalable y offline

Se puede instalar como app desde la propia interfaz: hay un botón en Ajustes y
un banner descartable en la biblioteca.

- **Android / Chrome / Edge**: se captura `beforeinstallprompt` y el botón abre
  el diálogo nativo de instalación.
- **iPhone y iPad**: Safari no expone ese evento, así que se muestran los pasos
  (Compartir → Agregar a inicio).
- **Ya instalada**: se detecta por `display-mode: standalone` y se avisa en vez
  de ofrecerla de nuevo.

El service worker (`public/sw.js`) hace que la app abra sin conexión, que es lo
que corresponde: los libros ya están en el dispositivo y lo único que necesita
internet es buscar una palabra nueva. Los assets con hash van cache-first, las
páginas red-primero con el cache como respaldo, y las APIs externas nunca se
cachean ahí (para eso está el cache de IndexedDB).

Los íconos PNG se generan desde los SVG con `npm run icons`.

## Pantallas

| Ruta | Qué es |
|---|---|
| `/` | Biblioteca: subir libros, portadas, progreso, eliminar |
| `/leer/[id]` | Lector de PDF o EPUB con palabras clickeables |
| `/mis-palabras` | Vocabulario guardado, con audio y exportación a CSV |
| `/ajustes` | Tema, tamaño de letra, voz, almacenamiento |

El modal de palabra no es una ruta: es un drawer que se abre sobre el libro.

## Desarrollo

```bash
npm install        # copia el worker de pdf.js a /public en el postinstall
npm run dev
```

```bash
npm run build
npm run typecheck
npm run lint
```

### Prueba de punta a punta

Levanta Chromium, sube un PDF y un EPUB reales, toca palabras y verifica que el
modal traiga audio, significado, traducción y ejemplo.

```bash
npm run build && npx next start -p 3010   # en una terminal
npm run e2e                               # en otra: flujo completo (25 checks)
npm run e2e:pwa                           # instalación y offline (22 checks)
npm run e2e:dark                          # modo oscuro y toggle EN/ES (15 checks)
npm run e2e:theme                         # claro/oscuro alternando en caliente (43 checks)
```

`e2e:dark` y `e2e:theme` miden **los píxeles renderizados**, no el CSS: un
iframe puede reportar fondo transparente y verse blanco igual, y esa diferencia
ya dejó pasar un bug real.

`e2e:theme` toca el botón del tema con el libro abierto en vez de fijarlo antes
de cargar. Es la diferencia que importa: los desfasajes de tema aparecían recién
al alternar, y con el tema fijado de entrada todo pasaba.

Todas aceptan `BASE_URL` para correr contra producción.

Las capturas quedan en `e2e/screenshots/`.

## Limitaciones conocidas

- **PDF escaneado**: si el archivo son imágenes sin capa de texto, no se pueden
  tocar las palabras. La app lo detecta al subirlo y avisa. Resolverlo requiere
  OCR.
- **MyMemory** tiene un límite gratuito de ~5.000 caracteres por día y por IP.
  Con el cache alcanza de sobra para uso personal, pero no para muchos usuarios.
- **Calidad de la voz de respaldo**: depende del dispositivo. Chrome en Android y
  Safari en iOS traen voces bastante naturales; en otros navegadores puede sonar
  más sintética. Se elige la mejor disponible automáticamente y se puede cambiar
  en Ajustes.
- La API de diccionario tiene errores de datos en algunas palabras (mezcla
  acepciones de otras). Se mitiga intercalando las acepciones de cada grupo.
