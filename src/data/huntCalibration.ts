/**
 * Calibración de hunts basada en sesiones reales.
 *
 * La calculadora puede funcionar sin calibración, pero cuando se registran
 * sesiones reales el modelo sustituye las constantes manuales por observaciones
 * persistentes en el navegador.
 *
 * Formato de entrada:
 *   recordHuntCalibration({ targetId, huntLevel, kills, elapsedSeconds, xpGained, xpBonusMultiplier, leaderId, leaderKey })
 *
 * El mismo contrato puede recibir datos de un futuro bridge de Hunt Analyzer
 * mediante postMessage con type = "POKEGRID_HUNT_CALIBRATION".
 */

import { POKEMON_TIER_DATA } from './pokemonTierData';

export interface HuntCalibrationSample {
  id: string;
  targetId: number;
  huntLevel: number;
  kills: number;
  elapsedSeconds: number;
  xpGained?: number;
  /**
   * Multiplicador de XP activo en la sesión (ver getXpBonusMultiplier). Permite
   * guardar la XP "base" y reaplicar los bonus que el usuario tenga activos
   * ahora. Las muestras antiguas no lo traen: su XP no se usa, su ciclo sí.
   */
  xpBonusMultiplier?: number;
  leaderId?: number;
  leaderKey?: string;
  createdAt: number;
}

export interface HuntCalibration {
  cycleSeconds: number;
  /** XP por derrota SIN bonus (VIP, evento); el optimizador reaplica los activos. */
  baseXpPerKill?: number;
  sampleCount: number;
  totalKills: number;
  source: 'real' | 'seed';
  lastUpdated: number;
}

export type HuntCalibrationInput = Omit<HuntCalibrationSample, 'id' | 'createdAt'>;

const STORAGE_KEY = 'pokeIdleLab.huntCalibration.v1';
const MIN_SESSION_SECONDS = 5 * 60;
const MIN_SESSION_KILLS = 10;
const MAX_SAMPLES_PER_TARGET = 30;
export const CALIBRATION_UPDATED_EVENT = 'pokeidlelab:calibration-updated';

/** Además de la propia web, solo el juego puede mandar sesiones por postMessage. */
const BRIDGE_ALLOWED_ORIGINS = ['https://poke.idleworld.online'];

const HUNT_LEVEL_BY_ID = new Map(POKEMON_TIER_DATA.map((p) => [p.id, p.huntLevel]));

/**
 * Los bonus de XP del juego se SUMAN sobre la base: la recompensa visible en
 * una hunt Lv.150 es 13.508 base + 6.754 VIP + 13.508 evento = 33.770 (×2,5,
 * no ×3), y las sesiones reales de Ancient Pinsir y Meganium dan 32.600-33.400.
 */
export function getXpBonusMultiplier(isVip: boolean, hasDoubleXpEvent: boolean): number {
  return 1 + (isVip ? 0.5 : 0) + (hasDoubleXpEvent ? 1 : 0);
}

/**
 * Semillas migradas de las referencias reales que ya estaban en el optimizador.
 * Se mantienen solo como fallback hasta que existan observaciones del usuario.
 */
const SEEDED_CALIBRATIONS: Record<number, number> = {
  49: 3600 / 425,
  163: 3600 / 186,
  205: 3600 / 538,
  227: 3600 / (4100 / (9 + 55 / 60)),
  878: (((21 + 1 / 60) * 60) / 80) - (0.66 - 0.60),
  888: 11.6694872086,
  907: 8.6580645161,
  903: 13.5888162672
};

const SEEDED_LEVEL_CALIBRATIONS: Record<number, number> = {
  150: 3600 / 295
};

/** XP por derrota observada en la sesión real y los bonus que estaban activos. */
const SEEDED_XP_PER_KILL: Record<number, { xpPerKill: number; xpBonusMultiplier: number }> = {
  878: { xpPerKill: 22159.25, xpBonusMultiplier: getXpBonusMultiplier(true, false) }, // Brave Venusaur, solo VIP
  907: { xpPerKill: 33414.1440860215, xpBonusMultiplier: getXpBonusMultiplier(true, true) }, // Ancient Pinsir, VIP + evento
  903: { xpPerKill: 32602.6419753086, xpBonusMultiplier: getXpBonusMultiplier(true, true) } // Ancient Meganium, VIP + evento
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readSamples(): HuntCalibrationSample[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSamples(samples: HuntCalibrationSample[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Storage may be unavailable (private mode / quota). The calculator still works.
  }
}

function notifyCalibrationUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CALIBRATION_UPDATED_EVENT));
}

function keyFor(targetId: number, huntLevel?: number): string {
  return huntLevel && huntLevel > 0 ? `${targetId}@${huntLevel}` : String(targetId);
}

