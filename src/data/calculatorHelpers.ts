/**
 * Fórmulas y utilidades matemáticas oficiales de https://poke.idleworld.online
 */

import { POKEMON_TIER_DATA, OfficialPokemon } from './pokemonTierData';

// Exponent for quality scaling in stats
export const QUALITY_EXP = 1.0;

// Quality bands and labels from official Poképedia (https://poke.idleworld.online/pokepedia/systems/quality)
export interface QualityBand {
  name: string;
  min: number;
  max: number;
  rangeLabel: string;
  badgeColor: string;
  isWild: boolean;
}

export const QUALITY_BANDS: QualityBand[] = [
  { name: 'Débil', min: 0.0, max: 1.0, rangeLabel: '< 1.0', badgeColor: 'bg-stone-700 text-stone-300', isWild: true },
  { name: 'Común', min: 1.0, max: 1.1, rangeLabel: '1.0–1.1', badgeColor: 'bg-slate-700 text-slate-200', isWild: true },
  { name: 'Poco común', min: 1.1, max: 1.3, rangeLabel: '1.1–1.3', badgeColor: 'bg-emerald-800 text-emerald-200', isWild: true },
  { name: 'Rara', min: 1.3, max: 1.5, rangeLabel: '1.3–1.5', badgeColor: 'bg-blue-800 text-blue-200', isWild: true },
  { name: 'Épica', min: 1.5, max: 1.7, rangeLabel: '1.5–1.7', badgeColor: 'bg-purple-800 text-purple-200', isWild: true },
  { name: 'Legendaria', min: 1.7, max: 2.0, rangeLabel: '1.7–2.0', badgeColor: 'bg-amber-700 text-amber-200', isWild: true },
  { name: 'Mítica', min: 2.0, max: 3.0, rangeLabel: '2.0–3.0', badgeColor: 'bg-rose-800 text-rose-200', isWild: false },
  { name: 'Anciana', min: 3.0, max: 4.0, rangeLabel: '3.0–4.0', badgeColor: 'bg-cyan-800 text-cyan-200', isWild: false },
  { name: 'Divina', min: 4.0, max: 99.0, rangeLabel: '4.0+', badgeColor: 'bg-fuchsia-700 text-fuchsia-100', isWild: false },
];

export function getQualityBand(quality: number): QualityBand {
  if (quality < 1.0) return QUALITY_BANDS[0]; // Débil (< 1.0)
  if (quality < 1.1) return QUALITY_BANDS[1]; // Común (1.0–1.1)
  if (quality < 1.3) return QUALITY_BANDS[2]; // Poco común (1.1–1.3)
  if (quality < 1.5) return QUALITY_BANDS[3]; // Rara (1.3–1.5)
  if (quality < 1.7) return QUALITY_BANDS[4]; // Épica (1.5–1.7)
  if (quality < 2.0) return QUALITY_BANDS[5]; // Legendaria (1.7–2.0)
  if (quality < 3.0) return QUALITY_BANDS[6]; // Mítica (2.0–3.0) -> ej. 2.40 es Mítica
  if (quality < 4.0) return QUALITY_BANDS[7]; // Anciana (3.0–4.0)
  return QUALITY_BANDS[8]; // Divina (4.0+)
}

/**
 * Fórmula oficial de stat individual:
 * stat = round( (base + 2 × growth) × nivel/100 × Calidad^exp )
 */
export function calculateStat(base: number, growth: number, level: number, quality: number): number {
  const raw = (base + 2 * growth) * (level / 100) * Math.pow(quality, QUALITY_EXP);
  return Math.max(1, Math.round(raw));
}

/**
 * Clasificación por generaciones de Pokémon:
 * Gen 1: 1 - 151 (Kanto) - Implementada en servidor activo
 * Gen 2: 152 - 251 (Johto) - Implementada en servidor activo
 * Gen 3: 252 - 386 (Hoenn) - En wiki, aún no en servidor activo
 * Gen 4+: 387+ (Sinnoh y posteriores) - En wiki, aún no en servidor activo
 */
