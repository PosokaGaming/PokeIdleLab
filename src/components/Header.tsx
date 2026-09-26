import React from 'react';
import { Shield, Sparkles, Users } from 'lucide-react';
import { OfficialPokemon } from '../data/pokemonTierData';

interface HeaderProps {
  activeTab: 'tierlist' | 'power' | 'calculators' | 'items';
  setActiveTab: (tab: 'tierlist' | 'power' | 'calculators' | 'items') => void;
  savedTeam: OfficialPokemon[];
  setIsTeamDrawerOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  savedTeam,
  setIsTeamDrawerOpen,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#090b10]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('tierlist');
          }}
          className="text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors flex items-center gap-2"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block"></span>
          <span>PokéIdle Compendium</span>
        </a>

        {/* Zone 2: 4-6 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('tierlist')}
            className={`transition-colors hover:text-white py-1 ${
              activeTab === 'tierlist'
                ? 'text-white border-b-2 border-amber-500 font-semibold'
                : ''
            }`}
          >
            Tier List
          </button>
          <button
            onClick={() => setActiveTab('power')}
            className={`transition-colors hover:text-white py-1 ${
              activeTab === 'power'
                ? 'text-white border-b-2 border-amber-500 font-semibold'
                : ''
            }`}
          >
            Calculadora de Rareza + Iv's
          </button>
          <button
            onClick={() => setActiveTab('calculators')}
            className={`transition-colors hover:text-white py-1 ${
              activeTab === 'calculators'
                ? 'text-white border-b-2 border-amber-500 font-semibold'
                : ''
            }`}
          >
            Optimizador EXP/h
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`transition-colors hover:text-white py-1 ${
              activeTab === 'items'
                ? 'text-white border-b-2 border-amber-500 font-semibold'
                : ''
            }`}
          >
            Base de Objetos
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          <a
            href="https://poke.idleworld.online/"
            target="_blank"
            rel="noopener noreferrer"
            data-web-only
            className="hidden sm:inline-flex items-center text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Jugar Oficial ↗
          </a>
          <button
            onClick={() => setIsTeamDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-100 transition-colors shadow-sm"
          >
            <Users className="h-3.5 w-3.5 text-amber-400" />
            <span>Mi Equipo</span>
            <span className="ml-1 text-[11px] font-mono font-semibold text-amber-300">
              {savedTeam.length}/6
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="flex md:hidden overflow-x-auto border-t border-slate-800/80 px-4 py-2 text-xs scrollbar-none gap-4 text-slate-400">
        <button
          onClick={() => setActiveTab('tierlist')}
          className={`whitespace-nowrap shrink-0 ${
            activeTab === 'tierlist' ? 'text-amber-400 font-semibold' : ''
          }`}
        >
          Tier List
        </button>
        <button
          onClick={() => setActiveTab('power')}
          className={`whitespace-nowrap shrink-0 ${
            activeTab === 'power' ? 'text-amber-400 font-semibold' : ''
          }`}
        >
          Rareza + Iv's
        </button>
        <button
          onClick={() => setActiveTab('calculators')}
          className={`whitespace-nowrap shrink-0 ${
            activeTab === 'calculators' ? 'text-amber-400 font-semibold' : ''
          }`}
        >
          Optimizador EXP
        </button>
        <button
          onClick={() => setActiveTab('items')}
          className={`whitespace-nowrap shrink-0 ${
            activeTab === 'items' ? 'text-amber-400 font-semibold' : ''
          }`}
        >
          Objetos
        </button>
      </div>
    </header>
  );
};
