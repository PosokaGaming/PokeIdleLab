import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { POKEMON_TIER_DATA, OfficialPokemon } from '../../data/pokemonTierData';

const normalize = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export interface SpeciesSelectProps {
  value: number;
  onChange: (id: number) => void;
  /** Lista de Pokémon a mostrar. Por defecto: todos. */
  pokemonList?: OfficialPokemon[];
  /** Muestra el meta-tier a la derecha de cada opción. */
  showMetaTier?: boolean;
  className?: string;
}

/**
 * Selector de Pokémon con búsqueda por nombre o número.
 * Usado por el Optimizador EXP/h y la Calculadora de Rareza + IVs.
 */
export const SpeciesSelect: React.FC<SpeciesSelectProps> = ({
  value,
  onChange,
  pokemonList,
  showMetaTier = false,
  className,
}) => {
  const list = useMemo(
    () => [...(pokemonList ?? POKEMON_TIER_DATA)].sort((a, b) => a.id - b.id),
    [pokemonList]
  );
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

  if (!selected) return null;

  return (
    <div ref={wrapRef} className={className ? `relative ${className}` : 'relative'}>
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
          {results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
          )}
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
              {showMetaTier && (
                <span className="ml-auto text-[10px] text-slate-500">{p.playerMetaTier}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