export function getPokemonGeneration(id: number): number {
  // IDs 866–899: formas especiales Lv.150 (Brave/Furious/Psy/etc.) de Gen 1-2
  if ((id >= 866 && id <= 899) || (id >= 890 && id <= 913)) return 2;
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  return 4;
}

export interface GenerationOption {
  id: number;
  name: string;
  region: string;
  range: string;
  isLiveServer: boolean;
}

export const GENERATION_OPTIONS: GenerationOption[] = [
  { id: 1, name: 'Gen 1', region: 'Kanto', range: '#001 - #151', isLiveServer: true },
  { id: 2, name: 'Gen 2', region: 'Johto', range: '#152 - #251', isLiveServer: true },
  { id: 3, name: 'Gen 3', region: 'Hoenn', range: '#252 - #386', isLiveServer: false },
  { id: 4, name: 'Gen 4+', region: 'Sinnoh+', range: '#387+', isLiveServer: false },
];

/**
 * Fórmula oficial de Power total:
 * Power = (HP + Atk + Def + SpAtk + SpDef + Vel) × Calidad
 */
export function calculatePower(
  hp: number,
  atk: number,
  def: number,
  spAtk: number,
  spDef: number,
  speed: number,
  quality: number
): number {
  const sum = hp + atk + def + spAtk + spDef + speed;
  return Math.round(sum * quality);
}

function baseCurveXp(L: number): number {
  return L <= 1 ? 0 : Math.round((50 / 3) * (L ** 3 - 6 * L ** 2 + 17 * L - 12));
}

/**
 * Curva de XP oficial de https://poke.idleworld.online (totalXpForLevel del
 * cliente del juego), la misma para entrenador y Pokémon:
 *   - hasta Lv.150: round( 50/3 × (L³ − 6L² + 17L − 12) )
 *   - Lv.151-250: la base de Lv.150 más un tramo polinómico propio
 *   - desde Lv.251: el doble de la pendiente de la curva base
 * Comprobada contra el juego: 2.609.068.205 XP = Pokémon Lv.437 y
 * 3.282.781.168 XP = entrenador Lv.470.
 */
export function calculateTotalXp(level: number): number {
  const L = Math.floor(level);
  if (L <= 150) return baseCurveXp(L);
  const t = L - 150;
  if (t <= 100) {
    const tri = (t * (t + 1)) / 2;
    return Math.round(
      baseCurveXp(150) + 0.5 * tri ** 2 + ((t * (t + 1) * (2 * t + 1)) / 6) * 197.5 + tri * 25629 + 1087900 * t
    );
  }
  return Math.round(calculateTotalXp(250) + 2 * (baseCurveXp(L) - baseCurveXp(250)));
}

export function calculateXpToNextLevel(level: number): number {
  return calculateTotalXp(level + 1) - calculateTotalXp(level);
}

/** Nivel alcanzado con una XP total, y la XP dentro de ese nivel (cur) sobre la necesaria (max). */
export function getLevelProgress(totalXp: number): { level: number; cur: number; max: number } {
  let hi = 2;
  while (hi < 1e7 && calculateTotalXp(hi) <= totalXp) hi *= 2;
  let lo = Math.max(1, Math.floor(hi / 2));
  let level = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calculateTotalXp(mid) <= totalXp) {
      level = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const base = calculateTotalXp(level);
  return { level, cur: Math.max(0, totalXp - base), max: Math.max(1, calculateTotalXp(level + 1) - base) };
}

/**
 * Tabla de tipos y cálculo de ventaja elemental amplificada (+50% en poke.idleworld.online)
 */
