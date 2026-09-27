import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';

export default defineConfig(() => {
  let latestHuntAnalyzer: Record<string, unknown> | null = null;

  // configureServer es un hook de plugin: suelto en la configuración, Vite lo
  // ignoraba y /api/pokegrid-hunt respondía 404 (POST) o el index.html (GET).
  const pokegridBridge: Plugin = {
    name: 'pokegrid-hunt-bridge',
    configureServer(server) {
      server.middlewares.use('/api/pokegrid-hunt', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') {
          console.log('[POKEGRID] Preflight recibido.');
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(latestHuntAnalyzer));
          return;
        }
        if (req.method !== 'POST') { next(); return; }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (!data || data.source !== 'pokegrid' || !Number.isFinite(Number(data.targetId))) {
              console.log('[POKEGRID] Payload rechazado: datos inválidos');
              res.statusCode = 400; res.end('invalid hunt analyzer payload'); return;
            }
            latestHuntAnalyzer = data;
            console.log(
              '[POKEGRID] Datos recibidos:',
              `targetId=${data.targetId}`,
              `huntLevel=${data.huntLevel ?? '-'}`,
              `kills=${data.kills ?? '-'}`,
              `elapsed=${data.elapsedSeconds ?? '-'}s`,
              `xp=${data.xpGained ?? '-'}`,
              `slug=${data.huntSlug ?? '-'}`
            );
            console.log('[POKEGRID] Calibración disponible para PokeIdleLab.');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            console.log('[POKEGRID] Payload rechazado: JSON inválido');
            res.statusCode = 400; res.end('invalid json');
          }
        });
        return;
      });
    },
  };

  return {
    plugins: [react(), tailwindcss(), pokegridBridge],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
    server: {
      // Solo esta PC (IPv4). El bridge llega por http://localhost:3000: el
      // navegador prueba ::1 y cae a 127.0.0.1. 0.0.0.0 exponía la web a la red
      // local y no hacía falta: el bridge fallaba porque el endpoint no existía.
      // Para abrirla desde otro dispositivo: npm run dev:lan
      host: '127.0.0.1',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});