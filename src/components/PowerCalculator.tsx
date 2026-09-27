import React, { useMemo, useState } from 'react';
import { Gauge, Scale, Info, TrendingUp } from 'lucide-react';
import { POKEMON_TIER_DATA as ALL_POKEMON, OfficialPokemon } from '../data/pokemonTierData';
import { QUALITY_BANDS, QUALITY_EXP, getQualityBand, getPokemonGeneration } from '../data/calculatorHelpers';
import { SpeciesSelect } from './shared/SpeciesSelect';

// De momento el servidor solo tiene la 1ª y 2ª generación
const POKEMON_TIER_DATA = ALL_POKEMON.filter((p) => getPokemonGeneration(p.id) <= 2);

/**
 * Calculadora de Poder (Power).
 *   stat  = round( (base + 2×growth) × nivel/100 × Calidad^exp )
 *   Power = (HP + Atk + Def + SpAtk + SpDef + Vel) × Calidad
 * La Calidad entra dos veces (en cada stat y en el Power); el IV solo suma 2×growth a la base.
 * growth = IV total / 6, con IV total de 0 a 192 (igual que el optimizador de EXP).
 */

interface Config {
  speciesId: number;
  level: number;
  totalIv: number;
  quality: number;
}

const STAT_LABELS = ['HP', 'Ataque', 'Defensa', 'Atq. Esp.', 'Def. Esp.', 'Velocidad'] as const;

const QUALITY_PRESETS = [
  { label: 'Común', value: 1.05 },
  { label: 'Poco común', value: 1.2 },
  { label: 'Rara', value: 1.4 },
  { label: 'Épica', value: 1.6 },
  { label: 'Legendaria', value: 1.85 },
  { label: 'Mítica', value: 2.4 },
];

const bases = (p: OfficialPokemon) => [p.baseHp, p.baseAtk, p.baseDef, p.baseSpAtk, p.baseSpDef, p.baseSpeed];

function compute(p: OfficialPokemon, c: Config, exp: number) {
  const growth = c.totalIv / 6;
  const stats = bases(p).map((b) =>
    Math.max(1, Math.round((b + 2 * growth) * (c.level / 100) * Math.pow(c.quality, exp)))
  );
  const sum = stats.reduce((a, b) => a + b, 0);
  return { stats, sum, power: Math.round(sum * c.quality) };
}

const fmt = (n: number) => n.toLocaleString('es-ES');

