import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Zap,
  Swords,
  Trophy,
  Search,
  Filter,
  Flame,
  ShieldCheck,
  AlertTriangle,
  Clock,
  TrendingUp,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Moon,
  Crosshair,
  Award,
  Layers,
  Heart,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Lock,
  Unlock,
  Info,
  MapPin,
  Shield,
  Coins,
  DollarSign
} from 'lucide-react';
import { POKEMON_TIER_DATA, OfficialPokemon } from '../data/pokemonTierData';
import { ITEMS_DATA } from '../data/itemsData';
import { getHuntCalibration, installHuntCalibrationBridge } from '../data/huntCalibration';
import { HuntCalibrationPanel } from './HuntCalibrationPanel';
import {
  calculateStat,
  calculatePower,
  calculateXpToNextLevel,
  getQualityBand,
  getAmplifiedMultiplier,
  QUALITY_BANDS,
  HUNTING_ZONES,
  HuntingZone,
  SPECIAL_TYPES,
  getPokemonGeneration,
  GENERATION_OPTIONS
} from '../data/calculatorHelpers';

interface HuntXpOptimizerProps {
  savedTeam?: OfficialPokemon[];
  initialPokemon?: OfficialPokemon | null;
  initialPlayerLevel?: number;
}

export type SortField =
  | 'xpPerHour'
  | 'elementalMultiplier'
  | 'timeToKill'
  | 'lowestDefense'
  | 'lowestHp'
  | 'lowestBulk' // HP × Defensa relevante (más preciso para "fácil de matar")
  | 'xpPerKill'
  | 'wildLevel'
  | 'potionSafety'
  | 'netProfit';

export type SortDirection = 'asc' | 'desc';

const normalize = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/**
 * Cadencia real de Hunt Analyzer.
 * No usamos tramos 1/2/3+ golpes para decidir la velocidad de la hunt.
 * Las sesiones reales aportan segundos por derrota; las muestras conocidas
 * se conservan como referencias y el resto usa un modelo continuo calibrado.
 */
const REAL_HUNT_REFERENCE_CYCLE_SECONDS = 8.70;
const REAL_HUNT_REFERENCE_WALK_SECONDS = 7.00;
const REAL_HUNT_REFERENCE_COMBAT_SECONDS = 0.60;
const POKEGRID_TM_POWER = 300;
const POKEGRID_TM_COOLDOWN_SECONDS = 10;
const POKEGRID_TM_TARGETS = 2;
const REAL_HUNT_AOE_TARGET_MULTIPLIER = 16.5 / 14;

type HuntMove = OfficialPokemon['attacks'][number] & { isCustom?: boolean };

interface HuntCombatProjection {
  wildMaxHp: number;
  wildDef: number;
  wildSpDef: number;
  targetDefense: number;
  effectiveBulk: number;
  bestMove: HuntMove;
  moveType: string;
  movePower: number;
  isSpecialMove: boolean;
  hasStab: boolean;
  stabMultiplier: number;
  attackerOffenseStat: number;
  finalDamagePerHit: number;
  continuousDamagePerHit: number;
  hitsToKill: number;
  continuousHitsToKill: number;
  combatTimeSeconds: number;
  totalCycleSeconds: number;
  killsPerHourExact: number;
  tmKillsPerHourExact: number;
  elementalMultiplier: number;
}

function getMoveIsSpecial(moveType: string): boolean {
  return SPECIAL_TYPES.includes(moveType.toUpperCase());
}

function getMoveStab(attacker: OfficialPokemon, moveType: string): number {
  const upper = moveType.toUpperCase();
  return upper === attacker.type1.toUpperCase() ||
    (attacker.type2 ? upper === attacker.type2.toUpperCase() : false)
    ? 1.5
    : 1;
}

function projectHuntCombat(
  attacker: OfficialPokemon,
  target: OfficialPokemon,
  level: number,
  ivTotal: number,
  quality: number,
  clanRank: number,
  clanType: string,
  hasAoeBonus: boolean,
  hasElementalTm: boolean,
  elementalTmType: string,
  forcedMove?: HuntMove
): HuntCombatProjection {
  const statGrowth = ivTotal / 6;
  const clanMatches =
    clanType !== 'NONE' &&
    (attacker.type1.toUpperCase() === clanType ||
      attacker.type2?.toUpperCase() === clanType);
  const clanBonusMultiplier = clanMatches ? 1 + clanRank * 0.06 : 1;

  const pAtk = Math.round(
    calculateStat(attacker.baseAtk, statGrowth, level, quality) * clanBonusMultiplier
  );
  const pSpAtk = Math.round(
    calculateStat(attacker.baseSpAtk, statGrowth, level, quality) * clanBonusMultiplier
  );
  const pSpeed = calculateStat(attacker.baseSpeed, statGrowth, level, quality);
  const attackIntervalSeconds = Math.max(0.6, 1.5 - pSpeed / 300);

  const wildLevel = target.huntLevel || 50;
  // Perfil normalizado de PokeGrid: defensor IV 96 / Quality 1.00.
  // La cadencia se recalibra con Hunt Analyzer cuando existe una muestra real.
  const WILD_IV_TOTAL = 96;
  const WILD_QUALITY = 1;
  const wildGrowth = WILD_IV_TOTAL / 6;
  const wildMaxHp =
    calculateStat(target.baseHp, wildGrowth, wildLevel, WILD_QUALITY) * 5;
  const wildDef = calculateStat(target.baseDef, wildGrowth, wildLevel, WILD_QUALITY);
  const wildSpDef = calculateStat(target.baseSpDef, wildGrowth, wildLevel, WILD_QUALITY);

  const naturalMoves = (attacker.attacks || [])
    .filter((move) => !move.tm && move.power > 0 && move.learnLevel <= level);
  const candidateMoves = forcedMove
    ? [forcedMove]
    : naturalMoves.length > 0
      ? naturalMoves
      : (attacker.attacks || []).filter((move) => !move.tm && move.power > 0);

  const evaluatedMoves = candidateMoves.map((move) => {
    const moveType = move.type.toUpperCase();
    const isSpecialMove = getMoveIsSpecial(moveType);
    const targetDefense = Math.max(1, isSpecialMove ? wildSpDef : wildDef);
    const attackerOffenseStat = isSpecialMove ? pSpAtk : pAtk;
    const elementalMultiplier = getAmplifiedMultiplier(
      moveType,
      target.type1,
      target.type2
    );
    const stabMultiplier = getMoveStab(attacker, moveType);
    const rawDamage =
      ((2 * level / 5 + 2) * move.power *
        (attackerOffenseStat / targetDefense)) / 50 + 2;
    const continuousDamagePerHit = Math.max(
      1,
      rawDamage * elementalMultiplier * stabMultiplier
    );
    return {
      move,
      moveType,
      isSpecialMove,
      targetDefense,
      attackerOffenseStat,
      elementalMultiplier,
      stabMultiplier,
      continuousDamagePerHit
    };
  });

  const best = [...evaluatedMoves].sort(
    (a, b) => b.continuousDamagePerHit - a.continuousDamagePerHit
  )[0];

  const fallbackMove: HuntMove = forcedMove || {
    name: 'Tackle',
    type: 'NORMAL',
    power: 40,
    learnLevel: 1,
    tm: null
  };
  const selected = best || {
    move: fallbackMove,
    moveType: fallbackMove.type,
    isSpecialMove: false,
    targetDefense: wildDef,
    attackerOffenseStat: pAtk,
    elementalMultiplier: getAmplifiedMultiplier(
      fallbackMove.type,
      target.type1,
      target.type2
    ),
    stabMultiplier: getMoveStab(attacker, fallbackMove.type),
    continuousDamagePerHit: 1
  };

  const finalDamagePerHit = Math.max(1, Math.round(selected.continuousDamagePerHit));
  const effectiveBulk = Math.round(wildMaxHp * (selected.targetDefense / 50));
  const hitsToKill = Math.max(1, Math.ceil(wildMaxHp / finalDamagePerHit));
  // En Hunt los ataques ocurren de uno en uno: no podemos convertir
  // 2.2 golpes en 2.2 impactos reales. El tiempo de combate depende de los
  // golpes enteros necesarios y de la cadencia del atacante.
  const continuousHitsToKill = Math.max(
    1,
    wildMaxHp / selected.continuousDamagePerHit
  );
  const combatHitsToKill = Math.max(1, Math.ceil(continuousHitsToKill));
  const combatTimeSeconds = combatHitsToKill * attackIntervalSeconds;

  const calibration = getHuntCalibration(target.id, wildLevel);
  // Las semillas históricas (incluida la referencia global de Hunt 150) no
  // deben sustituir el combate específico de cada presa. Solo una muestra real
  // del propio objetivo puede aportar una cadencia observada.
  const realCalibratedCycleSeconds =
    calibration?.source === 'real'
      ? calibration.cycleSeconds
      : undefined;

  // La referencia de 8.70 s es solo una muestra histórica, no un mínimo
  // global. Si se usa como suelo, todos los objetivos con combate < 1.70 s
  // quedan artificialmente clavados en 413.79 kills/h.
  const fallbackCycleSeconds =
    REAL_HUNT_REFERENCE_WALK_SECONDS + combatTimeSeconds;
  const normalCycleSeconds = Math.max(
    0.6,
    realCalibratedCycleSeconds !== undefined
      ? realCalibratedCycleSeconds
      : fallbackCycleSeconds
  );
  const aoeTargetMultiplier = hasAoeBonus
    ? REAL_HUNT_AOE_TARGET_MULTIPLIER
    : 1;
  const normalKillsPerHourExact =
    (3600 / normalCycleSeconds) * aoeTargetMultiplier;

  let tmKillsPerHourExact = 0;
  if (hasElementalTm) {
    const tmType = elementalTmType.toUpperCase();
    const tmIsSpecial = getMoveIsSpecial(tmType);
    const tmOffense = tmIsSpecial ? pSpAtk : pAtk;
    const tmEffectiveness = getAmplifiedMultiplier(
      tmType,
      target.type1,
      target.type2
    );
    const tmStab = getMoveStab(attacker, tmType);
    const tmDefense = tmIsSpecial ? wildSpDef : wildDef;
    const tmRawDamage =
      ((2 * level / 5 + 2) * POKEGRID_TM_POWER *
        (tmOffense / Math.max(1, tmDefense))) / 50 + 2;
    const tmDamageRatio = Math.min(
      1,
      Math.max(0, (tmRawDamage * tmEffectiveness * tmStab) / wildMaxHp)
    );
    tmKillsPerHourExact =
      (3600 / POKEGRID_TM_COOLDOWN_SECONDS) *
      POKEGRID_TM_TARGETS *
      tmDamageRatio;
  }

  return {
    wildMaxHp,
    wildDef,
    wildSpDef,
    targetDefense: selected.targetDefense,
    effectiveBulk,
    bestMove: { ...selected.move, isCustom: false },
    moveType: selected.moveType,
    movePower: selected.move.power,
    isSpecialMove: selected.isSpecialMove,
    hasStab: selected.stabMultiplier > 1,
    stabMultiplier: selected.stabMultiplier,
    attackerOffenseStat: selected.attackerOffenseStat,
    finalDamagePerHit,
    continuousDamagePerHit: selected.continuousDamagePerHit,
    hitsToKill,
    continuousHitsToKill,
    combatTimeSeconds,
    totalCycleSeconds: normalCycleSeconds,
    killsPerHourExact: normalKillsPerHourExact + tmKillsPerHourExact,
    tmKillsPerHourExact,
    elementalMultiplier: selected.elementalMultiplier
  };
}

