import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.slice(root.length).replaceAll('\\', '/');
    if (!path.startsWith(root) || relative.split('/').some(part => part.startsWith('.')) || !['index.html', 'simulator-fto.html', 'image-gen-fto.html', 'image-gen-3x3.html', 'src'].includes(relative.split('/')[0])) {
      response.writeHead(404).end(); return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
}).listen(4187, '127.0.0.1', () => console.log('Puzzle Image Generators: http://127.0.0.1:4187'));
