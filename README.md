# PokéIdle Compendium (PokeIdleLab)

Enciclopedia y optimizador **no oficial** para [poke.idleworld.online](https://poke.idleworld.online/), que se usa **dentro del juego** como extensión: se abre y se cierra con **Ctrl+P** (o la pestaña **PokeIdleLab** del borde derecho), y también se cierra con **Esc**.

## Características

- **Tier List** — Meta de jugadores, ranking por stats base y ranking Lv.1
- **Calculadora de Rareza + IVs** — Power real según calidad e IVs
- **Optimizador EXP/h** — Ranking de presas por XP/hora con calibración real
- **Base de objetos** — Catálogo de items del juego
- **Equipo guardado** — Hasta 6 Pokémon en localStorage
- **Analyzer de IV** sobre los tooltips del juego y **aviso de ventas** del Global Market

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

```bash
npm ci --legacy-peer-deps
npm run dev               # http://localhost:3000 (con el endpoint del bridge de PokeGrid)
npm run build:extension   # regenera extension/ (manifest.json + pokeidlelab.user.js)
npm run lint              # tsc --noEmit
```

- Antes de publicar, subí `version` en `package.json`: es la versión de la extensión y el `@version` de Tampermonkey, que solo actualiza si cambia.
- El Analyzer y el aviso de ventas viven en `scripts/`; la extensión los incluye al construirse, así que después de tocarlos hay que correr `npm run build:extension`.
- Para publicar desde otro repo (un fork, la versión estable): `$env:USERSCRIPT_OWNER='PosokaGaming'; $env:USERSCRIPT_REPO='PokeIdleLab'; npm run build:extension` (PowerShell).
- Los íconos salen de `node tools/make-icons.mjs`.

## Estructura relevante

```
extension/                # la extensión lista para cargar (generada)
scripts/                  # Analyzer de IV y aviso de ventas (userscripts)
src/
  userscript/main.tsx     # entrada de la extensión: monta la web en el juego
  components/
    HuntXpOptimizer.tsx   # UI del optimizador EXP/h
    shared/SpeciesSelect.tsx
  data/
    huntCombat.ts         # Motor puro de simulación de combate
    calculatorHelpers.ts  # Fórmulas de stats, tipos, zonas
    huntCalibration.ts    # Muestras reales de cadencia
    pokemonTierData.ts
    itemsData.ts
```

## Disclaimer

Proyecto fan-made. Pokémon es marca registrada de Nintendo / Game Freak.
No está afiliado a poke.idleworld.online.