const TYPE_CHART: Record<string, Record<string, number>> = {
  NORMAL: { ROCK: 0.5, GHOST: 0, STEEL: 0.5 },
  FIRE: { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 2, BUG: 2, ROCK: 0.5, DRAGON: 0.5, STEEL: 2 },
  WATER: { FIRE: 2, WATER: 0.5, GRASS: 0.5, GROUND: 2, ROCK: 2, DRAGON: 0.5 },
  GRASS: { FIRE: 0.5, WATER: 2, GRASS: 0.5, POISON: 0.5, GROUND: 2, FLYING: 0.5, BUG: 0.5, ROCK: 2, DRAGON: 0.5, STEEL: 0.5 },
  ELECTRIC: { WATER: 2, ELECTRIC: 0.5, GRASS: 0.5, GROUND: 0, FLYING: 2, DRAGON: 0.5 },
  ICE: { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 0.5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: 0.5 },
  FIGHTING: { NORMAL: 2, ICE: 2, POISON: 0.5, FLYING: 0.5, PSYCHIC: 0.5, BUG: 0.5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: 0.5 },
  POISON: { GRASS: 2, POISON: 0.5, GROUND: 0.5, ROCK: 0.5, GHOST: 0.5, STEEL: 0, FAIRY: 2 },
  GROUND: { FIRE: 2, ELECTRIC: 2, GRASS: 0.5, POISON: 2, FLYING: 0, BUG: 0.5, ROCK: 2, STEEL: 2 },
  FLYING: { ELECTRIC: 0.5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: 0.5, STEEL: 0.5 },
  PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5, DARK: 0, STEEL: 0.5 },
  BUG: { FIRE: 0.5, GRASS: 2, FIGHTING: 0.5, POISON: 0.5, FLYING: 0.5, PSYCHIC: 2, GHOST: 0.5, DARK: 2, STEEL: 0.5, FAIRY: 0.5 },
  ROCK: { FIRE: 2, ICE: 2, FIGHTING: 0.5, GROUND: 0.5, FLYING: 2, BUG: 2, STEEL: 0.5 },
  GHOST: { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: 0.5 },
  DRAGON: { DRAGON: 2, STEEL: 0.5, FAIRY: 0 },
  DARK: { FIGHTING: 0.5, PSYCHIC: 2, GHOST: 2, DARK: 0.5, FAIRY: 0.5 },
  STEEL: { FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, ICE: 2, ROCK: 2, STEEL: 0.5, FAIRY: 2 },
  FAIRY: { FIRE: 0.5, FIGHTING: 2, POISON: 0.5, DRAGON: 2, DARK: 2, STEEL: 0.5 }
};

/**
 * En poke.idleworld.online:
 * - x1.5 → x1.75
 * - x2.0 → x2.50
 * - x4.0 → x5.50
 * - Inmunidades (x0) y neutrales (x1) no cambian.
 * - Resistencias se dividen entre 1.5: x0.5 → x0.33, x0.25 → x0.17
 */
export function getAmplifiedMultiplier(atkType: string, defType1: string, defType2?: string | null): number {
  const atk = atkType.toUpperCase();
  const d1 = defType1.toUpperCase();
  const d2 = defType2 ? defType2.toUpperCase() : null;

  let baseMult1 = TYPE_CHART[atk]?.[d1] ?? 1.0;
  let baseMult2 = d2 ? (TYPE_CHART[atk]?.[d2] ?? 1.0) : 1.0;

  const rawMult = baseMult1 * baseMult2;

  if (rawMult === 0) return 0;
  if (rawMult === 1.0) return 1.0;
  if (rawMult >= 4.0) return 5.5;
  if (rawMult >= 2.0) return 2.5;
  if (rawMult > 1.0) return 1.75;
  if (rawMult <= 0.25) return 0.17;
  if (rawMult <= 0.5) return 0.33;

  return rawMult;
}

/**
 * Zonas oficiales de Caza organizadas por rango de nivel en poke.idleworld.online
 */
export interface HuntingZone {
  id: string;
  name: string;
  huntLevel: number;
  minPlayerLevel: number;
  badge: string;
  description: string;
  samplePokemon: string;
}

