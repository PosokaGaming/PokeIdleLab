// ==UserScript==
// @name         PokeIdleLab - Hunt Analyzer Bridge
// @namespace    pokeidlelab
// @version      1.1.0
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

  log('Bridge iniciado. Endpoint:', ENDPOINT, 'Intervalo:', POLL_MS + 'ms');

  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  async function loadCreatures() {
    if (creatures) return creatures;
    log('Cargando /game/creatures.json...');
    try {
      const response = await fetch('/game/creatures.json', { cache: 'no-store' });
      log('creatures.json respondió:', response.status);
      const data = await response.json();
      creatures = Array.isArray(data?.creatures) ? data.creatures : [];
      log('Criaturas cargadas:', creatures.length);
    } catch (error) {
      creatures = [];
      warn('No se pudo cargar creatures.json:', error);
    }
    return creatures;
  }

  async function findTarget(slug) {
    const list = await loadCreatures();
    const wanted = slugify(slug);
    if (!wanted) {
      warn('No hay slug de hunt.');
      return null;
    }

    const exact = list.find((c) => slugify(c?.name) === wanted);
    if (exact) return exact;

    const contains = list.find((c) => {
      const candidate = slugify(c?.name);
      return candidate && (candidate.includes(wanted) || wanted.includes(candidate));
    });
    return contains || null;
  }

  async function sendAnalyzer() {
    log('Comprobando PokeGrid...');

    try {
      const P = window.__poke;

      if (!P) {
        warn('window.__poke NO existe.');
        return;
      }
      log('__poke encontrado. Claves:', Object.keys(P));

      if (!P.ws) {
        warn('__poke.ws NO existe.');
        return;
      }

      const analyzer = P.ws.analyzer;
      const field = P.ws['field-init'];
      const slug = P.lastSlug || field?.slug || '';

      log('Estado:', {
        analyzer: !!analyzer,
        fieldInit: !!field,
        lastSlug: P.lastSlug || null,
        fieldSlug: field?.slug || null
      });

      if (!analyzer) {
        warn('Hunt Analyzer todavía no está disponible.');
        return;
      }

      if (!slug) {
        warn('No se ha encontrado el slug de la hunt.');
        return;
      }

      const kills = Number(analyzer.kills);
      const elapsedSeconds = Number(analyzer.seconds);
      const xpGained = Number(analyzer.xpGained);

      log('Analyzer:', { kills, elapsedSeconds, xpGained, slug });

      if (!Number.isFinite(kills) || !Number.isFinite(elapsedSeconds)) {
        warn('Kills/tiempo no son números válidos.');
        return;
      }

      if (kills < 10 || elapsedSeconds < 300) {
        log('Sesión todavía demasiado corta. Se requieren >=10 kills y >=300s.');
        return;
      }

      const target = await findTarget(slug);
      if (!target) {
        warn('No se encontró la criatura para slug:', slug);
        return;
      }

      if (!Number.isFinite(Number(target.pokeId))) {
        warn('La criatura encontrada no tiene pokeId válido:', target);
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
        log('Sin cambios desde el último envío.');
        return;
      }

      log('Enviando datos al servidor local...', payload);

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      });

      log('Respuesta del servidor:', response.status, response.statusText);

      if (response.ok) {
        lastSentKey = key;
        log('ENVÍO CORRECTO.');
      } else {
        warn('El servidor rechazó el envío.');
      }
    } catch (error) {
      warn('ERROR durante la comprobación/envío:', error);
    }
  }

  await sendAnalyzer();
  setInterval(sendAnalyzer, POLL_MS);
})();