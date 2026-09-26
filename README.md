# PokeIdleLab

Herramientas para [Poke Idle World](https://poke.idleworld.online) que se usan **dentro del juego**, como script de Tampermonkey: tier list, calculadora de rareza + IV, optimizador de XP/h, base de objetos, el Analyzer de IV sobre los tooltips y el aviso de ventas del Global Market.

## Instalar

1. Instalá [Tampermonkey](https://www.tampermonkey.net/) en Chrome, Edge o Firefox.
   En Chrome y Edge, abrí los detalles de la extensión Tampermonkey y activá **«Permitir scripts de usuario»**; sin eso no corre ningún script.
2. Abrí [pokeidlelab.user.js](https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/scripts/pokeidlelab.user.js) y aceptá **Instalar**.
3. Entrá al juego: aparece la pestaña **PokeIdleLab** en el borde derecho. Se cierra con **×** o **Esc**.

Tampermonkey la actualiza solo. Si tenías instalados los scripts sueltos del Analyzer o de ventas, desactivalos: la extensión ya los trae (y si quedan activos no se duplican).

## Desarrollo

```
npm ci --legacy-peer-deps
npm run dev                # la web en http://localhost:3000
npm run build:userscript   # regenera scripts/pokeidlelab.user.js
```

- Antes de publicar, subí `version` en `package.json`: es el `@version` del script y Tampermonkey solo actualiza si cambia.
- El Analyzer y el aviso de ventas viven en `scripts/pokeidlelab-iv.user.js` y `scripts/pokeidlelab-market-sales.user.js`; la extensión los incluye al construirse, así que después de tocarlos hay que correr `npm run build:userscript`.
- Para la versión estable, que se actualiza desde `Poke-Idle-Lab-Estable`: `$env:USERSCRIPT_REPO='Poke-Idle-Lab-Estable'; npm run build:userscript` (PowerShell).
- `iniciar-web.bat` sigue levantando la web local, sin Tampermonkey; necesita Node.js.
