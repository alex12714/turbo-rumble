import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pageMetadata, renderPageHtml } from '../shared/site-metadata.ts';
import { Server } from 'socket.io';
import { initPhysics } from '../shared/simulation.ts';
import type { ServerConfig } from './config.ts';
import { ResultsStore } from './results-store.ts';
import { RoomRegistry } from './rooms.ts';
import { FixedWindowRateLimit } from './rate-limit.ts';
import { registerRealtime, type GameServer } from './realtime.ts';
import { registerHttp } from './http.ts';
import { startRuntime } from './runtime.ts';

export async function createGameServer(config: ServerConfig) {
  await initPhysics();
  const app = express(),
    http = createServer(app);
  const io: GameServer = new Server(http, {
    maxHttpBufferSize: 8192,
    pingInterval: 5000,
    pingTimeout: 10_000,
    path: config.basePath + '/socket.io',
  });
  const results = new ResultsStore(config.dataDir),
    registry = new RoomRegistry(config.maxRooms, config.playerReconnectMs),
    limiter = new FixedWindowRateLimit();
  let closing = false,
    closePromise: Promise<void> | undefined;
  let closeFrontend: (() => Promise<void>) | undefined;
  // Every route lives on `site`, mounted at BASE_PATH ('' = origin root), so paths below stay relative to it.
  const site = express.Router();
  app.disable('x-powered-by');
  if (config.embedOrigins.length)
    app.use((_req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        `frame-ancestors 'self' ${config.embedOrigins.join(' ')}`,
      );
      next();
    });
  site.use((req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/host/') ||
      req.path.startsWith('/room/') ||
      req.path.startsWith('/watch/') ||
      req.path === '/join' ||
      req.path.replace(/\/+$/, '') === '/stats'
    )
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.set('trust proxy', config.trustProxyHops);
  app.use(express.json({ limit: '4kb' }));
  const recordActivity = () => {
    try {
      results.activity.record(registry.activity());
    } catch (error) {
      console.error('Activity persistence failed', error);
    }
  };
  recordActivity();
  const activityTimer = setInterval(recordActivity, 1000);
  const broadcast = registerRealtime(io, registry, recordActivity);
  registerHttp(site, config, registry, results, limiter, broadcast, () => closing);
  if (config.production) {
    const frontend = resolve(config.rootDir, 'dist');
    let indexHtml: Promise<string> | undefined;
    // Vite bakes BASE_PATH into the bundle; a build made for another prefix cannot load its assets.
    const builtBase = /src="([^"]*)\/assets\//.exec(
      await readFile(resolve(frontend, 'index.html'), 'utf8').catch(() => ''),
    )?.[1];
    if (builtBase !== undefined && builtBase !== config.basePath)
      console.warn(
        `dist/ was built for BASE_PATH="${builtBase}" but the server runs with "${config.basePath}"; rebuild with the same value`,
      );
    site.use(express.static(frontend, { index: false }));
    site.get('/{*path}', async (req, res, next) => {
      try {
        indexHtml ??= readFile(resolve(frontend, 'index.html'), 'utf8');
        const meta = pageMetadata(req.path);
        res.setHeader('X-Robots-Tag', meta.robots);
        res
          .status(meta.page === 'missing' ? 404 : 200)
          .type('html')
          .send(renderPageHtml(await indexHtml, req.path, config.publicUrl, config.basePath));
      } catch (error) {
        next(error);
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: config.rootDir,
      server: { middlewareMode: true, hmr: { server: http } },
      appType: 'spa',
    });
    app.use(config.basePath || '/', site);
    app.use(vite.middlewares);
    closeFrontend = () => vite.close();
  }
  if (config.production) app.use(config.basePath || '/', site);
  const runtime = startRuntime(config, registry, io, results, limiter, broadcast);
  return {
    app,
    http,
    io,
    registry,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => {
          http.off('error', reject);
          const address = http.address();
          resolve(typeof address === 'object' && address ? address.port : config.port);
        });
      }),
    close(): Promise<void> {
      closePromise ??= (async () => {
        closing = true;
        runtime.stop();
        clearInterval(activityTimer);
        // Keep physics and SQLite alive until Socket.IO has run all disconnect handlers and closed HTTP.
        await new Promise<void>((resolve) => {
          io.close(() => resolve());
          http.closeIdleConnections();
        });
        await closeFrontend?.();
        registry.disposeAll();
        results.close();
      })();
      return closePromise;
    },
  };
}
