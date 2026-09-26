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

export function getHuntCalibrationSamples(): HuntCalibrationSample[] {
  return readSamples();
}

export function clearHuntCalibration(): void {
  if (canUseStorage()) window.localStorage.removeItem(STORAGE_KEY);
}

export function recordHuntCalibration(input: Omit<HuntCalibrationSample, 'id' | 'createdAt'>): HuntCalibrationSample | null {
  const kills = Number(input.kills);
  const elapsedSeconds = Number(input.elapsedSeconds);

  if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds)) return null;
  if (kills < MIN_SESSION_KILLS || elapsedSeconds < MIN_SESSION_SECONDS) return null;
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) return null;
  if (!Number.isInteger(Number(input.huntLevel)) || Number(input.huntLevel) < 0) return null;

  const sample: HuntCalibrationSample = {
    ...input,
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

  const handler = (event: MessageEvent<PokeGridCalibrationMessage>) => {
    const data = event.data;
    if (!data || data.type !== 'POKEGRID_HUNT_CALIBRATION') return;
    if (event.source !== window || event.origin !== window.location.origin) return;
    recordHuntCalibration({
      targetId: data.targetId,
      huntLevel: data.huntLevel || 0,
      kills: data.kills,
      elapsedSeconds: data.elapsedSeconds,
      xpGained: data.xpGained,
      leaderId: data.leaderId,
      leaderKey: data.leaderKey
    });
    window.dispatchEvent(new CustomEvent('pokeidlelab:calibration-updated'));
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
