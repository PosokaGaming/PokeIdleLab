import React, { useEffect, useMemo, useState } from 'react';
import {
  CALIBRATION_UPDATED_EVENT,
  getHuntCalibration,
  getHuntCalibrationSamples,
  getSpeciesHuntLevel,
  recordHuntCalibration,
  validateHuntCalibrationInput,
  HuntCalibrationInput,
  HuntCalibrationSample
} from '../data/huntCalibration';
import { POKEMON_TIER_DATA } from '../data/pokemonTierData';

export const HuntCalibrationPanel: React.FC = () => {
  const [targetId, setTargetId] = useState('907');
  const [huntLevel, setHuntLevel] = useState('150');
  const [kills, setKills] = useState('100');
  const [minutes, setMinutes] = useState('15');
  const [xp, setXp] = useState('');
  const [samples, setSamples] = useState<HuntCalibrationSample[]>([]);
  const [message, setMessage] = useState('');

  const refresh = () => setSamples(getHuntCalibrationSamples());

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener(CALIBRATION_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(CALIBRATION_UPDATED_EVENT, onUpdate);
  }, []);

  const species = useMemo(
    () => POKEMON_TIER_DATA.find((p) => p.id === Number(targetId)),
    [targetId]
  );

  const calibration = useMemo(
    () => getHuntCalibration(Number(targetId), Number(huntLevel)),
    [targetId, huntLevel, samples]
  );

  const handleTargetIdChange = (value: string) => {
    setTargetId(value);
    // El optimizador solo busca la sesión en el nivel de hunt de la especie.
    const level = getSpeciesHuntLevel(Number(value));
    if (level !== undefined) setHuntLevel(String(level));
  };

  const submit = () => {
    const input: HuntCalibrationInput = {
      targetId: Number(targetId),
      huntLevel: Number(huntLevel),
      kills: Number(kills),
      elapsedSeconds: Number(minutes) * 60,
      xpGained: xp.trim() ? Number(xp) : undefined
    };
    const error = validateHuntCalibrationInput(input);
    const sample = error ? null : recordHuntCalibration(input);

    if (!sample) {
      setMessage(error ?? 'No se pudo guardar la sesión.');
      return;
    }

    setMessage(
      `Sesión guardada: ${(sample.elapsedSeconds / sample.kills).toFixed(3)} s/kill. El ranking ya usa esta muestra.`
    );
  };

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-cyan-200">Calibración real de Hunts</h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Las sesiones reales sustituyen automáticamente la cadencia estimada y se guardan en este navegador.
            También acepta datos enviados por un bridge de Hunt Analyzer.
          </p>
        </div>
        <span className="text-[10px] font-mono text-cyan-300">
          {samples.length} muestras
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <label className="text-[10px] text-slate-400">
          ID presa {species ? <span className="text-cyan-300">· {species.name}</span> : <span className="text-rose-400">· no existe</span>}
          <input value={targetId} onChange={(e) => handleTargetIdChange(e.target.value)} type="number" min="1"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">
          Hunt Lv.
          <input value={huntLevel} onChange={(e) => setHuntLevel(e.target.value)} type="number" min="1"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">
          Kills
          <input value={kills} onChange={(e) => setKills(e.target.value)} type="number" min="10"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">
          Minutos
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min="5" step="0.1"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">
          XP ganada (opcional)
          <input value={xp} onChange={(e) => setXp(e.target.value)} type="number" min="0"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={submit}
          className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25">
          Registrar sesión real
        </button>
        <span className="text-[10px] text-slate-500">
          {calibration
            ? `Activo: ${calibration.cycleSeconds.toFixed(3)} s/kill · ${(3600 / calibration.cycleSeconds).toFixed(1)} kills/h · ${calibration.sampleCount} muestra(s) reales`
            : 'Sin muestra: se usa el modelo base.'}
        </span>
      </div>

      {message && <div className="text-[10px] text-cyan-300">{message}</div>}
    </section>
  );
};
