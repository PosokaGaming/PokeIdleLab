import React, { useEffect, useState } from 'react';
import { installHuntCalibrationBridge } from './data/huntCalibration';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { TierList } from './components/TierList';
import { PowerCalculator } from './components/PowerCalculator';
import { DatabaseItems } from './components/DatabaseItems';
import { TeamBuilderDrawer } from './components/TeamBuilderDrawer';
import { HuntXpOptimizer } from './components/HuntXpOptimizer';
import { OfficialPokemon, POKEMON_TIER_DATA } from './data/pokemonTierData';

export default function App() {
  useEffect(() => installHuntCalibrationBridge(), []);

  const [activeTab, setActiveTab] = useState<
    'tierlist' | 'power' | 'calculators' | 'items'
  >('tierlist');

  const [selectedCalcPokemon, setSelectedCalcPokemon] = useState<OfficialPokemon | null>(null);
  const [calcInitialPlayerLevel, setCalcInitialPlayerLevel] = useState<number | undefined>(undefined);
  const [isTeamDrawerOpen, setIsTeamDrawerOpen] = useState<boolean>(false);

  // Saved Team in LocalStorage
  const [savedTeam, setSavedTeam] = useState<OfficialPokemon[]>(() => {
    try {
      const stored = localStorage.getItem('pokeidle_saved_team_v2');
      if (stored) {
        const ids: number[] = JSON.parse(stored);
        return POKEMON_TIER_DATA.filter((p) => ids.includes(p.id));
      }
      // Default initial team: Mewtwo (#150), Alakazam (#65), Gyarados (#130)
      const defaultMembers = [
        POKEMON_TIER_DATA.find((p) => p.id === 150),
        POKEMON_TIER_DATA.find((p) => p.id === 65),
        POKEMON_TIER_DATA.find((p) => p.id === 130),
      ].filter(Boolean) as OfficialPokemon[];
      return defaultMembers;
    } catch {
      return [];
    }
  });

  const handleToggleTeamMember = (pokemon: OfficialPokemon) => {
    let nextTeam: OfficialPokemon[];
    if (savedTeam.some((m) => m.id === pokemon.id)) {
      nextTeam = savedTeam.filter((m) => m.id !== pokemon.id);
    } else {
      if (savedTeam.length >= 6) {
        setIsTeamDrawerOpen(true);
        return;
      }
      nextTeam = [...savedTeam, pokemon];
    }
    setSavedTeam(nextTeam);
    try {
      localStorage.setItem('pokeidle_saved_team_v2', JSON.stringify(nextTeam.map((p) => p.id)));
    } catch {}
  };

  const handleRemoveFromTeam = (pokemonId: number) => {
    const nextTeam = savedTeam.filter((m) => m.id !== pokemonId);
    setSavedTeam(nextTeam);
    try {
      localStorage.setItem('pokeidle_saved_team_v2', JSON.stringify(nextTeam.map((p) => p.id)));
    } catch {}
  };

  const handleClearTeam = () => {
    setSavedTeam([]);
    try {
      localStorage.removeItem('pokeidle_saved_team_v2');
    } catch {}
  };

  const handleSelectForHuntOptimizer = (pokemon: OfficialPokemon, level?: number) => {
    setSelectedCalcPokemon(pokemon);
    if (level !== undefined) {
      setCalcInitialPlayerLevel(level);
    }
    setActiveTab('calculators');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090b10] text-slate-100 selection:bg-amber-500/20 selection:text-amber-300">
      {/* Top Bar Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedTeam={savedTeam}
        setIsTeamDrawerOpen={setIsTeamDrawerOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Tier List Tab */}
        {activeTab === 'tierlist' && (
          <TierList
            onSelectForCalculator={handleSelectForHuntOptimizer}
            onSelectForHuntOptimizer={handleSelectForHuntOptimizer}
            savedTeam={savedTeam}
            onToggleTeamMember={handleToggleTeamMember}
          />
        )}

        {/* Calculadora de Rareza + Iv's */}
        {activeTab === 'power' && <PowerCalculator />}

        {/* Dedicated Hunt XP/Hour Optimizer Tab */}
        {activeTab === 'calculators' && (
          <HuntXpOptimizer
            savedTeam={savedTeam}
            initialPokemon={selectedCalcPokemon}
            initialPlayerLevel={calcInitialPlayerLevel}
          />
        )}

        {/* Database of Items Tab */}
        {activeTab === 'items' && <DatabaseItems />}

      </main>

      {/* Team Builder Drawer Modal */}
      <TeamBuilderDrawer
        isOpen={isTeamDrawerOpen}
        onClose={() => setIsTeamDrawerOpen(false)}
        team={savedTeam}
        onRemoveFromTeam={handleRemoveFromTeam}
        onClearTeam={handleClearTeam}
        onLoadInCalculator={handleSelectForHuntOptimizer}
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}
