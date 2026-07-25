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

### Dónde se guardan los datos

En el dispositivo, nada más:

- **Libros** → IndexedDB (se pide `navigator.storage.persist()` al subir el
  primero para que el navegador no los descarte).
- **Progreso, vocabulario y preferencias** → IndexedDB y localStorage.

Los archivos nunca se suben a ningún servidor. La contracara: si se borran los
datos del navegador o se abre desde otro dispositivo, los libros no están.

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
npm run e2e                               # en otra
```

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
