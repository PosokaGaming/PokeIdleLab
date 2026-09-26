/**
 * Motor de simulación de combate para hunts de poke.idleworld.online.
 * Lógica pura (sin React) — testeable de forma independiente.
 */
import { OfficialPokemon } from './pokemonTierData';
import { getHuntCalibration } from './huntCalibration';
import {
  calculateStat,
  getAmplifiedMultiplier,
  SPECIAL_TYPES,
} from './calculatorHelpers';

/**
 * Cadencia real de Hunt Analyzer.
 * Las sesiones reales aportan segundos por derrota; las muestras conocidas
 * se conservan como referencias y el resto usa un modelo continuo calibrado.
 */
export const REAL_HUNT_REFERENCE_CYCLE_SECONDS = 8.70;
export const REAL_HUNT_REFERENCE_WALK_SECONDS = 7.00;
export const REAL_HUNT_REFERENCE_COMBAT_SECONDS = 0.60;
export const POKEGRID_TM_POWER = 300;
export const POKEGRID_TM_COOLDOWN_SECONDS = 10;
export const POKEGRID_TM_TARGETS = 2;
export const REAL_HUNT_AOE_TARGET_MULTIPLIER = 16.5 / 14;

export type HuntMove = OfficialPokemon['attacks'][number] & { isCustom?: boolean };

export interface HuntCombatProjection {
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

export function getMoveIsSpecial(moveType: string): boolean {
  return SPECIAL_TYPES.includes(moveType.toUpperCase());
}

export function getMoveStab(attacker: OfficialPokemon, moveType: string): number {
  const upper = moveType.toUpperCase();
  return upper === attacker.type1.toUpperCase() ||
    (attacker.type2 ? upper === attacker.type2.toUpperCase() : false)
    ? 1.5
    : 1;
}

export function projectHuntCombat(
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
  const continuousHitsToKill = Math.max(
    0.1,
    wildMaxHp / selected.continuousDamagePerHit
  );
  const combatTimeSeconds = Math.max(
    attackIntervalSeconds,
    continuousHitsToKill * attackIntervalSeconds
  );

  const calibration = getHuntCalibration(target.id, wildLevel);
  const realCalibratedCycleSeconds =
    calibration?.source === 'real'
      ? calibration.cycleSeconds
      : undefined;

  // La referencia de 8.70 s es solo una muestra histórica, no un mínimo global.
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
