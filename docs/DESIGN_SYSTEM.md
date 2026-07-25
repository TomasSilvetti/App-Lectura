# Design System — Lectura

> Extiende `~/.claude/design/DESIGN_SYSTEM_BASE.md`. Lo de acá tiene precedencia.

## Identidad

Una app para leer, no un panel de control. La pantalla la manda el libro: el
resto del cromo se corre del camino. Público objetivo: una persona adulta que no
usa apps todos los días, leyendo desde el celular o la tablet.

Consecuencias concretas:

- Áreas táctiles grandes (mínimo 44px), nunca acciones escondidas detrás de hover
  como único acceso.
- Un solo botón protagonista por pantalla. En el modal de palabra, el de audio.
- Textos en español rioplatense, en segunda persona ("Subí un libro").
- Nada de jerga técnica en la interfaz: "PDF escaneado", no "sin capa de texto".

## Paleta — papel cálido

Tinte sepia en los fondos y acento terracota. Definida en `globals.css` en oklch.

| Token | Claro | Oscuro |
|---|---|---|
| `--background` | `oklch(0.982 0.006 85)` | `oklch(0.195 0.012 65)` |
| `--card` / `--popover` | `oklch(0.996 0.004 90)` | `oklch(0.245 0.014 65)` |
| `--primary` | `oklch(0.58 0.13 48)` | `oklch(0.74 0.13 58)` |
| `--accent` | `oklch(0.93 0.028 72)` | `oklch(0.345 0.026 60)` |

Tokens propios del lector:

| Token | Para qué |
|---|---|
| `--reader-paper` | Fondo de la superficie de página |
| `--word-hover` | Resaltado al pasar por encima de una palabra |
| `--word-active` | Resaltado de la palabra abierta en el modal |
| `--page-invert` | `0`/`1`. Invierte el canvas del PDF en modo oscuro |

`--radius`: `0.75rem`.

## Tipografía

| Variable | Fuente | Uso |
|---|---|---|
| `--font-body` | Inter | Cuerpo, labels |
| `--font-display` | Geist | Títulos, la palabra en el modal |
| `--font-geist-mono` | Geist Mono | Fonética (`/ˈmɔːnɪŋ/`) |

El texto del libro usa las fuentes del propio archivo: en PDF las embebidas, en
EPUB las de la hoja de estilos del libro. La app no las pisa.

## Patrones propios

### Modal de palabra
Drawer inferior (vaul) en todos los tamaños, no un diálogo centrado en desktop:
tiene que sentirse igual en el celular, que es donde se va a usar. Con
`shouldScaleBackground` para el efecto iOS de fondo que retrocede.

Orden fijo del contenido, de lo más útil a lo menos: palabra → fonética →
traducción → significado → ejemplo → sinónimos → guardar.

### Palabras clickeables
Clase `.pw` con `data-word`. En el PDF viven dentro de la capa de texto de
pdf.js; en el EPUB, dentro del iframe. El resaltado es un fondo, nunca un cambio
de color de letra: en el PDF el texto es transparente sobre el canvas.

### Modo oscuro del PDF
Las páginas son imágenes blancas. Se invierten con
`filter: invert(1) hue-rotate(180deg)` vía `--page-invert`, que deja el papel
oscuro y la tinta clara sin tocar los colores de las ilustraciones más de la
cuenta.

## Lo que esta app no tiene

Sin formularios (por eso no aparecen zod ni react-hook-form), sin datos de
servidor (por eso no hay TanStack Query), sin autenticación. Todo el estado vive
en IndexedDB y localStorage.
