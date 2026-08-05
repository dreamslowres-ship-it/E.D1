# E.D

Editor de descripción para Free Fire.

## Uso

Abre la carpeta con un servidor local (Live Server, `npx serve`, etc.) y carga `index.html`.

> Si abres el archivo con `file://`, el navegador puede bloquear la carga de `app-data.json`.

## Límites del juego

- **50 caracteres** en total (los códigos también cuentan).
- Máximo **3 líneas** en la descripción del perfil.
- Formato válido: `[b]` `[i]` `[u]` `[s]` `[c]` y colores `[RRGGBB]`.
- Símbolos Unicode probados. Evita emojis de color (pueden fallar en algunos dispositivos).

## Archivos (todo en la raíz)

| Archivo | Rol |
|---------|-----|
| `index.html` | Interfaz |
| `estilo.css` | Estilos |
| `app.js` | Lógica |
| `app-data.json` | Colores, símbolos, plantillas, presets |
| `manifest.json` | PWA |

Historial y favoritos se guardan en el navegador (localStorage). Puedes exportar/importar JSON.

---

E.D
