/**
 * Suma al Hunt Analyzer del juego dos tarjetas: cuánta XP le falta al Pokémon
 * que está cazando para subir de nivel y en cuánto tiempo lo hará.
 *
 * Los datos salen del WebSocket del juego:
 *   - "poke-xp"   {speciesId, xp (total), level, xpGained}  en cada derrota
 *   - "analyzer"  {killsPerHour, …}                          cada 4 s con el panel abierto
 * El socket se engancha cuando el juego envía algo (con el Hunt Analyzer
 * abierto pide "analyzer-get" cada 4 s): no hace falta correr antes que el
 * juego ni enviarle nada propio al servidor.
 */
import { getLevelProgress } from '../data/calculatorHelpers';
import { POKEMON_TIER_DATA } from '../data/pokemonTierData';

interface PokeXpMessage {
  type: 'poke-xp';
  speciesId: number;
  xp: number;
  level: number;
  xpGained: number;
}

interface FieldKillMessage {
  type: 'field-kill';
  pokeXp?: { speciesId: number; xpGained: number };
}

interface AnalyzerMessage {
  type: 'analyzer';
  killsPerHour?: number;
}

const CARD_ATTR = 'data-pokeidlelab-levelup';
const RECENT_GAINS = 20;

const state = {
  /** Especie del Pokémon que caza (la del pokeXp de cada derrota). */
  hunterSpecies: null as number | null,
  /** Última XP total conocida de cada especie que ganó XP. */
  bySpecies: new Map<number, PokeXpMessage>(),
  /** XP que ganó el cazador en las últimas derrotas. */
  gains: [] as number[],
  killsPerHour: 0,
};

const speciesName = new Map(POKEMON_TIER_DATA.map((p) => [p.id, p.name]));

function onMessage(ev: MessageEvent): void {
  const raw = ev.data;
  // El juego manda decenas de mensajes por segundo: solo se parsean los que importan.
  if (typeof raw !== 'string') return;
  if (raw.startsWith('{"type":"poke-xp"')) {
    try {
      const msg = JSON.parse(raw) as PokeXpMessage;
      if (!Number.isFinite(msg.xp)) return;
      state.bySpecies.set(msg.speciesId, msg);
      if (state.hunterSpecies === null) state.hunterSpecies = msg.speciesId;
      render();
    } catch {}
  } else if (raw.startsWith('{"type":"field-kill"')) {
    try {
      const msg = JSON.parse(raw) as FieldKillMessage;
      const hunter = msg.pokeXp;
      if (!hunter || !Number.isFinite(hunter.speciesId)) return;
      if (state.hunterSpecies !== hunter.speciesId) state.gains = [];
      state.hunterSpecies = hunter.speciesId;
      if (Number.isFinite(hunter.xpGained) && hunter.xpGained > 0) {
        state.gains.push(hunter.xpGained);
        if (state.gains.length > RECENT_GAINS) state.gains.shift();
      }
      render();
    } catch {}
  } else if (raw.startsWith('{"type":"analyzer"')) {
    try {
      const msg = JSON.parse(raw) as AnalyzerMessage;
      if (Number.isFinite(msg.killsPerHour)) state.killsPerHour = Number(msg.killsPerHour);
      render();
    } catch {}
  }
}

function tapGameSocket(): void {
  const w = window as Window & { __POKEIDLELAB_WS_TAP__?: boolean };
  if (w.__POKEIDLELAB_WS_TAP__) return;
  w.__POKEIDLELAB_WS_TAP__ = true;
  const seen = new WeakSet<WebSocket>();
  const originalSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (this: WebSocket, data) {
    if (!seen.has(this) && /\/ws\d*(\?|$)/.test(this.url)) {
      seen.add(this);
      this.addEventListener('message', onMessage);
    }
    return originalSend.call(this, data);
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

function card(icon: string, key: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'ha-card';
  el.setAttribute(CARD_ATTR, key);
  el.innerHTML = `<span class="ha-card-ico">${icon}</span><div><b></b><small></small></div>`;
  return el;
}

function setCard(el: Element, value: string, label: string, title: string): void {
  const b = el.querySelector('b');
  const small = el.querySelector('small');
  if (b && b.textContent !== value) b.textContent = value;
  if (small && small.textContent !== label) small.textContent = label;
  if (el.getAttribute('title') !== title) el.setAttribute('title', title);
}

function render(): void {
  const grid = document.querySelector('.ha-window .ha-grid');
  if (!grid) return;

  let xpCard = grid.querySelector(`[${CARD_ATTR}="xp"]`);
  let timeCard = grid.querySelector(`[${CARD_ATTR}="time"]`);
  if (!xpCard) grid.appendChild((xpCard = card('🆙', 'xp')));
  if (!timeCard) grid.appendChild((timeCard = card('⏳', 'time')));

  const poke = state.hunterSpecies === null ? undefined : state.bySpecies.get(state.hunterSpecies);
  if (!poke) {
    setCard(xpCard, '—', 'XP para subir de nivel', 'Aparece con la próxima derrota del Pokémon que caza.');
    setCard(timeCard, '—', 'Tiempo para subir de nivel', 'Aparece con la próxima derrota del Pokémon que caza.');
    return;
  }

  const progress = getLevelProgress(poke.xp);
  const remaining = Math.max(0, progress.max - progress.cur);
  const pct = (progress.cur / progress.max) * 100;
  const name = speciesName.get(poke.speciesId) ?? 'Pokémon';
  setCard(
    xpCard,
    fmt(remaining),
    `XP para Nv. ${progress.level + 1} · ${name} (${pct.toFixed(1).replace('.', ',')} %)`,
    `${name} Nv. ${progress.level}: ${fmt(progress.cur)} de ${fmt(progress.max)} XP del nivel.`
  );

  const perKill = state.gains.length ? state.gains.reduce((a, b) => a + b, 0) / state.gains.length : 0;
  const xpPerHour = perKill * state.killsPerHour;
  if (xpPerHour > 0) {
    const minutes = (remaining / xpPerHour) * 60;
    const eta = new Date(Date.now() + minutes * 60000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    setCard(
      timeCard,
      `~${formatDuration(minutes)}`,
      `Tiempo para subir de nivel (≈ ${eta})`,
      `${fmt(xpPerHour)} XP/h del Pokémon: ${fmt(perKill)} XP por derrota × ${fmt(state.killsPerHour)} derrotas/h.`
    );
  } else {
    setCard(timeCard, '—', 'Tiempo para subir de nivel', 'Falta el ritmo de derrotas del Hunt Analyzer.');
  }
}

export function installHuntLevelUp(): void {
  tapGameSocket();
  // El Hunt Analyzer se abre y se cierra (y React lo redibuja): se revisa cada
  // segundo si hacen falta las tarjetas; sin la ventana abierta no hace nada.
  window.setInterval(render, 1000);
}