const ConfigPanel: React.FC<{
  title: string;
  accent: string;
  config: Config;
  onChange: (c: Config) => void;
  exp: number;
}> = ({ title, accent, config, onChange, exp }) => {
  const pokemon = POKEMON_TIER_DATA.find((p) => p.id === config.speciesId) || POKEMON_TIER_DATA[0];
  const result = useMemo(() => compute(pokemon, config, exp), [pokemon, config, exp]);
  const band = getQualityBand(config.quality);
  const set = (patch: Partial<Config>) => onChange({ ...config, ...patch });

  const plusIv = compute(pokemon, { ...config, totalIv: Math.min(192, config.totalIv + 12) }, exp).power - result.power;
  const plusQ = compute(pokemon, { ...config, quality: config.quality + 0.1 }, exp).power - result.power;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1017] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold uppercase tracking-wide ${accent}`}>{title}</h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${band.badgeColor}`}>{band.name}</span>
      </div>

      <SpeciesSelect value={pokemon.id} onChange={(id) => set({ speciesId: id })} pokemonList={POKEMON_TIER_DATA} />

      <div className="grid grid-cols-1 gap-3 text-xs text-slate-300">
        <div className="block">
          <div className="mb-1">Nivel <span className="text-slate-500">(sin nivel máximo)</span></div>
          <div className="flex items-center gap-1.5">
            {[-10, -1].map((d) => (
              <button key={d} type="button" onClick={() => set({ level: Math.max(1, config.level + d) })}
                className="px-2 py-1 rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-amber-300 hover:border-amber-500/50 font-mono">
                {d}
              </button>
            ))}
            <input
              type="number" min={1} step={1} value={config.level}
              onChange={(e) => set({ level: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
              className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-center font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
            />
            {[1, 10].map((d) => (
              <button key={d} type="button" onClick={() => set({ level: config.level + d })}
                className="px-2 py-1 rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-amber-300 hover:border-amber-500/50 font-mono">
                +{d}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <div className="flex justify-between mb-1">
            <span>IV total (growth medio {(config.totalIv / 6).toFixed(1)})</span>
            <span className="font-mono text-amber-400 font-bold">{config.totalIv} / 192</span>
          </div>
          <input type="range" min={0} max={192} value={config.totalIv}
            onChange={(e) => set({ totalIv: Number(e.target.value) })} className="w-full accent-amber-500" />
        </label>
        <label className="block">
          <div className="flex justify-between mb-1 items-center">
            <span>Calidad</span>
            <input
              type="number" min={0.5} max={6} step={0.05} value={config.quality}
              onChange={(e) => set({ quality: Math.max(0.1, Number(e.target.value) || 1) })}
              className="w-20 rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-right font-mono text-amber-400 font-bold focus:outline-none focus:border-amber-500"
            />
          </div>
          <input type="range" min={0.5} max={4.5} step={0.05} value={Math.min(4.5, config.quality)}
            onChange={(e) => set({ quality: Number(e.target.value) })} className="w-full accent-amber-500" />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {QUALITY_PRESETS.map((q) => (
              <button key={q.label} type="button" onClick={() => set({ quality: q.value })}
                className="px-1.5 py-0.5 rounded border border-slate-800 bg-slate-900 text-[10px] text-slate-400 hover:text-amber-300 hover:border-amber-500/50">
                {q.label}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-slate-800">
          {STAT_LABELS.map((label, i) => (
            <div key={label} className="bg-slate-950 px-2.5 py-1.5">
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className="font-mono text-sm text-slate-100 font-semibold">{fmt(result.stats[i])}</div>
              <div className="text-[9px] text-slate-600">base {bases(pokemon)[i]}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/70 text-xs text-slate-400">
          <span>Suma de stats: <span className="font-mono text-slate-200">{fmt(result.sum)}</span> × Calidad {config.quality}</span>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-amber-200 flex items-center gap-1.5"><Gauge className="h-4 w-4" />Power</span>
        <span className="font-mono text-2xl font-bold text-amber-400">{fmt(result.power)}</span>
      </div>

      <div className="text-[11px] text-slate-400 flex items-start gap-2">
        <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
        <span>
          +12 de IV total suma <strong className="text-slate-200 font-mono">+{fmt(plusIv)}</strong> Power; +0.1 de Calidad
          suma <strong className="text-slate-200 font-mono">+{fmt(plusQ)}</strong>.
        </span>
      </div>
    </div>
  );
};

export const PowerCalculator: React.FC = () => {
  const [exp, setExp] = useState<number>(QUALITY_EXP);
  const [a, setA] = useState<Config>({ speciesId: POKEMON_TIER_DATA[0].id, level: 50, totalIv: 150, quality: 1.85 });
  const [b, setB] = useState<Config>({ speciesId: POKEMON_TIER_DATA[0].id, level: 50, totalIv: 190, quality: 1.6 });

  const pa = POKEMON_TIER_DATA.find((p) => p.id === a.speciesId) || POKEMON_TIER_DATA[0];
  const pb = POKEMON_TIER_DATA.find((p) => p.id === b.speciesId) || POKEMON_TIER_DATA[0];
  const ra = compute(pa, a, exp);
  const rb = compute(pb, b, exp);

  const winner = ra.power === rb.power ? null : ra.power > rb.power ? 'A' : 'B';
  const diffPct = ra.power === rb.power ? 0 : (Math.abs(ra.power - rb.power) / Math.min(ra.power, rb.power)) * 100;
  const sameSpecies = pa.id === pb.id;
  const naive = a.quality * a.totalIv === b.quality * b.totalIv ? null : a.quality * a.totalIv > b.quality * b.totalIv ? 'A' : 'B';
  const naiveLies = sameSpecies && winner && naive && naive !== winner;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Gauge className="h-6 w-6 text-amber-500" />
          Calculadora de Rareza + Iv's
        </h2>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Aquí ves cómo la Rareza (Calidad) y los IV's deciden el Power. Depende de la especie, el IV y la Calidad. La Calidad es la que más pesa: multiplica cada stat y
          vuelve a multiplicar la suma. El IV solo añade 2×growth a la base de la especie.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-300 font-mono space-y-1">
        <div>stat = round( (base + 2×growth) × nivel/100 × Calidad<sup>{exp}</sup> )</div>
        <div>Power = (HP + Atk + Def + SpAtk + SpDef + Vel) × Calidad</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ConfigPanel title="Pokémon A" accent="text-amber-400" config={a} onChange={setA} exp={exp} />
        <ConfigPanel title="Pokémon B" accent="text-sky-400" config={b} onChange={setB} exp={exp} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#0d1017] p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Scale className="h-4 w-4 text-amber-500" />
          Comparación
        </div>
        {winner ? (
          <p className="text-sm text-slate-200">
            Gana <strong className={winner === 'A' ? 'text-amber-400' : 'text-sky-400'}>Pokémon {winner}</strong> con{' '}
            <span className="font-mono">{fmt(Math.max(ra.power, rb.power))}</span> de Power, un{' '}
            <span className="font-mono">{diffPct.toFixed(1)}%</span> más (
            <span className="font-mono">+{fmt(Math.abs(ra.power - rb.power))}</span>).
          </p>
        ) : (
          <p className="text-sm text-slate-200">Empate exacto de Power.</p>
        )}
        {naiveLies && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            Ojo: con la cuenta "Calidad × IV" habría ganado Pokémon {naive}, y es falso. La Calidad pesa casi el doble
            que el IV, por eso gana el {winner} aunque su IV sea menor.
          </p>
        )}
        {sameSpecies && !naiveLies && winner && (
          <p className="text-xs text-slate-400">
            Misma especie: si la Calidad es muy distinta, casi siempre gana la más alta aunque tenga menos IV. Si es igual
            o parecida, comparar IVs sí sirve.
          </p>
        )}
      </div>

      <details className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-300 font-semibold">Ajuste avanzado: exponente de la Calidad</summary>
        <div className="mt-3 flex items-center gap-3">
          <span>Exponente</span>
          <input
            type="number" min={0.5} max={3} step={0.05} value={exp}
            onChange={(e) => setExp(Math.max(0.1, Number(e.target.value) || 1))}
            className="w-20 rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-right font-mono text-amber-400 focus:outline-none focus:border-amber-500"
          />
          <button type="button" onClick={() => setExp(QUALITY_EXP)} className="text-amber-400 hover:text-amber-300">
            Restablecer ({QUALITY_EXP})
          </button>
        </div>
        <p className="mt-2">
          La fórmula oficial usa Calidad<sup>exp</sup> dentro de cada stat. Este proyecto usa exp = {QUALITY_EXP}; si
          comprobaras en el juego que tu Power no cuadra, prueba a cambiarlo aquí.
        </p>
      </details>

      <div className="flex items-start gap-2 text-[11px] text-slate-500 max-w-3xl">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>
          Bandas de Calidad: {QUALITY_BANDS.map((q) => `${q.name} ${q.rangeLabel}`).join(' · ')}. Los stats base son los
          de la especie en la Pokepedia.
        </p>
      </div>
    </div>
  );
};