export const HUNTING_ZONES: HuntingZone[] = [
  {
    id: 'ALL',
    name: 'Todas las Zonas Permitidas (≤ Nv. Jugador)',
    huntLevel: 0,
    minPlayerLevel: 1,
    badge: 'Automático',
    description: 'Filtra todas las zonas a las que tu nivel actual tiene acceso legal.',
    samplePokemon: 'Todas las presas legales'
  },
  {
    id: 'ZONE_1',
    name: 'Zona 1: Pradera Inicial (Nv. 1)',
    huntLevel: 1,
    minPlayerLevel: 1,
    badge: 'Nv. 1',
    description: 'Rutas 1 y 2. Bichos y roedores iniciales con muy poca vida y defensa.',
    samplePokemon: 'Pidgey, Rattata, Caterpie, Weedle'
  },
  {
    id: 'ZONE_2',
    name: 'Zona 2: Bosque & Rutas Bajas (Nv. 10)',
    huntLevel: 10,
    minPlayerLevel: 10,
    badge: 'Nv. 10',
    description: 'Enemigos de Nv. 10 (XP base 68). ¡Compara defensas! Diglett (Def 25) y Spearow (Def 30) mueren mucho más rápido que Geodude (Def 100).',
    samplePokemon: 'Spearow, Diglett, Abra, Zubat, Sentret'
  },
  {
    id: 'ZONE_3',
    name: 'Zona 3: Rutas Medias & Cavernas (Nv. 20)',
    huntLevel: 20,
    minPlayerLevel: 20,
    badge: 'Nv. 20',
    description: 'Requiere Nivel 20+. Primeras cuevas y Pokémon de etapa intermedia.',
    samplePokemon: 'Geodude, Machop, Pikachu, Clefairy, Sandshrew'
  },
  {
    id: 'ZONE_4',
    name: 'Zona 4: Zonas Centrales (Nv. 30)',
    huntLevel: 30,
    minPlayerLevel: 30,
    badge: 'Nv. 30',
    description: 'Requiere Nivel 30+. Zonas volcánicas, centrales eléctricas y aguas abiertas.',
    samplePokemon: 'Growlithe, Ponyta, Gastly, Seel, Grimer, Voltorb'
  },
  {
    id: 'ZONE_5',
    name: 'Zona 5: Profundidades & Cavernas Bajas (Nv. 40)',
    huntLevel: 40,
    minPlayerLevel: 40,
    badge: 'Nv. 40',
    description: 'Requiere Nivel 40+. Zonas de caza de Pokémon de fase fósil y salvajes pesados.',
    samplePokemon: 'Rhyhorn, Cubone, Staryu, Scyther, Pinsir'
  },
  {
    id: 'ZONE_6',
    name: 'Zona 6: Rutas Avanzadas & Costa Marina (Nv. 50)',
    huntLevel: 50,
    minPlayerLevel: 50,
    badge: 'Nv. 50',
    description: 'Requiere Nivel 50+. Pokémon raros de alto valor de captura.',
    samplePokemon: 'Lapras, Eevee, Dratini, Omanyte, Kabuto'
  },
  {
    id: 'ZONE_7',
    name: 'Zona 7: Safari & Élite (Nv. 60–70)',
    huntLevel: 60,
    minPlayerLevel: 60,
    badge: 'Nv. 60–70',
    description: 'Requiere Nivel 60+. Pokémon evolucionados de alto nivel.',
    samplePokemon: 'Snorlax, evoluciones intermedias y finales'
  },
  {
    id: 'ZONE_8',
    name: 'Zona 8: Alta Competición (Nv. 80)',
    huntLevel: 80,
    minPlayerLevel: 80,
    badge: 'Nv. 80',
    description: 'Requiere Nivel 80+. Pilares del metajuego en su forma definitiva.',
    samplePokemon: 'Gyarados, Alakazam, Machamp, Gengar, Dragonite'
  },
  {
    id: 'ZONE_9',
    name: 'Zona 9: Endgame Supremo & Jefes (Nv. 100+)',
    huntLevel: 100,
    minPlayerLevel: 100,
    badge: 'Nv. 100+',
    description: 'El techo del juego. Legendarios, Megas y Jefes con HP masiva.',
    samplePokemon: 'Mewtwo, Moltres, Zapdos, Articuno, Jefes Nv. 100–600'
  }
];

