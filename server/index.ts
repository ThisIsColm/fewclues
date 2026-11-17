import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { ContentStore } from './content';
import { Store } from './db';

const config = loadConfig();
const store = new Store(config.dbPath);
const content = new ContentStore(config.contentPath, config.edition, config.allowDrafts);
if (config.allowDrafts) console.warn('ALLOW_DRAFTS=1 — draft questions are playable. Do not use in production.');
if (config.devDate) console.warn(`DEV_DATE=${config.devDate} — "today" is pinned. Do not use in production.`);

const app = createApp({ config, store, content, remoteAddr: (c) => getConnInfo(c).remote.address });

// ---- Static frontend (production build). Vite serves it in development.
const indexPath = join(config.staticDir, 'index.html');
if (existsSync(indexPath)) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const indexHtml = readFileSync(indexPath, 'utf8').replaceAll('__SITE_URL__', esc(config.siteUrl));
  const sendIndex = () =>
    new Response(indexHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  app.get('/', sendIndex);
  app.get('/index.html', sendIndex);
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', async (c, next) => {
    await next();
    if (c.res.status === 200 && !c.res.headers.get('Cache-Control')) c.header('Cache-Control', 'public, max-age=86400');
  });
  app.use('*', serveStatic({ root: config.staticDir }));
} else {
  console.warn(`No frontend build at ${indexPath}; serving the API only.`);
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) =>
  console.log(`Percentle listening on http://${info.address}:${info.port}`),
);

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
