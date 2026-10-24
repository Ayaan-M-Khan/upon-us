/**
 * Impostor Protocol - Full-Stack Application Entry Point
 * Runs Express + Socket.IO and mounts Vite middlewares in dev mode, or serves dist in production.
 */

import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createGameServer } from './server/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  const { app, server } = createGameServer();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Impostor Protocol] Server ready on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[Impostor Protocol] Failed to start server:', err);
  process.exit(1);
});
