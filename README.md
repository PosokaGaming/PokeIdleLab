# PokeIdleLab

Extensión para [Poke Idle World](https://poke.idleworld.online) que suma, **dentro del juego**, la tier list, la calculadora de rareza + IV, el optimizador de XP/h, la base de objetos, el Analyzer de IV sobre los tooltips y el aviso de ventas del Global Market.

En el juego aparece la pestaña **PokeIdleLab** en el borde derecho. Se cierra con **×** o **Esc**.

## Instalar como extensión (Chrome, Edge, Brave, Opera)

1. Bajá el repo: botón **Code → Download ZIP** y descomprimilo.
2. Abrí `chrome://extensions` (en Edge, `edge://extensions`) y activá el **Modo de desarrollador**.
3. **Cargar descomprimida** → elegí la carpeta `extension` del repo.

Para actualizar: bajá el repo de nuevo, reemplazá la carpeta y tocá **↻** en la tarjeta de la extensión.

## Instalar con Tampermonkey (se actualiza solo)

1. Instalá [Tampermonkey](https://www.tampermonkey.net/). En Chrome y Edge, en los detalles de Tampermonkey activá **«Permitir scripts de usuario»**.
2. Abrí [pokeidlelab.user.js](https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/extension/pokeidlelab.user.js) y aceptá **Instalar**.

Si tenías instalados los scripts sueltos del Analyzer o de ventas, desactivalos: la extensión ya los trae.

## Desarrollo

```
npm ci --legacy-peer-deps
npm run dev               # la web en http://localhost:3000
npm run build:extension   # regenera extension/ (manifest.json + pokeidlelab.user.js)
```

- Antes de publicar, subí `version` en `package.json`: es la versión de la extensión y el `@version` de Tampermonkey, que solo actualiza si cambia.
- El Analyzer y el aviso de ventas viven en `scripts/pokeidlelab-iv.user.js` y `scripts/pokeidlelab-market-sales.user.js`; la extensión los incluye al construirse, así que después de tocarlos hay que correr `npm run build:extension`.
- Para la versión estable, que Tampermonkey actualiza desde `Poke-Idle-Lab-Estable`: `$env:USERSCRIPT_REPO='Poke-Idle-Lab-Estable'; npm run build:extension` (PowerShell).
- Los íconos salen de `node tools/make-icons.mjs`.
- `iniciar-web.bat` sigue levantando la web local, sin extensión; necesita Node.js.
