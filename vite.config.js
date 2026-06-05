import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { renameSync } from 'fs'
import { dirname, join } from 'path'

// Plugin dev-only: expõe /api/renomear-pasta para renomear a pasta local do cliente
// após gerar os contratos. Só activo em `npm run dev` (não entra no build).
function auriApiPlugin() {
  return {
    name: 'auri-api',
    configureServer(server) {
      server.middlewares.use('/api/renomear-pasta', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', d => (body += d));
        req.on('end', () => {
          try {
            const { caminhoAtual, novoNome } = JSON.parse(body);
            const pasta = caminhoAtual.replace(/[\\/]+$/, '');
            const novo = join(dirname(pasta), novoNome);
            renameSync(pasta, novo);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, novoCaminho: novo }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, erro: e.message }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), auriApiPlugin()],
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
  build: {
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) exige manualChunks como função
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) {
            return 'recharts';
          }
          if (id.includes('node_modules/pdf-lib') || id.includes('node_modules/pdfjs-dist')) {
            return 'pdf';
          }
        },
      },
    },
  },
})
