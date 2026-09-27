/**
 * Calibración de hunts basada en sesiones reales.
 *
 * La calculadora puede funcionar sin calibración, pero cuando se registran
 * sesiones reales el modelo sustituye las constantes manuales por observaciones
 * persistentes en el navegador.
 *
 * Formato de entrada:
 *   recordHuntCalibration({ targetId, huntLevel, kills, elapsedSeconds, xpGained, leaderId, leaderKey })
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
  leaderId?: number;
  leaderKey?: string;
  createdAt: number;
}

export interface HuntCalibration {
  cycleSeconds: number;
  xpPerKill?: number;
  sampleCount: number;
  totalKills: number;
  source: 'real' | 'seed';
  lastUpdated: number;
}

// v2: invalida las muestras antiguas tomadas con el modelo de cadencia anterior.
// Las muestras viejas podían fijar Hunt 150 en ~413.79 kills/h (8.70 s/ciclo).
const STORAGE_KEY = 'pokeIdleLab.huntCalibration.v2';
const MIN_SESSION_SECONDS = 5 * 60;
const MIN_SESSION_KILLS = 10;
const MAX_SAMPLES_PER_TARGET = 30;

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

const SEEDED_XP_FACTORS: Record<number, number> = {
  878: 22159.25,
  907: 33414.1440860215,
  903: 32602.6419753086
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

function keyFor(targetId: number, huntLevel?: number): string {
  return huntLevel && huntLevel > 0 ? `${targetId}@${huntLevel}` : String(targetId);
}

function weightedMean(values: Array<{ value: number; weight: number }>): number | undefined {
  const valid = values.filter((v) => Number.isFinite(v.value) && v.value > 0 && v.weight > 0);
  if (!valid.length) return undefined;
  const totalWeight = valid.reduce((sum, v) => sum + v.weight, 0);
  return valid.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

export const CALIBRATION_UPDATED_EVENT = 'pokeidlelab:calibration-updated';

function notifyCalibrationUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CALIBRATION_UPDATED_EVENT));
}

const HUNT_LEVEL_BY_ID = new Map(POKEMON_TIER_DATA.map((p) => [p.id, p.huntLevel]));

/** Hunt Lv. de la especie si está en la tier list; el bridge puede mandar otros IDs del juego. */
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

export type HuntCalibrationInput = Omit<HuntCalibrationSample, 'id' | 'createdAt'>;

/** Devuelve por qué no se puede guardar la sesión, o null si es válida. */
export function validateHuntCalibrationInput(input: HuntCalibrationInput): string | null {
  const kills = Number(input.kills);
  const elapsedSeconds = Number(input.elapsedSeconds);
  if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds) ||
      kills < MIN_SESSION_KILLS || elapsedSeconds < MIN_SESSION_SECONDS) {
    return 'La sesión debe tener al menos 10 kills y 5 minutos.';
  }
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) return 'El ID de la presa debe ser un número entero positivo.';
  const huntLevel = Number(input.huntLevel);
  if (!Number.isInteger(huntLevel) || huntLevel < 0) return 'El Hunt Lv. debe ser un número entero.';
  // El optimizador busca cada especie solo en su propio Hunt Lv.: otro nivel se
  // guardaría pero nunca se usaría.
  const speciesLevel = getSpeciesHuntLevel(input.targetId);
  if (speciesLevel !== undefined && huntLevel > 0 && huntLevel !== speciesLevel) {
    return `Esa especie aparece en la Hunt Lv.${speciesLevel}, no en la Lv.${huntLevel}.`;
  }
  return null;
}