export const SPECIAL_TYPES = ['FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK'];

export interface Level1Stats {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export interface Level1DamageReport {
  pokemon: OfficialPokemon;
  bestAttack: {
    name: string;
    type: string;
    power: number;
    learnLevel: number;
    tm?: string | null;
    hasStab: boolean;
    isSpecial: boolean;
  };
  hasStab: boolean;
  isSpecial: boolean;
  level1Stats: Level1Stats;
  offensiveStat: number; // Atk or SpAtk at level 1
  rawDamage: number; // Damage per hit
  estimatedDamage: number; // Alias for rawDamage
  dps: number; // Damage per second adjusted by attack interval
  dpsScore: number; // Alias for dps
  attackInterval: number; // seconds per attack
  lv1Tier: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
  isBaseStage: boolean;
  whyLv1Tier: string;
}

export interface Level1DamageFilterOptions {
  onlyBaseStages?: boolean;
  quality?: number;
  enemyDefense?: number;
  includeTmMoves?: boolean;
}

/**
 * Evalúa el daño real en Nivel 1 de un Pokémon considerando sus ataques iniciales (learnLevel <= 1),
 * bonificación STAB (x1.5) y estadísticas base a Nivel 1.
 */
export function calculateLevel1Damage(
  pokemon: OfficialPokemon,
  quality: number = 1.0,
  includeTm: boolean = false,
  enemyDefense: number = 30
): Level1DamageReport {
  const attacks = (pokemon.attacks || []).filter(
    (a) => a.learnLevel <= 1 && a.power > 0 && (includeTm || !a.tm)
  );

  let bestAttackRaw: { name: string; type: string; power: number; learnLevel: number; tm?: string | null };

  if (attacks.length > 0) {
    bestAttackRaw = [...attacks].sort((a, b) => b.power - a.power)[0];
  } else {
    // Si no tiene ataque directo a Nivel 1, toma el de menor nivel de aprendizaje o Placa / Placaje básico
    const lowest = (pokemon.attacks || [])
      .filter((a) => a.power > 0 && (includeTm || !a.tm))
      .sort((a, b) => a.learnLevel - b.learnLevel)[0];

    bestAttackRaw = lowest || { name: 'Tackle', type: 'NORMAL', power: 40, learnLevel: 1, tm: null };
  }

  const ivGrowth = 15 / 6;
  const pHp = calculateStat(pokemon.baseHp, ivGrowth, 1, quality);
  const pAtk = calculateStat(pokemon.baseAtk, ivGrowth, 1, quality);
  const pDef = calculateStat(pokemon.baseDef, ivGrowth, 1, quality);
  const pSpAtk = calculateStat(pokemon.baseSpAtk, ivGrowth, 1, quality);
  const pSpDef = calculateStat(pokemon.baseSpDef, ivGrowth, 1, quality);
  const pSpeed = calculateStat(pokemon.baseSpeed, ivGrowth, 1, quality);

  const isSpecial = SPECIAL_TYPES.includes(bestAttackRaw.type.toUpperCase());
  const offensiveStat = Math.max(1, isSpecial ? pSpAtk : pAtk);

  const hasStab =
    bestAttackRaw.type.toUpperCase() === pokemon.type1.toUpperCase() ||
    (pokemon.type2 ? bestAttackRaw.type.toUpperCase() === pokemon.type2.toUpperCase() : false);

  const stabMultiplier = hasStab ? 1.5 : 1.0;

  // Daño a Nivel 1 frente a la defensa indicada:
  // Fómula oficial: ((2 * 1 / 5 + 2) * Potencia * (Stat / Def)) / 50 + 2
  const rawDamageValue =
    (((2.4 * bestAttackRaw.power * (offensiveStat / Math.max(1, enemyDefense))) / 50 + 2) * stabMultiplier);
  const rawDamage = Math.round(rawDamageValue * 10) / 10;

  const attackInterval = Math.max(0.6, +(1.5 - pSpeed / 300).toFixed(2));
  const dps = Math.round((rawDamage / attackInterval) * 10) / 10;

  // Clasificación de Tier para Nivel 1:
  let lv1Tier: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' = 'C';
  let whyLv1Tier = '';

  if (bestAttackRaw.power >= 120 || rawDamage >= 15) {
    lv1Tier = 'S+';
    whyLv1Tier = `Ataque devastador a Nv. 1: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia${hasStab ? ' + STAB' : ''})`;
  } else if (bestAttackRaw.power >= 75 || rawDamage >= 9.5) {
    lv1Tier = 'S';
    whyLv1Tier = `Ataque superior a Nv. 1: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia${hasStab ? ' + STAB' : ''})`;
  } else if (bestAttackRaw.power >= 60 || rawDamage >= 7) {
    lv1Tier = 'A';
    whyLv1Tier = `Ataque fuerte inicial: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia${hasStab ? ' + STAB' : ''})`;
  } else if (bestAttackRaw.power >= 50 || rawDamage >= 5.2) {
    lv1Tier = 'B';
    whyLv1Tier = `Ataque sólido inicial: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia)`;
  } else if (bestAttackRaw.power >= 40) {
    lv1Tier = 'C';
    whyLv1Tier = `Ataque estándar básico: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia)`;
  } else {
    lv1Tier = 'D';
    whyLv1Tier = `Ataque débil o de baja potencia: ${bestAttackRaw.name} (${bestAttackRaw.power} Potencia)`;
  }

  const isBaseStage = Boolean(
    pokemon.shortTag.includes('Pre-Evolución') ||
    pokemon.shortTag.includes('Fase 1') ||
    pokemon.shortTag.includes('Bebé') ||
    pokemon.shortTag.includes('Inicial') ||
    (pokemon.evolveLevel !== null && pokemon.evolveLevel !== undefined)
  );

  const bestAttack = {
    ...bestAttackRaw,
    hasStab,
    isSpecial
  };

  const level1Stats: Level1Stats = {
    hp: pHp,
    atk: pAtk,
    def: pDef,
    spAtk: pSpAtk,
    spDef: pSpDef,
    speed: pSpeed
  };

  return {
    pokemon,
    bestAttack,
    hasStab,
    isSpecial,
    level1Stats,
    offensiveStat,
    rawDamage,
    estimatedDamage: rawDamage,
    dps,
    dpsScore: dps,
    attackInterval,
    lv1Tier,
    isBaseStage,
    whyLv1Tier
  };
}

/**
 * Calcula el ranking de daño a Nivel 1 de todos los Pokémon de la base de datos
 */
export function getAllLevel1DamageReports(
  options: Level1DamageFilterOptions = {}
): Level1DamageReport[] {
  const {
    onlyBaseStages = true,
    quality = 1.55,
    enemyDefense = 30,
    includeTmMoves = false
  } = options;

  let pool = POKEMON_TIER_DATA;
  if (onlyBaseStages) {
    pool = pool.filter((p) => {
      return (
        p.shortTag.includes('Pre-Evolución') ||
        p.shortTag.includes('Fase 1') ||
        p.shortTag.includes('Bebé') ||
        p.shortTag.includes('Inicial') ||
        (p.evolveLevel !== null && p.evolveLevel !== undefined) ||
        p.huntLevel <= 20
      );
    });
  }

  return pool.map((pokemon) =>
    calculateLevel1Damage(pokemon, quality, includeTmMoves, enemyDefense)
  );
}
