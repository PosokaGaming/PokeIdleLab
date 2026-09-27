// ==UserScript==
// @name         PokeIdleLab - Hunt Analyzer Bridge
// @namespace    pokeidlelab
// @version      1.0.0
// @description  Envía el Hunt Analyzer real de PokéIdle a PokeIdleLab mediante el endpoint local.
// @author       PokeIdleLab
// ==/UserScript==

(async function () {
  'use strict';

  const ENDPOINT = 'http://127.0.0.1:3000/api/pokegrid-hunt';
  const POLL_MS = 30000;
  let creatures = null;
  let lastSentKey = '';

  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  async function loadCreatures() {
    if (creatures) return creatures;
    try {
      const response = await fetch('/game/creatures.json', { cache: 'no-store' });
      const data = await response.json();
      creatures = Array.isArray(data?.creatures) ? data.creatures : [];
    } catch {
      creatures = [];
    }
    return creatures;
  }

  async function findTarget(slug) {
    const list = await loadCreatures();
    const wanted = slugify(slug);
    if (!wanted) return null;

    const exact = list.find((c) => slugify(c?.name) === wanted);
    if (exact) return exact;

    const contains = list.find((c) => {
      const candidate = slugify(c?.name);
      return candidate && (candidate.includes(wanted) || wanted.includes(candidate));
    });
    return contains || null;
  }

  async function sendAnalyzer() {
    try {
      const P = window.__poke;
      if (!P || !P.ws) return;

      const analyzer = P.ws.analyzer;
      const field = P.ws['field-init'];
      const slug = P.lastSlug || field?.slug || '';
      if (!analyzer || !slug) return;

      const kills = Number(analyzer.kills);
      const elapsedSeconds = Number(analyzer.seconds);
      const xpGained = Number(analyzer.xpGained);

      // Mismas condiciones mínimas que PokeIdleLab: sesión suficientemente estable.
      if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds)) return;
      if (kills < 10 || elapsedSeconds < 300) return;

      const target = await findTarget(slug);
      if (!target || !Number.isFinite(Number(target.pokeId))) return;

      const payload = {
        source: 'pokegrid',
        type: 'POKEGRID_HUNT_CALIBRATION',
        targetId: Number(target.pokeId),
        huntLevel: Number(target.huntLevel) || 0,
        kills,
        elapsedSeconds,
        xpGained: Number.isFinite(xpGained) ? xpGained : undefined,
        huntSlug: String(slug)
      };

      const key = [
        payload.targetId,
        payload.huntLevel,
        payload.kills,
        payload.elapsedSeconds,
        payload.xpGained ?? ''
      ].join('|');

      if (key === lastSentKey) return;

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      });

      if (response.ok) lastSentKey = key;
    } catch {
      // El bridge es opcional: si PokeIdleLab no está abierto, el juego sigue funcionando.
    }
  }

  await sendAnalyzer();
  setInterval(sendAnalyzer, POLL_MS);
})();
