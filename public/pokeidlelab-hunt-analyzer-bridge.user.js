// ==UserScript==
// @name         PokeIdleLab - Hunt Analyzer Bridge
// @namespace    pokeidlelab
// @version      1.2.0
// @description  Envía el Hunt Analyzer real de PokéIdle a PokeIdleLab mediante el endpoint local.
// @author       PokeIdleLab
// ==/UserScript==

(async function () {
  'use strict';

  const ENDPOINT = 'http://127.0.0.1:3000/api/pokegrid-hunt';
  const POLL_MS = 30000;
  let creatures = null;
  let lastSentKey = '';

  const log = (...args) => console.log('[POKEIDLELAB BRIDGE]', ...args);
  const warn = (...args) => console.warn('[POKEIDLELAB BRIDGE]', ...args);

  const badge = (() => {
    const el = document.createElement('div');
    el.id = 'pokeidlelab-bridge-status';
    el.textContent = 'PokeIdleLab: iniciando…';
    Object.assign(el.style, {
      position: 'fixed',
      right: '8px',
      bottom: '8px',
      zIndex: '2147483647',
      padding: '6px 9px',
      borderRadius: '6px',
      background: '#161b22',
      color: '#e6edf3',
      border: '1px solid #30363d',
      font: '12px/1.2 Arial,sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      pointerEvents: 'none'
    });
    (document.body || document.documentElement).appendChild(el);
    return el;
  })();

  const status = (text) => {
    badge.textContent = 'PokeIdleLab: ' + text;
    log(text);
  };

  status('bridge iniciado');

  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  async function loadCreatures() {
    if (creatures) return creatures;
    status('cargando criaturas…');
    try {
      const response = await fetch('/game/creatures.json', { cache: 'no-store' });
      const data = await response.json();
      creatures = Array.isArray(data?.creatures) ? data.creatures : [];
      status('criaturas: ' + creatures.length);
    } catch (error) {
      creatures = [];
      warn('No se pudo cargar creatures.json:', error);
      status('ERROR creatures.json');
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

      if (!P) {
        warn('window.__poke NO existe.');
        status('ERROR: __poke');
        return;
      }

      if (!P.ws) {
        warn('__poke.ws NO existe.');
        status('ERROR: __poke.ws');
        return;
      }

      const analyzer = P.ws.analyzer;
      const field = P.ws['field-init'];
      const slug = P.lastSlug || field?.slug || '';

      if (!analyzer) {
        status('esperando Hunt Analyzer…');
        return;
      }

      if (!slug) {
        status('Analyzer OK, esperando hunt…');
        return;
      }

      const kills = Number(analyzer.kills);
      const elapsedSeconds = Number(analyzer.seconds);
      const xpGained = Number(analyzer.xpGained);

      if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds)) {
        status('Analyzer con datos inválidos');
        return;
      }

      status('Analyzer: ' + kills + ' kills / ' + Math.round(elapsedSeconds) + 's');

      if (kills < 10 || elapsedSeconds < 300) return;

      const target = await findTarget(slug);
      if (!target || !Number.isFinite(Number(target.pokeId))) {
        warn('No se encontró criatura para:', slug);
        status('ERROR: criatura ' + slug);
        return;
      }

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

      if (key === lastSentKey) {
        status('sin cambios · ' + kills + ' kills');
        return;
      }

      status('enviando ' + kills + ' kills…');

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          lastSentKey = key;
          status('ENVIADO ✓ · ' + kills + ' kills');
          return;
        }

        warn('Servidor respondió:', response.status);
      } catch (corsError) {
        warn('CORS/PNA rechazó la petición; probando no-cors:', corsError);
        await fetch(ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload)
        });
        lastSentKey = key;
        status('ENVIADO ✓ · respuesta opaca');
        return;
      }

      status('ERROR HTTP');
    } catch (error) {
      warn('ERROR durante la comprobación/envío:', error);
      status('ERROR: ' + String(error?.message || error).slice(0, 45));
    }
  }

  await sendAnalyzer();
  setInterval(sendAnalyzer, POLL_MS);
})();