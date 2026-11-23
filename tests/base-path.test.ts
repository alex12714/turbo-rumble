import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { io } from 'socket.io-client';
import { loadConfig } from '../server/config.ts';
import { createGameServer } from '../server/app.ts';
import { parseBasePath, parseEmbedOrigins, stripBasePath } from '../shared/base-path.ts';
import { renderPageHtml } from '../shared/site-metadata.ts';
import type { Session } from '../shared/types.ts';

test('BASE_PATH and EMBED_ORIGINS are normalised and validated', () => {
  assert.equal(parseBasePath(undefined), '');
  assert.equal(parseBasePath('/'), '');
  assert.equal(parseBasePath('/g/rumble/'), '/g/rumble');
  for (const bad of ['g/rumble', '/g/../x', '/g?x=1', 'https://x.example/g'])
    assert.throws(() => parseBasePath(bad));
  assert.equal(stripBasePath('/g/rumble', '/g/rumble'), '/');
  assert.equal(stripBasePath('/g/rumble/host/ABCDEF', '/g/rumble'), '/host/ABCDEF');
  assert.equal(stripBasePath('/g/rumbler', '/g/rumble'), '/g/rumbler');
  assert.equal(stripBasePath('/join', ''), '/join');
  assert.deepEqual(parseEmbedOrigins('https://a.example, https://b.example/'), [
    'https://a.example',
    'https://b.example',
  ]);
  assert.deepEqual(parseEmbedOrigins(undefined), []);
  for (const bad of ['*', 'https://a.example/path', 'javascript:alert(1)'])
    assert.throws(() => parseEmbedOrigins(bad));
  const config = loadConfig({ BASE_PATH: '/g/rumble', EMBED_ORIGINS: 'https://call.example' }, []);
  assert.equal(config.basePath, '/g/rumble');
  assert.deepEqual(config.embedOrigins, ['https://call.example']);
  assert.equal(loadConfig({}, []).basePath, '');
});

test('page metadata and no-JS links include the base path', () => {
  const html = renderPageHtml(
    '<!-- seo:start --><!-- seo:end --><!-- static-content:start --><!-- static-content:end -->',
    '/credits',
    'https://games.example',
    '/g/rumble',
  );
  assert.match(html, /rel="canonical" href="https:\/\/games\.example\/g\/rumble\/credits"/);
  assert.match(html, /og:image" content="https:\/\/games\.example\/g\/rumble\/social\//);
  assert.match(html, /<a href="\/g\/rumble\/">Play Turbo Rumble<\/a>/);
});

test('server under BASE_PATH serves API, SPA and Socket.IO below the prefix and sets frame-ancestors', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'turbo-base-'));
  mkdirSync(resolve(root, 'dist'));
  writeFileSync(
    resolve(root, 'dist', 'index.html'),
    '<!-- seo:start --><!-- seo:end --><div id="app"></div><!-- static-content:start --><!-- static-content:end -->',
  );
  const server = await createGameServer({
    ...loadConfig({ BASE_PATH: '/g/rumble', EMBED_ORIGINS: 'https://call.example' }, []),
    production: true,
    rootDir: root,
    dataDir: resolve(root, 'data'),
    host: '127.0.0.1',
    port: 0,
  });
  try {
    const port = await server.listen(),
      origin = `http://127.0.0.1:${port}`,
      base = origin + '/g/rumble';
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal(
      health.headers.get('content-security-policy'),
      "frame-ancestors 'self' https://call.example",
    );
    assert.equal((await fetch(origin + '/api/health')).status, 404, 'nothing at the root');
    const info = (await (await fetch(base + '/api/info')).json()) as { embedOrigins: string[] };
    assert.deepEqual(info.embedOrigins, ['https://call.example']);
    for (const path of ['', '/', '/host/ABCDEF', '/join'])
      assert.equal((await fetch(base + path)).status, 200, path);
    const session = (await (
      await fetch(base + '/api/rooms', { method: 'POST' })
    ).json()) as Session;
    const socket = io(origin, {
      path: '/g/rumble/socket.io',
      auth: session,
      reconnection: false,
      transports: ['websocket'],
    });
    try {
      const state = await new Promise<{ code: string }>((resolve, reject) => {
        socket.once('state', resolve);
        socket.once('connect_error', reject);
      });
      assert.equal(state.code, session.code);
    } finally {
      socket.disconnect();
    }
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
