import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { boardExists, canEdit, createBoard, loadState, saveState } from './boards.ts';

const PORT = Number(process.env.PORT ?? 1234);
const DIST_DIR = path.resolve(import.meta.dirname, '../dist');

// Board creation is cheap and unauthenticated, so cap it per IP
const CREATE_LIMIT = 30;
const CREATE_WINDOW_MS = 10 * 60 * 1000;
const createLog = new Map<string, number[]>();

function allowCreate(ip: string): boolean {
  const now = Date.now();
  const recent = (createLog.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS);
  if (recent.length >= CREATE_LIMIT) return false;
  recent.push(now);
  createLog.set(ip, recent);
  return true;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Serves the built client, falling back to index.html for app routes like /b/:id. */
function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  if (!existsSync(DIST_DIR) || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = path.join(DIST_DIR, urlPath);
  if (!file.startsWith(DIST_DIR + path.sep) && file !== DIST_DIR) return false;
  if (!existsSync(file) || !statSync(file).isFile()) file = path.join(DIST_DIR, 'index.html');

  const immutable = urlPath.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

function handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const { pathname } = new URL(req.url ?? '/', 'http://x');

  if (pathname === '/api/boards' && req.method === 'POST') {
    if (!allowCreate(req.socket.remoteAddress ?? '')) {
      sendJson(res, 429, { error: 'Too many boards created. Try again in a few minutes.' });
    } else {
      sendJson(res, 201, createBoard());
    }
    return true;
  }
  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Not found' });
    return true;
  }
  return serveStatic(req, res);
}

const server = new Server({
  port: PORT,
  quiet: true,
  // Persist at most a second after changes stop, and at least every 5s while busy
  debounce: 1000,
  maxDebounce: 5000,
  websocketOptions: { maxPayload: 4 * 1024 * 1024 },

  async onRequest({ request, response }) {
    // Rejecting with no error tells Hocuspocus the response was handled
    if (handleRequest(request, response)) throw null;
  },

  async onAuthenticate({ documentName, token, connectionConfig }) {
    if (!boardExists(documentName)) throw { reason: 'not-found' };
    connectionConfig.readOnly = !canEdit(documentName, token);
  },

  async onLoadDocument({ document, documentName }) {
    const state = loadState(documentName);
    if (state) Y.applyUpdate(document, state);
  },

  async onStoreDocument({ document, documentName }) {
    saveState(documentName, Y.encodeStateAsUpdate(document));
  },
});

await server.listen();
console.log(`Sketchroom server listening on http://localhost:${PORT}`);
