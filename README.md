# PokéIdle Compendium (PokeIdleLab)

Enciclopedia y optimizador **no oficial** para [poke.idleworld.online](https://poke.idleworld.online/).

## Características

- **Tier List** — Meta de jugadores, ranking por stats base y ranking Lv.1
- **Calculadora de Rareza + IVs** — Power real según calidad e IVs
- **Optimizador EXP/h** — Ranking de presas por XP/hora con calibración real
- **Base de objetos** — Catálogo de items del juego
- **Equipo guardado** — Hasta 6 Pokémon en localStorage

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint     # tsc --noEmit
```

## Estructura relevante

```
src/
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
