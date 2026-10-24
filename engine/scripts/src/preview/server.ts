/**
 * Live preview board: a local web page showing every rendered diagram in a
 * session folder, refreshed whenever a render rewrites a file. No
 * dependencies: node:http, fs.watch and server-sent events.
 *
 * Each folder that holds an SVG is one card (the newest SVG in it), newest
 * activity first: the page shows the selected card large and every card as a
 * thumbnail strip, and follows each new render. A folder named `working` is
 * marked as the working design. `brief.md` at the root is shown beside the
 * board. The server only reads files; Claude still runs `render`.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { boardHtml } from './page.js';

export interface PreviewCard {
  /** Folder path relative to the board root, with forward slashes ('' for the root). */
  folder: string;
  title?: string;
  type?: string;
  theme?: string;
  /** URL of the newest SVG in the folder. */
  svg: string;
  /** Milliseconds since the epoch of that SVG's last write. */
  updated: number;
  /** Last activity in the folder: the SVG or preview.png, whichever is newer (a failed render writes only the preview). */
  touched: number;
  /** True when preview.png is newer than the SVG: the last render failed QA. */
  stale: boolean;
  /** Other deliverables in the folder (pptx, drawio, pdf, png) as URLs. */
  files: { name: string; url: string }[];
  featured: boolean;
}

export interface PreviewState {
  dir: string;
  brief?: string;
  cards: PreviewCard[];
}

export interface PreviewServer {
  url: string;
  port: number;
  dir: string;
  close(): Promise<void>;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'history']);
const DELIVERABLES = new Set(['.pptx', '.drawio', '.pdf', '.png']);
const TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.drawio': 'application/xml; charset=utf-8',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const fileUrl = (rel: string) => '/files/' + rel.split(path.sep).map(encodeURIComponent).join('/');

function mtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Scan the board folder and describe one card per folder that holds an SVG. */
export function collectState(root: string): PreviewState {
  const cards: PreviewCard[] = [];
  const walk = (abs: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const svgs = entries.filter((e) => e.isFile() && e.name.endsWith('.svg')).map((e) => path.join(abs, e.name));
    if (svgs.length) {
      const svg = svgs.sort((a, b) => mtime(b) - mtime(a))[0];
      const updated = mtime(svg);
      const slug = path.basename(svg, '.svg');
      // A deck folder's card is its contact sheet; the deck file names it.
      const deck = readJson(path.join(abs, `${slug}.deck.json`));
      const spec = readJson(path.join(abs, `${slug}.diagram.json`)) ?? (deck ? { ...deck, type: 'deck' } : undefined);
      const preview = path.join(abs, 'preview.png');
      const rel = path.relative(root, abs);
      cards.push({
        folder: rel.split(path.sep).join('/'),
        title: typeof spec?.title === 'string' ? spec.title : undefined,
        type: typeof spec?.type === 'string' ? spec.type : undefined,
        theme: typeof spec?.theme === 'string' ? spec.theme : undefined,
        svg: `${fileUrl(path.relative(root, svg))}?v=${Math.round(updated)}`,
        updated,
        touched: Math.max(updated, mtime(preview)),
        stale: mtime(preview) > updated + 2000,
        files: entries
          .filter((e) => e.isFile() && e.name.startsWith(slug + '.') && DELIVERABLES.has(path.extname(e.name)))
          .map((e) => ({ name: e.name, url: fileUrl(path.relative(root, path.join(abs, e.name))) })),
        featured: path.basename(abs) === 'working',
      });
    }
    if (depth >= 4) return;
    // A rendered deck's pages/ folder holds one SVG per page: the deck card already shows them all.
    const isDeck = entries.some((e) => e.isFile() && e.name.endsWith('.deck.json'));
    for (const e of entries)
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.') && !(isDeck && e.name === 'pages')) walk(path.join(abs, e.name), depth + 1);
  };
  walk(root, 0);
  // Newest activity first, so a new or re-rendered diagram is always at the front.
  cards.sort((a, b) => b.touched - a.touched || a.folder.localeCompare(b.folder));
  let brief: string | undefined;
  try {
    brief = fs.readFileSync(path.join(root, 'brief.md'), 'utf8');
  } catch {
    brief = undefined;
  }
  return { dir: root, brief, cards };
}

/** Resolve a /files/ request to a path inside root, or undefined if it escapes. */
export function safeResolve(root: string, urlPath: string): string | undefined {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.replace(/^\/files\//, ''));
  } catch {
    return undefined;
  }
  const abs = path.resolve(root, rel);
  const within = path.relative(root, abs);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) return undefined;
  return abs;
}

function listen(server: http.Server, port: number, host: string, tries: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (e.code === 'EADDRINUSE' && tries > 1 && port !== 0) resolve(listen(server, port + 1, host, tries - 1));
      else reject(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Start the board for `dir` (created if missing). Port 0 picks a free port. */
export async function startPreview(dir: string, opts: { port?: number; host?: string } = {}): Promise<PreviewServer> {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const clients = new Set<http.ServerResponse>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(boardHtml(path.basename(root)));
      return;
    }
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(collectState(root)));
      return;
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname.startsWith('/files/')) {
      const file = safeResolve(root, url.pathname);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const download = ['.pptx', '.drawio', '.pdf'].includes(ext);
      res.writeHead(200, {
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        // ?v= carries the file's write time, so a versioned URL never changes content: let the page reuse it.
        'cache-control': url.searchParams.has('v') ? 'private, max-age=31536000, immutable' : 'no-store',
        ...(download ? { 'content-disposition': `attachment; filename="${path.basename(file).replace(/"/g, '')}"` } : {}),
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end('Not found');
  });

  // A render writes several files in a burst: wait for it to settle, then tell every page once.
  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const c of clients) c.write(`data: ${Date.now()}\n\n`);
    }, 200);
  };
  const watcher = fs.watch(root, { recursive: true }, changed);
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, 15000);

  const host = opts.host ?? '127.0.0.1';
  const port = await listen(server, opts.port ?? 4740, host, 20);
  return {
    url: `http://${host}:${port}/`,
    port,
    dir: root,
    close: () =>
      new Promise<void>((resolve) => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        watcher.close();
        for (const c of clients) c.end();
        server.close(() => resolve());
      }),
  };
}
