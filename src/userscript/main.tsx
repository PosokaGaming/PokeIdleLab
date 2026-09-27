/**
 * Entrada de la extensión de Tampermonkey: monta la web de PokeIdleLab dentro
 * del juego, en un Shadow DOM para que ni sus estilos rompan el juego ni los
 * del juego rompan la web. Trae también el Analyzer de IV y el aviso de ventas.
 */
import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { X } from 'lucide-react';
import App from '../App';
import appCss from '../index.css?inline';
import '../../scripts/pokeidlelab-iv.user.js';
import '../../scripts/pokeidlelab-market-sales.user.js';

const HOST_ID = 'pokeidlelab-extension';
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap';

// El juego puede cambiar el tamaño de letra de <html>; los rem de Tailwind
// dependen de él, así que se fijan en px (1rem = 16px).
function remToPx(css: string): string {
  return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${parseFloat(n) * 16}px`);
}

// Las reglas @property no se aplican dentro de un shadow root; Tailwind las usa
// para sombras, anillos y transformaciones, así que se registran en el documento.
function splitPropertyRules(css: string): { properties: string; rest: string } {
  const rules = css.match(/@property\s+[^{]+\{[^}]*\}/g) ?? [];
  let rest = css;
  for (const rule of rules) rest = rest.replace(rule, '');
  return { properties: rules.join('\n'), rest };
}

// Las propiedades heredables (letter-spacing, line-height, color…) que el juego
// ponga sobre el host se cortan aquí: nada de afuera baja a la web.
const EXTENSION_CSS = `
.pil-root { all: initial; display: block; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; color: #f1f5f9; line-height: 1.5; }
[data-web-only] { display: none !important; }
`;

function Extension({ host }: { host: HTMLElement }) {
  const [open, setOpen] = useState(false);
  // La web se monta la primera vez que se abre y después se conserva oculta,
  // para no calcular el optimizador al cargar el juego ni perder filtros al cerrar.
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    // Si el foco quedó en el <body> del juego (p. ej. tras elegir una opción de
    // un desplegable que desaparece), las teclas no deben llegar al juego y Esc
    // tiene que cerrar igual. Las que nacen dentro de la web siguen su camino.
    const onKey = (e: KeyboardEvent) => {
      if (e.composedPath().includes(host)) return;
      if (e.type === 'keydown' && e.key === 'Escape') setOpen(false);
      e.stopPropagation();
    };
    const types = ['keydown', 'keyup', 'keypress'] as const;
    for (const type of types) window.addEventListener(type, onKey, true);
    return () => {
      for (const type of types) window.removeEventListener(type, onKey, true);
    };
  }, [open, host]);

  return (
    <div className="pil-root">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Abrir PokeIdleLab"
          className="fixed right-0 top-1/2 -translate-y-1/2 rounded-l-lg border border-r-0 border-amber-500/40 bg-[#090b10]/90 px-1.5 py-3 text-[11px] font-bold tracking-wider text-amber-300 shadow-lg shadow-black/50 hover:bg-[#12161f] [writing-mode:vertical-rl]"
        >
          PokeIdleLab
        </button>
      )}

      {mounted && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          style={{ display: open ? 'block' : 'none' }}
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-label="PokeIdleLab"
            className="absolute inset-2 sm:inset-5 flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#090b10] shadow-2xl shadow-black outline-none"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Cerrar (Esc)"
              className="absolute right-3 top-3 z-50 rounded-lg border border-slate-700 bg-slate-900/90 p-1.5 text-slate-300 hover:border-amber-500/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 overflow-y-auto">
              <App />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  // Le indica a la web que corre dentro del juego (p. ej. el bridge de
  // calibración no debe consultar /api en el servidor de poke.idleworld.online).
  (window as Window & { __POKEIDLELAB_EXTENSION__?: boolean }).__POKEIDLELAB_EXTENSION__ = true;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // En línea para ganarle a reglas del juego como `* { … }` o `div { … }`.
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;';

  // Las teclas que se escriben en la web no deben llegar a los atajos del juego.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const { properties, rest } = splitPropertyRules(remToPx(appCss));

  if (properties && !document.getElementById(`${HOST_ID}-properties`)) {
    const propertiesStyle = document.createElement('style');
    propertiesStyle.id = `${HOST_ID}-properties`;
    propertiesStyle.textContent = properties;
    document.head.appendChild(propertiesStyle);
  }
  if (!document.getElementById(`${HOST_ID}-fonts`)) {
    const fonts = document.createElement('link');
    fonts.id = `${HOST_ID}-fonts`;
    fonts.rel = 'stylesheet';
    fonts.href = FONTS_URL;
    document.head.appendChild(fonts);
  }

  const style = document.createElement('style');
  style.textContent = rest + EXTENSION_CSS;
  shadow.appendChild(style);

  const container = document.createElement('div');
  shadow.appendChild(container);
  document.body.appendChild(host);

  createRoot(container).render(
    <StrictMode>
      <Extension host={host} />
    </StrictMode>
  );

  // El juego es una SPA (Next.js): si en algún render quita nodos ajenos del
  // <body>, se vuelve a colgar el mismo host sin perder el estado de React.
  setInterval(() => {
    if (!host.isConnected) document.body.appendChild(host);
  }, 2000);
}

mount();