export function recordHuntCalibration(input: HuntCalibrationInput): HuntCalibrationSample | null {
  if (validateHuntCalibrationInput(input)) return null;
  const kills = Number(input.kills);
  const elapsedSeconds = Number(input.elapsedSeconds);

  const sample: HuntCalibrationSample = {
    ...input,
    huntLevel: Number(input.huntLevel) || getSpeciesHuntLevel(input.targetId) || 0,
    kills: Math.round(kills),
    elapsedSeconds,
    xpGained: input.xpGained !== undefined && Number.isFinite(Number(input.xpGained))
      ? Number(input.xpGained)
      : undefined,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now()
  };

  const samples = readSamples().filter((s) => s.id !== sample.id);
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

export function getHuntCalibration(targetId: number, huntLevel?: number): HuntCalibration | null {
  const samples = readSamples().filter((s) => {
    if (s.targetId !== targetId) return false;
    return !huntLevel || huntLevel <= 0 || s.huntLevel === huntLevel || s.huntLevel === 0;
  });

  if (samples.length) {
    const cycleSeconds = weightedMean(
      samples.map((s) => ({ value: s.elapsedSeconds / s.kills, weight: s.kills }))
    );
    const xpPerKill = weightedMean(
      samples
        .filter((s) => s.xpGained !== undefined)
        .map((s) => ({ value: Number(s.xpGained) / s.kills, weight: s.kills }))
    );

    if (cycleSeconds) {
      return {
        cycleSeconds,
        xpPerKill,
        sampleCount: samples.length,
        totalKills: samples.reduce((sum, s) => sum + s.kills, 0),
        source: 'real',
        lastUpdated: Math.max(...samples.map((s) => s.createdAt))
      };
    }
  }

  const seededCycle = SEEDED_CALIBRATIONS[targetId] ?? SEEDED_LEVEL_CALIBRATIONS[huntLevel || 0];
  if (seededCycle === undefined) return null;

  return {
    cycleSeconds: seededCycle,
    xpPerKill: SEEDED_XP_FACTORS[targetId],
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
  leaderId?: number;
  leaderKey?: string;
}

/**
 * Instala el bridge de eventos para que una integración externa (por ejemplo
 * PokeGrid) pueda alimentar la calibración sin tocar la UI.
 */
export function installHuntCalibrationBridge(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let lastRemoteKey = '';

  const apply = (data: PokeGridCalibrationMessage) => {
    if (!data || data.type !== 'POKEGRID_HUNT_CALIBRATION') return;
    const key = [
      data.targetId,
      data.huntLevel || 0,
      data.kills,
      data.elapsedSeconds,
      data.xpGained ?? ''
    ].join('|');
    if (key === lastRemoteKey) return;
    lastRemoteKey = key;

    // recordHuntCalibration ya avisa a la tabla si guardó la muestra.
    recordHuntCalibration({
      targetId: data.targetId,
      huntLevel: data.huntLevel || 0,
      kills: data.kills,
      elapsedSeconds: data.elapsedSeconds,
      xpGained: data.xpGained,
      leaderId: data.leaderId,
      leaderKey: data.leaderKey
    });
  };

  const handler = (event: MessageEvent<PokeGridCalibrationMessage>) => {
    const data = event.data;
    if (!data || data.type !== 'POKEGRID_HUNT_CALIBRATION') return;
    if (event.source !== window || event.origin !== window.location.origin) return;
    apply(data);
  };

  window.addEventListener('message', handler);

  let stopped = false;
  let timer: number | undefined;

  const poll = async () => {
    if (stopped) return;
    try {
      const response = await fetch('/api/pokegrid-hunt', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.source === 'pokegrid') {
          apply({
            type: 'POKEGRID_HUNT_CALIBRATION',
            targetId: Number(data.targetId),
            huntLevel: Number(data.huntLevel) || 0,
            kills: Number(data.kills),
            elapsedSeconds: Number(data.elapsedSeconds),
            xpGained: data.xpGained === undefined ? undefined : Number(data.xpGained),
            leaderId: data.leaderId === undefined ? undefined : Number(data.leaderId),
            leaderKey: data.leaderKey
          });
        }
      }
    } catch {
      // PokeGrid no está conectado o el servidor local aún no está disponible.
    } finally {
      if (!stopped) timer = window.setTimeout(poll, 5000);
    }
  };

  // Dentro del juego (extensión) la ruta relativa apuntaría al servidor de
  // poke.idleworld.online: solo se escucha postMessage de la misma página.
  const inGameExtension = (window as Window & { __POKEIDLELAB_EXTENSION__?: boolean }).__POKEIDLELAB_EXTENSION__ === true;
  if (!inGameExtension) poll();

  return () => {
    stopped = true;
    window.removeEventListener('message', handler);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