function weightedMean(values: Array<{ value: number; weight: number }>): number | undefined {
  const valid = values.filter((v) => Number.isFinite(v.value) && v.value > 0 && v.weight > 0);
  if (!valid.length) return undefined;
  const totalWeight = valid.reduce((sum, v) => sum + v.weight, 0);
  return valid.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

/** Hunt Lv. en el que aparece la especie, o undefined si el ID no existe. */
export function getSpeciesHuntLevel(targetId: number): number | undefined {
  return HUNT_LEVEL_BY_ID.get(targetId);
}

export function getHuntCalibrationSamples(): HuntCalibrationSample[] {
  return readSamples();
}

export function clearHuntCalibration(): void {
  if (canUseStorage()) window.localStorage.removeItem(STORAGE_KEY);
  notifyCalibrationUpdated();
}

/** Devuelve por qué no se puede guardar la sesión, o null si es válida. */
export function validateHuntCalibrationInput(input: HuntCalibrationInput): string | null {
  const targetId = Number(input.targetId);
  const speciesLevel = Number.isInteger(targetId) ? getSpeciesHuntLevel(targetId) : undefined;
  if (speciesLevel === undefined) return `No existe ninguna especie con el ID ${input.targetId}.`;

  const huntLevel = Number(input.huntLevel);
  if (huntLevel > 0 && huntLevel !== speciesLevel) {
    return `Esa especie aparece en la Hunt Lv.${speciesLevel}, no en la Lv.${huntLevel}.`;
  }

  const kills = Number(input.kills);
  const elapsedSeconds = Number(input.elapsedSeconds);
  if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds) ||
      kills < MIN_SESSION_KILLS || elapsedSeconds < MIN_SESSION_SECONDS) {
    return 'La sesión debe tener al menos 10 kills y 5 minutos.';
  }

  if (input.xpGained !== undefined && !(Number(input.xpGained) >= 0)) {
    return 'La XP ganada debe ser un número positivo.';
  }
  return null;
}

export function recordHuntCalibration(input: HuntCalibrationInput): HuntCalibrationSample | null {
  if (validateHuntCalibrationInput(input)) return null;

  const targetId = Number(input.targetId);
  const xpBonusMultiplier = Number(input.xpBonusMultiplier);
  const sample: HuntCalibrationSample = {
    ...input,
    targetId,
    // Siempre el nivel de la especie: es el único con el que el optimizador la busca.
    huntLevel: getSpeciesHuntLevel(targetId)!,
    kills: Math.round(Number(input.kills)),
    elapsedSeconds: Number(input.elapsedSeconds),
    xpGained: input.xpGained !== undefined ? Number(input.xpGained) : undefined,
    xpBonusMultiplier: xpBonusMultiplier > 0 ? xpBonusMultiplier : undefined,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now()
  };

  const samples = readSamples();
  const targetKey = keyFor(sample.targetId, sample.huntLevel);
  const sameTarget = samples
    .filter((s) => keyFor(s.targetId, s.huntLevel) === targetKey)
    .sort((a, b) => b.createdAt - a.createdAt);

  const kept = sameTarget.slice(0, MAX_SAMPLES_PER_TARGET - 1);
  const other = samples.filter((s) => keyFor(s.targetId, s.huntLevel) !== targetKey);
  writeSamples([...other, sample, ...kept]);
  notifyCalibrationUpdated();

  return sample;
}

/**
 * `samples` permite pasar las muestras ya leídas: el optimizador consulta las
 * ~450 especies en cada recálculo y no debe parsear localStorage cada vez.
 */
export function getHuntCalibration(
  targetId: number,
  huntLevel?: number,
  samples: HuntCalibrationSample[] = readSamples()
): HuntCalibration | null {
  const matching = samples.filter((s) => {
    if (s.targetId !== targetId) return false;
    return !huntLevel || huntLevel <= 0 || s.huntLevel === huntLevel || s.huntLevel === 0;
  });

  if (matching.length) {
    const cycleSeconds = weightedMean(
      matching.map((s) => ({ value: s.elapsedSeconds / s.kills, weight: s.kills }))
    );
    const baseXpPerKill = weightedMean(
      matching
        .filter((s) => s.xpGained !== undefined && Number(s.xpBonusMultiplier) > 0)
        .map((s) => ({
          value: Number(s.xpGained) / s.kills / Number(s.xpBonusMultiplier),
          weight: s.kills
        }))
    );

    if (cycleSeconds) {
      return {
        cycleSeconds,
        baseXpPerKill,
        sampleCount: matching.length,
        totalKills: matching.reduce((sum, s) => sum + s.kills, 0),
        source: 'real',
        lastUpdated: Math.max(...matching.map((s) => s.createdAt))
      };
    }
  }

  const seededCycle = SEEDED_CALIBRATIONS[targetId] ?? SEEDED_LEVEL_CALIBRATIONS[huntLevel || 0];
  if (seededCycle === undefined) return null;

  const seededXp = SEEDED_XP_PER_KILL[targetId];
  return {
    cycleSeconds: seededCycle,
    baseXpPerKill: seededXp ? seededXp.xpPerKill / seededXp.xpBonusMultiplier : undefined,
    sampleCount: 0,
    totalKills: 0,
    source: 'seed',
    lastUpdated: 0
  };
}

export interface PokeGridCalibrationMessage {
  type: 'POKEGRID_HUNT_CALIBRATION';
  targetId: number;
  huntLevel?: number;
  kills: number;
  elapsedSeconds: number;
  xpGained?: number;
  xpBonusMultiplier?: number;
  leaderId?: number;
  leaderKey?: string;
}

/**
 * Instala el bridge de eventos para que una integración externa (por ejemplo
 * PokeGrid) pueda alimentar la calibración sin tocar la UI.
 */
export function installHuntCalibrationBridge(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: MessageEvent<PokeGridCalibrationMessage>) => {
    // Sin esto, cualquier página que abra o enmarque la web podría inyectar sesiones.
    if (event.origin !== window.location.origin && !BRIDGE_ALLOWED_ORIGINS.includes(event.origin)) return;
    const data = event.data;
    if (!data || data.type !== 'POKEGRID_HUNT_CALIBRATION') return;
    recordHuntCalibration({
      targetId: Number(data.targetId),
      huntLevel: Number(data.huntLevel) || 0,
      kills: data.kills,
      elapsedSeconds: data.elapsedSeconds,
      xpGained: data.xpGained,
      xpBonusMultiplier: data.xpBonusMultiplier,
      leaderId: data.leaderId,
      leaderKey: data.leaderKey
    });
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
