// ==UserScript==
// @name         PokeIdleLab Global Market Sales
// @namespace    poke-idle-lab
// @version      1.0.1
// @description  Muestra un aviso cuando una venta del Global Market se completa.
// @match        https://poke.idleworld.online/*
// @updateURL    https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/scripts/pokeidlelab-market-sales.user.js
// @downloadURL  https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/scripts/pokeidlelab-market-sales.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CFG = {
    id: "pokeidlelab-market-sale-toast",
    duration: 5000,
    cooldown: 1800
  };

  let lastSignature = "";
  let lastAt = 0;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));

  function injectStyle() {
    if (document.getElementById("pokeidlelab-market-sale-style")) return;

    const style = document.createElement("style");
    style.id = "pokeidlelab-market-sale-style";
    style.textContent = `
      #pokeidlelab-market-sale-toast {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(380px, calc(100vw - 40px));
        padding: 14px 16px;
        border: 1px solid rgba(218,174,70,.55);
        border-radius: 14px;
        background: linear-gradient(180deg, #171b25 0%, #0c111a 100%);
        color: #f4f5f7;
        box-shadow: 0 18px 55px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.03);
        font: 13px Arial, sans-serif;
        animation: pil-market-in .22s ease-out;
      }
      #pokeidlelab-market-sale-toast .pms-row {
        display:flex;
        align-items:center;
        gap:10px;
      }
      #pokeidlelab-market-sale-toast .pms-icon {
        width:38px;
        height:38px;
        display:grid;
        place-items:center;
        flex:0 0 38px;
        border-radius:10px;
        background:rgba(218,174,70,.13);
        border:1px solid rgba(218,174,70,.28);
        font-size:20px;
      }
      #pokeidlelab-market-sale-toast .pms-title {
        font-weight:900;
        font-size:14px;
        margin-bottom:3px;
      }
      #pokeidlelab-market-sale-toast .pms-text {
        color:#aeb7c6;
        line-height:1.35;
      }
      #pokeidlelab-market-sale-toast .pms-close {
        margin-left:auto;
        align-self:flex-start;
        border:0;
        background:transparent;
        color:#8792a3;
        cursor:pointer;
        font-size:18px;
        line-height:1;
      }
      @keyframes pil-market-in {
        from { opacity:0; transform:translateY(12px); }
        to { opacity:1; transform:translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message) {
    const now = Date.now();
    const signature = String(message || "").replace(/\s+/g, " ").trim().slice(0, 300);

    if (!signature || signature === lastSignature && now - lastAt < CFG.cooldown) return;
    lastSignature = signature;
    lastAt = now;

    const old = document.getElementById(CFG.id);
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.id = CFG.id;
    toast.innerHTML = `
      <div class="pms-row">
        <div class="pms-icon">💰</div>
        <div style="min-width:0">
          <div class="pms-title">¡Venta completada!</div>
          <div class="pms-text">${esc(message)}</div>
        </div>
        <button class="pms-close" aria-label="Cerrar">×</button>
      </div>
    `;

    toast.querySelector(".pms-close").onclick = () => toast.remove();
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, CFG.duration);
  }

  // El texto de un contenedor muy grande (la app entera) siempre incluye el
  // menú "Global Market"; solo cuentan paneles de tamaño razonable.
  const MAX_CONTEXT_TEXT = 3000;

  function isMarketContext(node) {
    const text = String(node?.textContent || "");
    if (/global\s+market/i.test(text)) return true;

    let el = node instanceof Element ? node : node?.parentElement;
    for (let i = 0; el && i < 6; i++, el = el.parentElement) {
      if (/market|listing/i.test(String(el.className || "") + " " + String(el.id || ""))) return true;
      const t = String(el.textContent || "");
      if (t.length <= MAX_CONTEXT_TEXT && /global\s+market/i.test(t)) return true;
    }

    return false;
  }

  function isNotification(node) {
    let el = node instanceof Element ? node : node?.parentElement;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      const role = el.getAttribute?.("role") || "";
      if (role === "alert" || role === "status") return true;
      if (/toast|notification|snackbar|alert/i.test(String(el.className || "") + " " + String(el.id || ""))) return true;
    }
    return false;
  }

  function looksLikeSale(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 500) return false;

    const sale = /(?:sold|sale completed|successfully sold|item sold|listing sold|vendido|venta completada|venta realizada|vendido correctamente)/i.test(t);
    if (!sale) return false;

    return /(?:global\s+market|market|listing|item|pokemon|pokémon|dollars|coins|dinero|precio|price)/i.test(t);
  }

  function cleanMessage(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const match = t.match(/(?:sold|sale completed|successfully sold|item sold|listing sold|vendido|venta completada|venta realizada|vendido correctamente).{0,220}/i);
    return match ? match[0].trim() : t.slice(0, 220);
  }

  function scan(root) {
    const candidates = [];

    // Nuestro propio aviso también dice "venta completada": no reaccionar a él.
    if (root?.closest?.("#" + CFG.id)) return;

    if (root instanceof Element) {
      candidates.push(root);
      root.querySelectorAll?.("*").forEach(el => {
        const cls = String(el.className || "").toLowerCase();
        const id = String(el.id || "").toLowerCase();
        if (
          /toast|notification|alert|snackbar|market|listing|history|request/.test(cls + " " + id)
        ) candidates.push(el);
      });
    }

    for (const el of candidates) {
      const text = el.textContent || "";
      if (!looksLikeSale(text)) continue;

      // Evita disparar por todo el panel del market: solo avisamos por
      // nodos pequeños que parezcan una notificación/resultado reciente.
      if (text.length > 500) continue;

      // Un "sold" en el chat o en un "Sold out" no es una venta nuestra.
      if (!isMarketContext(el) && !isNotification(el)) continue;
      showToast(cleanMessage(text));
      break;
    }
  }

  function init() {
    injectStyle();

    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(node => scan(node));
        } else if (mutation.type === "characterData") {
          scan(mutation.target.parentElement);
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log("[PokeIdleLab Market Sales] addon cargado v1.0.1");
  }

  init();
})();