/** Selector de Pokémon con búsqueda (igual que en la Calculadora de Poder) */
const SpeciesSelect: React.FC<{ value: number; onChange: (id: number) => void }> = ({ value, onChange }) => {
  const list = useMemo(() => [...POKEMON_TIER_DATA].sort((a, b) => a.id - b.id), []);
  const selected = list.find((p) => p.id === value) || list[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim().replace(/^#/, ''));
    if (!q) return list;
    const starts: OfficialPokemon[] = [];
    const contains: OfficialPokemon[] = [];
    list.forEach((p) => {
      const n = normalize(p.name);
      if (n.startsWith(q) || String(p.id).startsWith(q)) starts.push(p);
      else if (n.includes(q)) contains.push(p);
    });
    return [...starts, ...contains];
  }, [query, list]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (open && activeRef.current) activeRef.current.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (p: OfficialPokemon) => {
    onChange(p.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && results[active]) choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={open ? query : `#${selected.id} ${selected.name}`}
        placeholder="Escribe el nombre del Pokémon..."
        onFocus={(e) => {
          setOpen(true);
          setQuery('');
          setActive(0);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-8 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
          {results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>}
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              ref={i === active ? activeRef : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                i === active ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300'
              } ${p.id === selected.id ? 'font-bold' : ''}`}
            >
              <span className="font-mono text-slate-500 w-9">#{p.id}</span>
              <span>{p.name}</span>
              <span className="ml-auto text-[10px] text-slate-500">{p.playerMetaTier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const HuntXpOptimizer: React.FC<HuntXpOptimizerProps> = ({
  savedTeam = [],
  initialPokemon = null,
  initialPlayerLevel
}) => {
  useEffect(() => installHuntCalibrationBridge(), []);

  const [calibrationVersion, setCalibrationVersion] = useState(0);
  useEffect(() => {
    const onCalibrationUpdated = () => setCalibrationVersion((v) => v + 1);
    window.addEventListener('pokeidlelab:calibration-updated', onCalibrationUpdated);
    return () => window.removeEventListener('pokeidlelab:calibration-updated', onCalibrationUpdated);
  }, []);

  // Attacker configuration (calibrated with user Typhlosion profile by default)
  const [selectedAttackerId, setSelectedAttackerId] = useState<number>(
    initialPokemon?.id || (savedTeam.length > 0 ? savedTeam[0].id : 157) // Default to Typhlosion
  );
  const [playerLevel, setPlayerLevel] = useState<number>(initialPlayerLevel || 20);
  const [playerTotalIv, setPlayerTotalIv] = useState<number>(129); // 0-192 (calibrado a 129)
  const [playerQuality, setPlayerQuality] = useState<number>(1.29); // Quality (calibrado a 1.29x)
  const [clanRank, setClanRank] = useState<number>(0); // Rank 0
  const [clanType, setClanType] = useState<string>('NONE');
  const [hasAoeBonus, setHasAoeBonus] = useState<boolean>(false); // Sin TM de área por defecto
  const [hasElementalTm, setHasElementalTm] = useState<boolean>(false);
  const [isVipBonus, setIsVipBonus] = useState<boolean>(false); // VIP desactivado por defecto; el usuario lo activa explícitamente.

  // Level Restriction Rule: Player level restricts hunts accessible
  const [restrictToPlayerLevel, setRestrictToPlayerLevel] = useState<boolean>(true);

  // Generation filter: Gen 1, Gen 2, Gen 3, Gen 4+
  // Default to Gen 1 and 2 only (the ones currently implemented on live server)
  const [selectedGenerations, setSelectedGenerations] = useState<number[]>([1, 2]);

  const toggleGeneration = (genId: number) => {
    setSelectedGenerations((prev) => {
      if (prev.includes(genId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== genId);
      } else {
        return [...prev, genId].sort((a, b) => a - b);
      }
    });
  };

  // Hunting Zone selector state (Zona de Caza)
  const [selectedHuntingZone, setSelectedHuntingZone] = useState<string>('ALL');

  // Expanded row ID for inspection
  const [expandedTargetId, setExpandedTargetId] = useState<number | null>(null);

  const attackerPokemon = useMemo(() => {
    return POKEMON_TIER_DATA.find((p) => p.id === selectedAttackerId) || POKEMON_TIER_DATA[0];
  }, [selectedAttackerId]);

  // Selected move & custom power
  const [selectedMoveName, setSelectedMoveName] = useState<string>('');
  const [customMovePower, setCustomMovePower] = useState<number>(50);
  const [selectedMoveType, setSelectedMoveType] = useState<string>(attackerPokemon.type1);
  const [elementalTmType, setElementalTmType] = useState<string>(
    initialPokemon?.type1 || attackerPokemon.type1
  );

  // Available attacks learned by attacker
  const availableAttacks = useMemo(() => {
    const list = attackerPokemon.attacks || [];
    return [...list].sort((a, b) => a.learnLevel - b.learnLevel || b.power - a.power);
  }, [attackerPokemon]);

  // Active attack move being calculated
  const currentMove = useMemo(() => {
    if (selectedMoveName === 'custom') {
      return {
        name: 'Ataque Personalizado',
        type: selectedMoveType,
        power: customMovePower,
        learnLevel: 1,
        tm: null,
        isCustom: true
      };
    }

    const found = availableAttacks.find((a) => a.name === selectedMoveName);
    if (found) {
      return { ...found, isCustom: false };
    }

    // Auto-select smartest attack unlocked up to playerLevel:
    // If the attacker specializes in Special Attack (baseSpAtk > baseAtk),
    // prioritize Special moves (and STAB) so it exploits enemies with lower Def.Es.
    // If the attacker is Physical Attack, prioritize Physical moves (and STAB).
    const isSpecialAttacker = attackerPokemon.baseSpAtk > attackerPokemon.baseAtk;
    const learned = availableAttacks.filter((a) => a.learnLevel <= playerLevel && a.power > 0 && !a.tm);
    const candidateList = learned.length > 0 ? learned : availableAttacks.filter((a) => a.power > 0 && !a.tm);

    if (candidateList.length > 0) {
      const sortedCandidates = [...candidateList].sort((a, b) => {
        const aIsSpecial = SPECIAL_TYPES.includes(a.type.toUpperCase());
        const bIsSpecial = SPECIAL_TYPES.includes(b.type.toUpperCase());

        const aHasStab = a.type.toUpperCase() === attackerPokemon.type1.toUpperCase() ||
          (attackerPokemon.type2 ? a.type.toUpperCase() === attackerPokemon.type2.toUpperCase() : false);
        const bHasStab = b.type.toUpperCase() === attackerPokemon.type1.toUpperCase() ||
          (attackerPokemon.type2 ? b.type.toUpperCase() === attackerPokemon.type2.toUpperCase() : false);

        // Effective offense scaling for move
        const aOffense = aIsSpecial ? attackerPokemon.baseSpAtk : attackerPokemon.baseAtk;
        const bOffense = bIsSpecial ? attackerPokemon.baseSpAtk : attackerPokemon.baseAtk;

        // Synergy bonus if move category matches attacker specialty
        const aSynergy = (isSpecialAttacker === aIsSpecial) ? 1.25 : 1.0;
        const bSynergy = (isSpecialAttacker === bIsSpecial) ? 1.25 : 1.0;

        const aScore = a.power * (aHasStab ? 1.5 : 1.0) * (aOffense / 100) * aSynergy;
        const bScore = b.power * (bHasStab ? 1.5 : 1.0) * (bOffense / 100) * bSynergy;

        return bScore - aScore;
      });
      return { ...sortedCandidates[0], isCustom: false };
    }

    return availableAttacks[0] || { name: 'Tackle', type: 'NORMAL', power: 40, learnLevel: 1, tm: null, isCustom: false };
  }, [selectedMoveName, availableAttacks, playerLevel, selectedMoveType, customMovePower, attackerPokemon]);

  // Sync if initialPokemon or initialPlayerLevel changes
  React.useEffect(() => {
    if (initialPokemon) {
      setSelectedAttackerId(initialPokemon.id);
      setSelectedMoveType(initialPokemon.type1);
      setElementalTmType(initialPokemon.type1);
      setSelectedMoveName('');
    }
  }, [initialPokemon]);

  React.useEffect(() => {
    if (initialPlayerLevel) {
      setPlayerLevel(initialPlayerLevel);
    }
  }, [initialPlayerLevel]);

  // Sync move when attacker changes
  const handleAttackerChange = (id: number) => {
    setSelectedAttackerId(id);
    setSelectedMoveName('');
    const mon = POKEMON_TIER_DATA.find((p) => p.id === id);
    if (mon) {
      setSelectedMoveType(mon.type1);
      setElementalTmType(mon.type1);
    }
  };

  // Filter & Search Controls for Hunt Targets
  const [huntRangeFilter, setHuntRangeFilter] = useState<string>('ALL');
  const [specificHuntLevel, setSpecificHuntLevel] = useState<string>('ALL');
  const [searchTarget, setSearchTarget] = useState<string>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('ALL');

  // Tipo del Día: DESACTIVADO por defecto. Solo se aplica cuando el usuario
  // selecciona manualmente un tipo en el filtro. Nunca se activa automáticamente.
  const [dailyTypeBonus, setDailyTypeBonus] = useState<string>('NONE');

  // Sorting: Field & Direction (Ascending / Descending)
  const [sortBy, setSortBy] = useState<SortField>('xpPerHour');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [maxResults, setMaxResults] = useState<number>(30);

  const typesList = [
    'ALL', 'NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE',
    'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG',
    'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'
  ];

  const dailyBonusTypes = [
    'NONE', 'NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE',
    'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG',
    'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'
  ];

  const huntLevelsList = ['ALL', '1', '10', '20', '30', '40', '50', '60', '70', '80', '100', '120', '150', '200', '600'];

  // Handle column header clicks to toggle sort & direction
  const handleColumnSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      if (
        field === 'timeToKill' ||
        field === 'potionSafety' ||
        field === 'lowestDefense' ||
        field === 'lowestHp' ||
        field === 'lowestBulk'
      ) {
        // Menos tiempo, menos pociones, menor defensa/HP/bulk = más fácil de matar → empezar ascendente
        setSortDirection('asc');
      } else {
        // Higher XP, higher effectiveness, higher level -> start descending
        setSortDirection('desc');
      }
    }
  };

  // Stats del atacante. El bono de clan solo se aplica si el elemento coincide.
  const attackerStats = useMemo(() => {
    const statGrowth = playerTotalIv / 6;
    const clanMatches =
      clanType !== 'NONE' &&
      (attackerPokemon.type1.toUpperCase() === clanType ||
        attackerPokemon.type2?.toUpperCase() === clanType);
    const clanBonusMultiplier = clanMatches ? 1 + clanRank * 0.06 : 1;
    const pHp = calculateStat(attackerPokemon.baseHp, statGrowth, playerLevel, playerQuality);
    const pAtk = Math.round(calculateStat(attackerPokemon.baseAtk, statGrowth, playerLevel, playerQuality) * clanBonusMultiplier);
    const pDef = Math.round(calculateStat(attackerPokemon.baseDef, statGrowth, playerLevel, playerQuality) * clanBonusMultiplier);
    const pSpAtk = Math.round(calculateStat(attackerPokemon.baseSpAtk, statGrowth, playerLevel, playerQuality) * clanBonusMultiplier);
    const pSpDef = Math.round(calculateStat(attackerPokemon.baseSpDef, statGrowth, playerLevel, playerQuality) * clanBonusMultiplier);
    const pSpeed = calculateStat(attackerPokemon.baseSpeed, statGrowth, playerLevel, playerQuality);
    const power = calculatePower(pHp, pAtk, pDef, pSpAtk, pSpDef, pSpeed, playerQuality);
    const moveType = ('isCustom' in currentMove && currentMove.isCustom) ? selectedMoveType : currentMove.type;
    const movePower = currentMove.power || 40;
    const isSpecialMove = getMoveIsSpecial(moveType);
    const hasStab = getMoveStab(attackerPokemon, moveType) > 1;
    const stabMultiplier = hasStab ? 1.5 : 1;
    const attackerOffenseStat = isSpecialMove ? pSpAtk : pAtk;
    const attackIntervalSeconds = Math.max(0.6, 1.5 - pSpeed / 300);

    return {
      pHp, pAtk, pDef, pSpAtk, pSpDef, pSpeed, power,
      clanBonusMultiplier, attackIntervalSeconds, moveType, movePower,
      isSpecialMove, hasStab, stabMultiplier, attackerOffenseStat
    };
  }, [attackerPokemon, playerTotalIv, playerLevel, playerQuality, clanRank, clanType, currentMove, selectedMoveType]);

  // Fast map of item prices from itemsData for accurate loot & profit estimation
  const itemPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    ITEMS_DATA.forEach((it) => {
      map.set(it.name.toLowerCase(), it.npcPrice || 1);
    });
    return map;
  }, []);

  // 1. Simulación estilo PokeGrid: mejor movimiento por presa + cadencia continua.
  const allSimulatedTargets = useMemo(() => {
    const forcedMove =
      selectedMoveName === 'custom'
        ? {
            name: 'Ataque Personalizado',
            type: selectedMoveType,
            power: customMovePower,
            learnLevel: 1,
            tm: null,
            isCustom: true
          }
        : selectedMoveName
          ? ({ ...currentMove, isCustom: false } as HuntMove)
          : undefined;

    return POKEMON_TIER_DATA.map((target) => {
      const combat = projectHuntCombat(
        attackerPokemon,
        target,
        playerLevel,
        playerTotalIv,
        playerQuality,
        clanRank,
        clanType,
        hasAoeBonus,
        hasElementalTm,
        elementalTmType,
        forcedMove
      );

      const wildLevel = target.huntLevel || 50;
      const isLevelLocked = wildLevel > playerLevel;
      // Tipo del Día es un bonus EXPLÍCITO y opt-in:
      // - NONE (valor inicial) = 0% para TODAS las especies.
      // - Solo el tipo seleccionado recibe +20%.
      // - Se compara contra type1/type2 de la presa, nunca de forma global.
      // - Cualquier valor inválido se trata como NONE para evitar aplicar
      //   accidentalmente el bonus durante una calibración o al restaurar estado.
      const selectedDailyType =
        dailyTypeBonus !== 'NONE' &&
        dailyBonusTypes.includes(dailyTypeBonus)
          ? dailyTypeBonus.toUpperCase()
          : null;
      const targetType1 = target.type1?.toUpperCase() ?? '';
      const targetType2 = target.type2?.toUpperCase() ?? '';
      const hasDailyTypeBonus =
        selectedDailyType !== null &&
        (targetType1 === selectedDailyType || targetType2 === selectedDailyType);
      const dailyXpMult = hasDailyTypeBonus ? 1.2 : 1;
      const vipXpMult = isVipBonus ? 1.5 : 1;
      // La XP por kill sale exclusivamente de la recompensa base del objetivo.
      // Los eventos temporales se aplican manualmente fuera de esta calculadora.
      const baseXp = Math.max(0, Number(target.experience) || 0);
      const xpPerKillExact = baseXp * vipXpMult * dailyXpMult;
      const xpPerKill = Math.round(xpPerKillExact);
      const xpPerHourExact =
        combat.killsPerHourExact *
        xpPerKillExact;
      const xpPerHour = Math.round(xpPerHourExact);

      let defenseTier: 'fragile' | 'medium' | 'tank' = 'medium';
      let defenseLabel = 'Bulk Medio';
      if (combat.effectiveBulk <= 180) {
        defenseTier = 'fragile';
        defenseLabel = 'Muy Frágil (Papel)';
      } else if (combat.effectiveBulk >= 420) {
        defenseTier = 'tank';
        defenseLabel = 'Tanque Duro';
      }

      const wildRawOffense = Math.max(
        calculateStat(target.baseAtk, 96 / 6, wildLevel, 1),
        calculateStat(target.baseSpAtk, 96 / 6, wildLevel, 1)
      );
      const wildVsPlayerMultiplier = getAmplifiedMultiplier(
        target.type1,
        attackerPokemon.type1,
        attackerPokemon.type2
      );
      const rawWildDmg =
        ((2 * wildLevel / 5 + 2) * 50 *
          (wildRawOffense / Math.max(1, attackerStats.pDef))) / 50 + 2;
      const wildDamagePerHit = Math.max(
        1,
        Math.round(rawWildDmg * 1.8 * wildVsPlayerMultiplier)
      );

      const timeToKillSeconds = +Math.max(
        0.6,
        combat.totalCycleSeconds - REAL_HUNT_REFERENCE_WALK_SECONDS
      ).toFixed(1);
      const wildHitsDealt =
        combat.hitsToKill === 1 ? 0 : Math.max(0, Math.floor(timeToKillSeconds / 1.5));
      const totalDamageTakenPerKill = wildHitsDealt * wildDamagePerHit;

      let potionsPer100Kills = Math.ceil((totalDamageTakenPerKill * 100) / 200);
      if (combat.hitsToKill >= 3) potionsPer100Kills = Math.max(potionsPer100Kills, 40);
      else if (combat.hitsToKill === 2) potionsPer100Kills = Math.max(potionsPer100Kills, 15);

      let expectedLootValuePerKill = 0;
      const dropsBreakdown: Array<{ name: string; chance: number; avgQty: number; unitPrice: number; totalValue: number }> = [];
      for (const drop of target.loot || []) {
        if (drop.chance > 0) {
          const avgQty = (drop.min + drop.max) / 2;
          const unitPrice = itemPriceMap.get(drop.name.toLowerCase()) || 1;
          const expectedQty = (drop.chance / 100) * avgQty;
          const expectedVal = expectedQty * unitPrice;
          expectedLootValuePerKill += expectedVal;
          dropsBreakdown.push({ name: drop.name, chance: drop.chance, avgQty, unitPrice, totalValue: expectedVal });
        }
      }

      const captureValuePerKill = (target.priceNpc || 1500) / 47;
      const captureValuePerHour = Math.round(combat.killsPerHourExact * captureValuePerKill);
      // El +20% de loot usa exactamente la misma condición que el +20% XP:
      // solo la especie cuyo type1/type2 coincide con el tipo seleccionado.
      const dailyLootMult = hasDailyTypeBonus ? 1.2 : 1;
      const grossLootPerHour = Math.round(
        combat.killsPerHourExact * expectedLootValuePerKill * dailyLootMult
      );
      const BALL_COST_PER_KILL = 90;
      const POTION_UNIT_COST = 75;
      const potionCostPerKill = (potionsPer100Kills / 100) * POTION_UNIT_COST;
      const supplyPerKill = Math.max(BALL_COST_PER_KILL, potionCostPerKill + BALL_COST_PER_KILL);
      const supplyCostPerHour = Math.round(combat.killsPerHourExact * supplyPerKill);
      const netProfitPerHour = Math.round(grossLootPerHour + captureValuePerHour - supplyCostPerHour);

      let safetyGrade: 'safe' | 'moderate' | 'danger' = 'safe';
      let safetyLabel = '100% Seguro (0 Pociones)';
      if (potionsPer100Kills <= 3) {
        safetyGrade = 'safe'; safetyLabel = 'Seguro (<3 Poc/100)';
      } else if (potionsPer100Kills <= 12) {
        safetyGrade = 'moderate'; safetyLabel = 'Consumo Moderado';
      } else {
        safetyGrade = 'danger'; safetyLabel = 'Riesgo en Siesta Zzz';
      }

      return {
        target, wildLevel, isLevelLocked,
        wildMaxHp: combat.wildMaxHp,
        wildDef: combat.wildDef,
        wildSpDef: combat.wildSpDef,
        targetDefense: combat.targetDefense,
        effectiveBulk: combat.effectiveBulk,
        bestMove: combat.bestMove.name,
        defenseTier, defenseLabel,
        finalDamagePerHit: combat.finalDamagePerHit,
        hitsToKill: combat.hitsToKill,
        timeToKillSeconds,
        elementalMultiplier: combat.elementalMultiplier,
        killsPerHour: Math.round(combat.killsPerHourExact),
        killsPerMinute: +(combat.killsPerHourExact / 60).toFixed(1),
        killsPerHourExact: combat.killsPerHourExact,
        xpPerKill, xpPerHour, xpPerHourExact,
        wildDamagePerHit, totalDamageTakenPerKill,
        potionsPer100Kills, safetyGrade, safetyLabel,
        expectedLootValuePerKill, dropsBreakdown,
        grossLootPerHour, supplyCostPerHour, netProfitPerHour,
        hasDailyTypeBonus,
        tmKillsPerHour: Math.round(combat.tmKillsPerHourExact),
        continuousDamagePerHit: combat.continuousDamagePerHit,
        aoeTargetMultiplier: hasAoeBonus ? REAL_HUNT_AOE_TARGET_MULTIPLIER : 1,
        usedAutoMove: !forcedMove
      };
    });
  }, [
    attackerPokemon, playerLevel, playerTotalIv, playerQuality,
    clanRank, clanType, hasAoeBonus, hasElementalTm, elementalTmType,
    isVipBonus, itemPriceMap, dailyTypeBonus, selectedMoveName,
    selectedMoveType, customMovePower, currentMove, attackerStats.pDef,
    calibrationVersion
  ]);

  // 2. Filtered and Sorted Targets for the detailed table below
  const rankedTargets = useMemo(() => {
    return allSimulatedTargets.filter((res) => {
      // 0. Generation filter (Gen 1, Gen 2, Gen 3, Gen 4+)
      const targetGen = getPokemonGeneration(res.target.id);
      if (!selectedGenerations.includes(targetGen)) return false;

      // 1. Strict Level Restriction Rule: Player cannot fight Pokemon of level > playerLevel
      if (restrictToPlayerLevel && res.wildLevel > playerLevel) {
        return false;
      }

      // 2. Hunting Zone Filter (Zona de Caza selector)
      if (selectedHuntingZone !== 'ALL') {
        const zone = HUNTING_ZONES.find((z) => z.id === selectedHuntingZone);
        if (zone && zone.huntLevel > 0) {
          if (res.target.huntLevel !== zone.huntLevel) return false;
        }
      }

      // 3. Hunt Range filter
      if (huntRangeFilter !== 'ALL') {
        const h = res.target.huntLevel;
        if (huntRangeFilter === '1-20' && (h < 1 || h > 20)) return false;
        if (huntRangeFilter === '30-40' && (h < 30 || h > 40)) return false;
        if (huntRangeFilter === '50-60' && (h < 50 || h > 60)) return false;
        if (huntRangeFilter === '80' && h !== 80) return false;
        if (huntRangeFilter === '100+' && h < 100) return false;
      }

      // 4. Specific level filter
      if (specificHuntLevel !== 'ALL') {
        if (res.target.huntLevel !== Number(specificHuntLevel)) return false;
      }

      // 5. Target Type filter
      if (targetTypeFilter !== 'ALL') {
        const matchesType =
          res.target.type1.toUpperCase() === targetTypeFilter ||
          res.target.type2?.toUpperCase() === targetTypeFilter;
        if (!matchesType) return false;
      }

      // 6. Search query
      if (searchTarget.trim()) {
        const q = searchTarget.toLowerCase();
        const matches =
          res.target.name.toLowerCase().includes(q) ||
          res.target.type1.toLowerCase().includes(q) ||
          (res.target.type2 && res.target.type2.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'xpPerHour') {
        comparison = a.xpPerHour - b.xpPerHour;
      } else if (sortBy === 'elementalMultiplier') {
        comparison = a.elementalMultiplier - b.elementalMultiplier;
      } else if (sortBy === 'timeToKill') {
        comparison = a.timeToKillSeconds - b.timeToKillSeconds;
      } else if (sortBy === 'lowestDefense') {
        comparison = a.targetDefense - b.targetDefense;
      } else if (sortBy === 'lowestHp') {
        comparison = a.wildMaxHp - b.wildMaxHp;
      } else if (sortBy === 'lowestBulk') {
        // Menor bulk efectivo (HP × Def) = más fácil de matar de verdad
        comparison = a.effectiveBulk - b.effectiveBulk;
      } else if (sortBy === 'xpPerKill') {
        comparison = a.xpPerKill - b.xpPerKill;
      } else if (sortBy === 'wildLevel') {
        comparison = a.wildLevel - b.wildLevel;
      } else if (sortBy === 'potionSafety') {
        comparison = a.potionsPer100Kills - b.potionsPer100Kills;
      } else if (sortBy === 'netProfit') {
        // Ordenar por loot real (gross) en lugar del neto
        comparison = a.grossLootPerHour - b.grossLootPerHour;
      }

      const primary = sortDirection === 'asc' ? comparison : -comparison;
      if (primary !== 0) return primary;

      // Intelligent secondary tiebreakers (consistent across all sorts):
      // 1. Higher XP per hour (xpPerHour)
      if (b.xpPerHour !== a.xpPerHour) {
        return b.xpPerHour - a.xpPerHour;
      }
      // 2. Higher elemental multiplier (2.5x > 1.0x)
      if (b.elementalMultiplier !== a.elementalMultiplier) {
        return b.elementalMultiplier - a.elementalMultiplier;
      }
      // 3. Lower time to kill (faster kill)
      if (a.timeToKillSeconds !== b.timeToKillSeconds) {
        return a.timeToKillSeconds - b.timeToKillSeconds;
      }
      // 4. Lower effective bulk (HP × Def) — más preciso que solo defensa
      if (a.effectiveBulk !== b.effectiveBulk) {
        return a.effectiveBulk - b.effectiveBulk;
      }
      // 5. Higher damage per hit
      return b.finalDamagePerHit - a.finalDamagePerHit;
    });
  }, [
    allSimulatedTargets,
    selectedGenerations,
    restrictToPlayerLevel,
    playerLevel,
    selectedHuntingZone,
    huntRangeFilter,
    specificHuntLevel,
    targetTypeFilter,
    searchTarget,
    sortBy,
    sortDirection
  ]);

  // 3. Top #1 Recommendation ("Mejor Pokémon para Farmear")
  // Strict rules:
  // - Respects selectedGenerations (defaults to Gen 1 and Gen 2 live on server; ignores Gen 3/4+ like Petilil unless enabled).
  // - Never recommend underleveled mobs (e.g. at Lv 20, do NOT pick Lv 10 or Lv 1 mobs!).
  //   Always targets the highest unlocked hunting tier appropriate for the player's level (or the selected zone).
  // - Always picks the Pokémon with MAXIMUM elemental effectiveness (x4.0 > x2.0 > x1.5 > x1.0)
  //   and within that effectiveness tier, the highest XP per hour (fastest TTK / most XP gained).
  const topTarget = useMemo(() => {
    if (allSimulatedTargets.length === 0) return null;

    // Filter to targets that match selected generations and are not locked
    let candidates = allSimulatedTargets.filter(
      (t) => !t.isLevelLocked && selectedGenerations.includes(getPokemonGeneration(t.target.id))
    );

    if (candidates.length === 0) {
      candidates = allSimulatedTargets.filter((t) => !t.isLevelLocked);
      if (candidates.length === 0) return allSimulatedTargets[0];
    }

    // Si el usuario eligió zona o nivel concreto, respetarlo
    if (selectedHuntingZone !== 'ALL') {
      const zone = HUNTING_ZONES.find((z) => z.id === selectedHuntingZone);
      if (zone && zone.huntLevel > 0) {
        const zoneCandidates = candidates.filter((t) => t.target.huntLevel === zone.huntLevel);
        if (zoneCandidates.length > 0) {
          candidates = zoneCandidates;
        }
      }
    } else if (specificHuntLevel !== 'ALL') {
      const lvlNum = Number(specificHuntLevel);
      const lvlCandidates = candidates.filter((t) => t.target.huntLevel === lvlNum);
      if (lvlCandidates.length > 0) {
        candidates = lvlCandidates;
      }
    }

    // Si no hay filtro de zona/nivel: NO forzar el hunt level máximo.
    // Elegimos el mejor XP/h real entre TODAS las hunts desbloqueadas
    // (así un Venomoth 2.5x de hunt 60 gana a un Octillery 0.33x de hunt 70).

    if (candidates.length === 0) return null;

    // Orden para el #1:
    // 1º Mayor XP/h
    // 2º Mayor efectividad elemental (prioriza debilidades)
    // 3º Menor tiempo de kill
    // 4º Menor bulk efectivo
    // 5º Mayor daño por golpe
    const sorted = [...candidates].sort((a, b) => {
      if (b.xpPerHour !== a.xpPerHour) {
        return b.xpPerHour - a.xpPerHour;
      }
      if (b.elementalMultiplier !== a.elementalMultiplier) {
        return b.elementalMultiplier - a.elementalMultiplier;
      }
      if (a.timeToKillSeconds !== b.timeToKillSeconds) {
        return a.timeToKillSeconds - b.timeToKillSeconds;
      }
      if (a.effectiveBulk !== b.effectiveBulk) {
        return a.effectiveBulk - b.effectiveBulk;
      }
      return b.finalDamagePerHit - a.finalDamagePerHit;
    });

    return sorted[0];
  }, [allSimulatedTargets, selectedHuntingZone, specificHuntLevel, selectedGenerations]);

  // Next level XP curve calculation
  const xpNeededForNextLevel = useMemo(() => {
    return calculateXpToNextLevel(playerLevel);
  }, [playerLevel]);

  const minutesToNextLevel = useMemo(() => {
    if (!topTarget || topTarget.xpPerHour <= 0) return 0;
    return Math.max(1, Math.round((xpNeededForNextLevel / topTarget.xpPerHour) * 60));
  }, [topTarget, xpNeededForNextLevel]);

  const eightHourOfflineXp = useMemo(() => {
    if (!topTarget) return 0;
    return Math.round(topTarget.xpPerHour * 8);
  }, [topTarget]);

  const variantSpriteIds: Record<number, number> = {
    890: 247, 891: 107, 892: 97, 893: 232, 894: 241, 895: 203,
    896: 91, 897: 28, 898: 87, 899: 164, 900: 160, 901: 34,
    902: 200, 903: 154, 904: 221, 905: 210, 906: 26, 907: 127,
    908: 106, 909: 40, 910: 65, 911: 76, 912: 105, 913: 31
  };

  const getPokemonSprite = (id: number) => {
    const spriteId = variantSpriteIds[id] ?? id;
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${spriteId}.png`;
  };

  const getTypeBadgeStyle = (type: string) => {
    const colors: Record<string, string> = {
      FIRE: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      WATER: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      GRASS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      ELECTRIC: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      ICE: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      FIGHTING: 'bg-red-500/20 text-red-300 border-red-500/30',
      POISON: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      GROUND: 'bg-amber-600/20 text-amber-300 border-amber-600/30',
      FLYING: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      PSYCHIC: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
      BUG: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
      ROCK: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
      GHOST: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
      DRAGON: 'bg-indigo-600/20 text-indigo-200 border-indigo-600/30',
      DARK: 'bg-neutral-600/20 text-neutral-300 border-neutral-600/30',
      STEEL: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
      FAIRY: 'bg-rose-400/20 text-rose-200 border-rose-400/30',
      NORMAL: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
    return colors[type.toUpperCase()] || 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="space-y-6">
      <HuntCalibrationPanel />
      {/* Top Section: Attacker Setup & Hero #1 Target */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Attacker (Player) Controls - 7 cols */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0d1017] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              <h3 className="text-sm font-bold text-white">Tu Pokémon Atacante</h3>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              Power: {attackerStats.power.toLocaleString()}
            </span>
          </div>

          {/* Quick Select from Saved Team */}
          {savedTeam.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                Usar miembro de tu equipo guardado:
              </span>
              <div className="flex flex-wrap gap-2">
                {savedTeam.map((mon) => (
                  <button
                    key={mon.id}
                    type="button"
                    onClick={() => handleAttackerChange(mon.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      selectedAttackerId === mon.id
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <img
                      src={getPokemonSprite(mon.id)}
                      alt={mon.name}
                      className="w-5 h-5 object-contain"
                    />
                    <span>{mon.name}</span>
                    <span className="text-[10px] opacity-60 font-mono">#{mon.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pokemon Selector */}
          <div>
            <div className="flex items-center gap-3">
              <img
                src={getPokemonSprite(attackerPokemon.id)}
                alt={attackerPokemon.name}
                className="w-14 h-14 object-contain bg-slate-900/80 rounded-xl border border-slate-800 p-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <SpeciesSelect
                  value={selectedAttackerId}
                  onChange={(id) => handleAttackerChange(id)}
                />
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${getTypeBadgeStyle(attackerPokemon.type1)}`}>
                    {attackerPokemon.type1}
                  </span>
                  {attackerPokemon.type2 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${getTypeBadgeStyle(attackerPokemon.type2)}`}>
                      {attackerPokemon.type2}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Level & IVs */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-slate-400 font-medium text-xs">Nivel de tu Pokémon</label>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono font-bold">
                  Hunts desbloqueadas: ≤ Nv. {playerLevel}
                </span>
              </div>
              <span className="font-mono text-white font-bold text-sm">Nv. {playerLevel}</span>
            </div>
            {/* Sin nivel máximo: ni los Pokémon ni los entrenadores tienen tope */}
            <div className="flex items-center gap-1.5">
              {[-10, -1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPlayerLevel(Math.max(1, playerLevel + d))}
                  className="px-2 py-1 rounded border border-slate-800 bg-slate-900 text-xs text-slate-300 hover:text-amber-300 hover:border-amber-500/50 font-mono"
                >
                  {d}
                </button>
              ))}
              <input
                type="number"
                min={1}
                step={1}
                value={playerLevel}
                onChange={(e) => setPlayerLevel(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-center text-sm font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
              />
              {[1, 10].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPlayerLevel(playerLevel + d)}
                  className="px-2 py-1 rounded border border-slate-800 bg-slate-900 text-xs text-slate-300 hover:text-amber-300 hover:border-amber-500/50 font-mono"
                >
                  +{d}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="text-slate-400 font-medium text-xs">IVs Totales (0-192)</label>
              <input
                type="number"
                min="0"
                max="192"
                step="1"
                value={playerTotalIv}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setPlayerTotalIv(Number.isFinite(value) ? Math.min(192, Math.max(0, Math.round(value))) : 0);
                }}
                className="w-16 rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-center font-mono text-amber-400 font-bold text-xs focus:outline-none focus:border-amber-500"
              />
              <span className="font-mono text-slate-500 text-xs">/ 192</span>
            </div>
            <input
              type="range"
              min="0"
              max="192"
              step="1"
              value={playerTotalIv}
              onChange={(e) => setPlayerTotalIv(Math.min(192, Math.max(0, Number(e.target.value))))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Quality & Clan */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 font-medium text-xs">Calidad (Quality)</label>
              <span className="font-mono text-white font-bold text-xs">
                {playerQuality.toFixed(2)}x · {getQualityBand(playerQuality).name} ({getQualityBand(playerQuality).rangeLabel})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.8"
                max="4.5"
                step="0.01"
                value={playerQuality}
                onChange={(e) => setPlayerQuality(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <input
                type="number"
                min="0.8"
                max="4.5"
                step="0.01"
                value={playerQuality}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setPlayerQuality(Number.isFinite(value) ? Math.min(4.5, Math.max(0.8, value)) : 0.8);
                }}
                className="w-16 rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-center font-mono text-white font-bold text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="text-slate-400 font-medium text-xs">Rango de Clan (+6% / rango)</label>
              <span className="font-mono text-amber-400 font-bold text-xs">Rango {clanRank} (+{clanRank * 6}%)</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              value={clanRank}
              onChange={(e) => setClanRank(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <select
              value={clanType}
              onChange={(e) => setClanType(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="NONE">Sin elemento de clan</option>
              {typesList.filter((t) => t !== 'ALL').map((type) => (
                <option key={type} value={type}>Clan {type}</option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500">
              El +6%/rango solo entra si el tipo del atacante coincide con el clan.
            </span>
          </div>

          {/* Move Selector */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 block font-medium text-xs">Ataque Utilizado para Cazar</label>
              {attackerStats.hasStab && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                  STAB ×1.5
                </span>
              )}
            </div>

            <select
              value={selectedMoveName || (('isCustom' in currentMove && currentMove.isCustom) ? 'custom' : currentMove.name)}
              onChange={(e) => setSelectedMoveName(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-amber-500"
            >
              <optgroup label="Ataques aprendidos (por nivel)">
                {availableAttacks.filter((a) => !a.tm).map((atk) => {
                  const isUnlocked = atk.learnLevel <= playerLevel;
                  return (
                    <option key={`${atk.name}-${atk.learnLevel}`} value={atk.name}>
                      {atk.name} (Pot: {atk.power}, {atk.type}, Nv. {atk.learnLevel}) {isUnlocked ? '✓' : '(🔒 Requiere nivel superior)'}
                    </option>
                  );
                })}
              </optgroup>
              {availableAttacks.some((a) => a.tm) && (
                <optgroup label="Movimientos Especiales / MTs">
                  {availableAttacks.filter((a) => a.tm).map((atk) => (
                    <option key={`${atk.name}-${atk.learnLevel}`} value={atk.name}>
                      {atk.name} (Pot: {atk.power}, {atk.type} [MT {atk.tm}])
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">⚙️ Ataque Personalizado (Manual)</option>
            </select>

            {selectedMoveName === 'custom' && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tipo de Ataque</label>
                  <select
                    value={selectedMoveType}
                    onChange={(e) => setSelectedMoveType(e.target.value)}
                    className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white font-semibold"
                  >
                    {typesList.filter((t) => t !== 'ALL').map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Potencia: {customMovePower}</label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={customMovePower}
                    onChange={(e) => setCustomMovePower(Number(e.target.value))}
                    className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
              <span>Ataque: <strong className="text-white font-mono">{attackerStats.movePower} Pot.</strong> ({attackerStats.moveType})</span>
              <span>{attackerStats.isSpecialMove ? 'Especial (Sp.Atk)' : 'Físico (Atk)'}</span>
            </div>

            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <label className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={hasAoeBonus}
                  onChange={(e) => setHasAoeBonus(e.target.checked)}
                  className="rounded accent-amber-500 h-4 w-4"
                />
                <span className="text-xs text-slate-300">
                  Disco TM de Área (AoE) · densidad 1,18x
                </span>
              </label>

              <div className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <input
                  type="checkbox"
                  checked={hasElementalTm}
                  onChange={(e) => setHasElementalTm(e.target.checked)}
                  className="rounded accent-amber-500 h-4 w-4"
                />
                <span className="text-xs text-slate-300 whitespace-nowrap">TM elemental</span>
                <select
                  value={elementalTmType}
                  onChange={(e) => setElementalTmType(e.target.value)}
                  disabled={!hasElementalTm}
                  className="min-w-0 flex-1 rounded bg-slate-950 border border-slate-800 px-1.5 py-1 text-[10px] text-white disabled:opacity-50"
                >
                  {typesList.filter((t) => t !== 'ALL').map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <label className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer hover:bg-amber-500/15">
                <input
                  type="checkbox"
                  checked={isVipBonus}
                  onChange={(e) => setIsVipBonus(e.target.checked)}
                  className="rounded accent-amber-500 h-4 w-4"
                />
                <span className="text-xs text-amber-300 font-semibold">
                  VIP — +50% EXP
                </span>
              </label>
              <label className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer hover:bg-amber-500/15">
                <input
                  type="checkbox"
                  checked={restrictToPlayerLevel}
                  onChange={(e) => setRestrictToPlayerLevel(e.target.checked)}
                  className="rounded accent-amber-500 h-4 w-4"
                />
                <span className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  <span>Solo hunts ≤ Nv. {playerLevel}</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Hero #1 Recommended Target - 5 cols */}
        <div className="lg:col-span-5 flex flex-col">
          {topTarget ? (
            <div className="flex-1 rounded-xl border-2 border-amber-500/40 bg-gradient-to-b from-[#141824] to-[#0a0d14] p-5 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

              <div>
                {/* Crown / Top Badge */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow">
                    <Trophy className="h-3.5 w-3.5" />
                    <span>#1 Mejor Pokémon para Farmear</span>
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Hunt Nivel {topTarget.wildLevel} · Mejor XP/h
                  </span>
                </div>

                {/* Target Avatar and Name */}
                <div className="mt-4 flex items-center gap-4">
                  <img
                    src={getPokemonSprite(topTarget.target.id)}
                    alt={topTarget.target.name}
                    className="w-20 h-20 object-contain drop-shadow-md bg-slate-900/60 rounded-2xl border border-slate-800 p-1"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-2xl font-black text-white tracking-tight">
                        {topTarget.target.name}
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        Gen {getPokemonGeneration(topTarget.target.id)}
                      </span>
                      {topTarget.target.id <= 251 ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Servidor Activo
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Solo Wiki
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getTypeBadgeStyle(topTarget.target.type1)}`}>
                        {topTarget.target.type1}
                      </span>
                      {topTarget.target.type2 && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getTypeBadgeStyle(topTarget.target.type2)}`}>
                          {topTarget.target.type2}
                        </span>
                      )}
                      <span className="text-xs font-mono font-bold text-amber-400 ml-1">
                        {topTarget.elementalMultiplier}x Efectividad {topTarget.elementalMultiplier >= 2 ? '⚡ Súper Efectivo' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-300/90 mt-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
                      <span>Mejor tasa de EXP/hora entre las hunts desbloqueadas (prioriza debilidades)</span>
                    </p>
                  </div>
                </div>

                {/* XP / Hour Big Stats Display */}
                <div className="mt-5 p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400 font-medium">Rendimiento Estimado:</span>
                    <span className="text-2xl font-black font-mono text-amber-400">
                      +{topTarget.xpPerHour.toLocaleString()} <span className="text-xs font-bold text-slate-400 font-sans">XP/h</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Kills / Hora</span>
                      <span className="font-bold text-white">~{topTarget.killsPerHour.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Daño / golpe</span>
                      <span className="font-bold text-emerald-400">
                        {topTarget.finalDamagePerHit.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Oro de Loot / Hora</span>
                      <span className="font-bold text-emerald-400">
                        +${topTarget.grossLootPerHour.toLocaleString()}/h
                      </span>
                    </div>
                  </div>
                </div>

                {/* Level Up Estimation */}
                <div className="mt-4 text-xs">
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      <span>Subida a Nv. {playerLevel + 1}</span>
                    </span>
                    <span className="font-bold text-emerald-400 font-mono text-sm block">
                      ~{minutesToNextLevel} minutos
                    </span>
                    <span className="text-[9px] text-slate-400 block font-sans">
                      ({xpNeededForNextLevel.toLocaleString()} XP faltantes)
                    </span>
                  </div>
                </div>
              </div>

              {/* Combat & Hunt Analyzer summary */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Tu daño: <strong className="text-white font-mono">{topTarget.finalDamagePerHit.toLocaleString()}</strong> / golpe</span>
                  <span>HP salvaje: <strong className="text-white font-mono">{topTarget.wildMaxHp.toLocaleString()}</strong></span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <Coins className="h-3 w-3 text-emerald-400" />
                    <span>Loot real (NPC): +${topTarget.grossLootPerHour.toLocaleString()}/h</span>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-rose-400 font-semibold">Supply: -${topTarget.supplyCostPerHour.toLocaleString()}/h</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded-xl border border-slate-800 bg-[#0d1017] p-8 text-center flex flex-col items-center justify-center text-slate-400">
              <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
              <p className="font-semibold text-white">No hay presas disponibles con los filtros actuales</p>
              <p className="text-xs mt-1">Prueba a aumentar tu nivel de jugador o cambiar el tipo de ataque.</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Sorting Toolbar */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1017] p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white">Filtros & Ordenación de Presas Salvajes</h4>
          </div>

          {/* Quick toggle for Player Level Restriction */}
          <button
            type="button"
            onClick={() => setRestrictToPlayerLevel((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
              restrictToPlayerLevel
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {restrictToPlayerLevel ? (
              <>
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                <span>Restringido a Nv. ≤ {playerLevel} (Activo)</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-rose-400" />
                <span>Mostrando Todos los Niveles (Sin límite)</span>
              </>
            )}
          </button>
        </div>

        {/* Tipo del Día: +20% XP y +20% loot */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span>Tipo del Día:</span>
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              +20% XP y +20% loot — solo se aplica al tipo que selecciones manualmente
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {dailyBonusTypes.map((t) => {
              const isActive = dailyTypeBonus === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDailyTypeBonus(t)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                    isActive
                      ? t === 'NONE'
                        ? 'bg-slate-700 text-white border-slate-500'
                        : 'bg-violet-500/25 text-violet-200 border-violet-400/50 shadow-sm shadow-violet-500/10'
                      : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                  }`}
                  title={t === 'NONE' ? 'Sin bonus de tipo del día' : `+20% XP y loot en tipo ${t}`}
                >
                  {t === 'NONE' ? 'Ninguno' : t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generaciones Selector (4 a elegir con Gen 1 y 2 activas por defecto) */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-amber-400" />
              <span>Generaciones:</span>
            </span>
            <span className="text-[11px] text-slate-400">
              (Servidor activo: <strong className="text-emerald-400">Gen 1 y 2</strong> · Gen 3 y 4+ en wiki)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {GENERATION_OPTIONS.map((gen) => {
              const isSelected = selectedGenerations.includes(gen.id);
              return (
                <button
                  key={gen.id}
                  type="button"
                  onClick={() => toggleGeneration(gen.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    isSelected
                      ? gen.isLiveServer
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
                      : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                  }`}
                  title={`${gen.name} (${gen.region}) ${gen.range} - ${gen.isLiveServer ? 'En Servidor Oficial' : 'Solo en Wiki'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSelected ? (gen.isLiveServer ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-slate-600'}`}></span>
                  <span>{gen.name}</span>
                  <span className="text-[10px] opacity-75">({gen.region})</span>
                  {gen.isLiveServer ? (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/25 text-emerald-300 font-mono font-bold">
                      Servidor
                    </span>
                  ) : (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      Wiki
                    </span>
                  )}
                </button>
              );
            })}

            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedGenerations([1, 2])}
                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md border border-emerald-500/30 transition-colors"
                title="Mostrar únicamente las generaciones 1 y 2 que están implementadas en el servidor activo"
              >
                Solo Servidor (1 y 2)
              </button>
              <button
                type="button"
                onClick={() => setSelectedGenerations([1, 2, 3, 4])}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
                title="Mostrar todas las 4 generaciones (incluyendo Gen 3 y 4+ de la wiki)"
              >
                Todas (1 a 4+)
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Hunting Zone Selector (Selector de Zona de Caza) */}
          <div className="sm:col-span-2">
            <label className="text-[10px] text-amber-400 font-bold flex items-center gap-1 mb-1">
              <MapPin className="h-3 w-3" />
              <span>Zona de Caza (Filtro por Rango)</span>
            </label>
            <select
              value={selectedHuntingZone}
              onChange={(e) => {
                setSelectedHuntingZone(e.target.value);
                setHuntRangeFilter('ALL');
                setSpecificHuntLevel('ALL');
              }}
              className="w-full rounded-lg bg-slate-900 border border-amber-500/40 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-semibold"
            >
              {HUNTING_ZONES.map((zone) => {
                const isAccessible = playerLevel >= zone.minPlayerLevel;
                return (
                  <option
                    key={zone.id}
                    value={zone.id}
                    disabled={restrictToPlayerLevel && !isAccessible}
                  >
                    {zone.id === 'ALL'
                      ? zone.name
                      : `${isAccessible ? '✅' : '🔒'} ${zone.name} ${!isAccessible ? `(Bloqueada: Requiere Nv. ${zone.minPlayerLevel})` : ''}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Search by Name */}
          <div className="relative">
            <label className="text-[10px] text-slate-400 font-medium block mb-1">Buscar Presa</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Nombre o tipo..."
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Specific Hunt Level */}
          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">Nivel del Mob</label>
            <select
              value={specificHuntLevel}
              onChange={(e) => {
                setSpecificHuntLevel(e.target.value);
                setHuntRangeFilter('ALL');
                setSelectedHuntingZone('ALL');
              }}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {huntLevelsList.map((lvl) => {
                const num = Number(lvl);
                const isLocked = lvl !== 'ALL' && num > playerLevel;
                return (
                  <option key={lvl} value={lvl}>
                    {lvl === 'ALL'
                      ? 'Nivel Exacto (Todos)'
                      : `Hunt Nv. ${lvl} ${isLocked ? '(🔒 > Nv. Jugador)' : ''}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Target Type Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">Tipo de Presa</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {typesList.map((tp) => (
                <option key={tp} value={tp}>
                  {tp === 'ALL' ? 'Todos los Tipos' : tp}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Field */}
          <div>
            <label className="text-[10px] text-amber-400 font-medium block mb-1">Criterio de Orden</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-amber-300 focus:outline-none focus:border-amber-500 font-semibold"
            >
              <option value="xpPerHour">🚀 XP por Hora</option>
              <option value="lowestBulk">🧱 Menor Bulk (HP × Def) — Más preciso</option>
              <option value="lowestDefense">🛡️ Menor Defensa (solo Def)</option>
              <option value="lowestHp">🩸 Menor Vida Salvaje (HP)</option>
              <option value="elementalMultiplier">🎯 Efectividad Elemental</option>
              <option value="xpPerKill">⭐ Mayor XP por Kill</option>
              <option value="wildLevel">🏔️ Nivel del Hunt</option>
            </select>
          </div>
        </div>

        {/* Direction Switch and Instructions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Orden actual:</span>
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-white transition-colors"
            >
              {sortDirection === 'desc' ? (
                <>
                  <ArrowDown className="h-3.5 w-3.5 text-amber-400" />
                  <span>Descendente (Mayor a Menor)</span>
                </>
              ) : (
                <>
                  <ArrowUp className="h-3.5 w-3.5 text-amber-400" />
                  <span>Ascendente (Menor a Mayor)</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              (Haz clic en cualquier columna de la tabla para alternar orden ascendente o descendente)
            </span>
          </div>

          <span className="font-mono text-xs text-slate-400">
            {rankedTargets.length} presas analizadas
          </span>
        </div>
      </div>

      {/* Leaderboard Table with Clickable Asc/Desc Headers */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1017] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-400" />
            <span>Ranking Oficial de Presas para Farmeo de Experiencia</span>
          </h4>
          <span className="text-xs text-slate-400">
            Mostrando los {Math.min(maxResults, rankedTargets.length)} mejores resultados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] border-b border-slate-800 select-none">
              <tr>
                <th className="p-3 text-center w-12">Rank</th>
                <th className="p-3">Pokémon Salvaje</th>

                {/* Clickable Header: Nivel Hunt */}
                <th className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('wildLevel')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors"
                    title="Ordenar por Nivel del Hunt"
                  >
                    <span>Nivel Hunt</span>
                    {sortBy === 'wildLevel' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Clickable Header: XP / Hora */}
                <th className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('xpPerHour')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors ml-auto text-amber-400"
                    title="Ordenar por Experiencia por Hora"
                  >
                    <span>XP / Hora</span>
                    {sortBy === 'xpPerHour' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Clickable Header: Loot real ($/h) */}
                <th className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('netProfit')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors ml-auto text-emerald-400"
                    title="Ordenar por Loot real/h (valor esperado de drops al NPC)"
                  >
                    <Coins className="h-3 w-3 text-emerald-400" />
                    <span>Loot real ($/h)</span>
                    {sortBy === 'netProfit' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Clickable Header: Bulk Efectivo (HP × Defensa) */}
                <th className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('lowestBulk')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors"
                    title="Ordenar por Bulk Efectivo (HP × Defensa relevante). Menor bulk = más fácil de matar de verdad"
                  >
                    <Shield className="h-3 w-3 text-amber-400" />
                    <span>Bulk (HP×Def)</span>
                    {sortBy === 'lowestBulk' || sortBy === 'lowestDefense' || sortBy === 'lowestHp' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Clickable Header: Efectividad Elemental */}
                <th className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('elementalMultiplier')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors"
                    title="Ordenar por Efectividad Elemental (Ascendente o Descendente)"
                  >
                    <span>Efectividad</span>
                    {sortBy === 'elementalMultiplier' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Clickable Header: XP / Kill */}
                <th className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('xpPerKill')}
                    className="inline-flex items-center gap-1 uppercase font-bold hover:text-amber-400 transition-colors ml-auto"
                    title="Ordenar por XP por Kill"
                  >
                    <span>XP / Kill</span>
                    {sortBy === 'xpPerKill' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
              {rankedTargets.slice(0, maxResults).map((item, index) => {
                const rankNumber = index + 1;
                const isTop1 = rankNumber === 1;
                const isExpanded = expandedTargetId === item.target.id;

                return (
                  <tr
                    key={item.target.id}
                    className={`transition-colors hover:bg-slate-900/50 ${
                      isTop1 ? 'bg-amber-500/5' : ''
                    } ${item.isLevelLocked ? 'opacity-55' : ''}`}
                  >
                    {/* Rank */}
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          rankNumber === 1
                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                            : rankNumber === 2
                            ? 'bg-slate-300 text-slate-950'
                            : rankNumber === 3
                            ? 'bg-amber-700 text-amber-100'
                            : 'text-slate-500'
                        }`}
                      >
                        {rankNumber}
                      </span>
                    </td>

                    {/* Pokemon */}
                    <td className="p-3 font-sans">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={getPokemonSprite(item.target.id)}
                          alt={item.target.name}
                          className="w-9 h-9 object-contain shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white">{item.target.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">#{item.target.id}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              Gen {getPokemonGeneration(item.target.id)}
                            </span>
                            {item.target.id <= 251 ? (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold" title="Implementado en servidor oficial">
                                Servidor
                              </span>
                            ) : (
                              <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono" title="Solo en wiki">
                                Wiki
                              </span>
                            )}
                            {item.isLevelLocked && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold font-mono">
                                <Lock className="h-2.5 w-2.5" />
                                <span>Bloqueado (&gt; Lv. {playerLevel})</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[8px] px-1 py-0.2 rounded font-bold border ${getTypeBadgeStyle(item.target.type1)}`}>
                              {item.target.type1}
                            </span>
                            {item.target.type2 && (
                              <span className={`text-[8px] px-1 py-0.2 rounded font-bold border ${getTypeBadgeStyle(item.target.type2)}`}>
                                {item.target.type2}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Wild Hunt Level */}
                    <td className="p-3 text-center">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-xs inline-flex items-center gap-1 ${
                          item.isLevelLocked
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : item.wildLevel <= 20
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.wildLevel <= 50
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {item.isLevelLocked && <Lock className="h-3 w-3" />}
                        <span>Hunt {item.wildLevel}</span>
                      </span>
                    </td>

                    {/* XP per Hour */}
                    <td className="p-3 text-right">
                      <span className="font-bold text-amber-400 text-sm">
                        +{item.xpPerHour.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        ~{item.killsPerHour.toLocaleString()} kills/h
                      </span>
                    </td>

                    {/* Loot real ($/h) */}
                    <td className="p-3 text-right font-mono">
                      <span className="font-bold text-emerald-400">
                        +${item.grossLootPerHour.toLocaleString()}
                      </span>
                    </td>

                    {/* Enemy Bulk + Defenses (Physical & Special) */}
                    <td className="p-3 text-center font-mono">
                      <div className="flex flex-col items-center gap-0.5">
                        {/* Bulk efectivo principal */}
                        <div className="text-[12px] font-bold text-white" title="Bulk Efectivo = HP × (Defensa relevante / 50). Mide mejor cuánto aguanta el enemigo">
                          {item.effectiveBulk.toLocaleString()}
                        </div>
                        {/* HP + Defensas (calculadas con Growth 17 + Quality 1.20) */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span title="HP máximo del salvaje (fórmula oficial ×5, Growth 17, Quality 1.20)">
                            HP {item.wildMaxHp}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span
                            className={!attackerStats.isSpecialMove ? 'text-amber-300 font-semibold' : ''}
                            title="Defensa Física calculada (Growth 17, Quality 1.20)"
                          >
                            Def.F {item.wildDef}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span
                            className={attackerStats.isSpecialMove ? 'text-cyan-300 font-semibold' : ''}
                            title="Defensa Especial calculada (Growth 17, Quality 1.20)"
                          >
                            Def.Es {item.wildSpDef}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-sans border ${
                            item.defenseTier === 'fragile'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-bold'
                              : item.defenseTier === 'medium'
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {item.defenseTier === 'fragile' ? '🟢 Papel (Fácil)' : item.defenseTier === 'medium' ? '🟡 Media' : '🔴 Tanque'}
                        </span>
                      </div>
                    </td>

                    {/* Elemental Multiplier */}
                    <td className="p-3 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          item.elementalMultiplier >= 2.0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : item.elementalMultiplier > 1.0
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : item.elementalMultiplier === 1.0
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {item.elementalMultiplier}x
                      </span>
                    </td>

                    {/* XP per Kill */}
                    <td className="p-3 text-right text-slate-300">
                      <span className="font-bold text-white">{item.xpPerKill.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500 block">XP</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rankedTargets.length > maxResults && (
          <div className="p-3 bg-slate-900/60 border-t border-slate-800 text-center">
            <button
              onClick={() => setMaxResults((prev) => prev + 30)}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Cargar más objetivos (+30)...
            </button>
          </div>
        )}
      </div>

      {/* Pro Tips / Strategy Guide Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1017] p-5 space-y-3 text-xs text-slate-300">
        <h4 className="font-bold text-white text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>Reglas Clave para Maximizar la XP en Hunts</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="font-bold text-amber-400 block">1. Respeta el Nivel de Hunt (Lv. ≤ Jugador)</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              El juego bloquea las hunts superiores a tu nivel. Un jugador a Nivel 20 rinde al máximo en las hunts 10 y 20 antes de saltar a la hunt 30 al subir de nivel.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="font-bold text-amber-400 block">2. Prioriza alto daño y bajo Bulk (HP×Def)</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Más daño relativo al HP del salvaje = más kills/h. Bulk = HP × Defensa (Growth 17 + Quality media 1.20 + ×5 HP oficial). Los salvajes de Quality más alta tendrán más vida real.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="font-bold text-amber-400 block">3. Explotar Debilidades x1.8 / x2.5 / x5.5</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              El multiplicador elemental amplificado duplica o triplica tu daño. Cambia tu tipo de ataque principal o tu líder de equipo según el tipo de presa de la zona.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
