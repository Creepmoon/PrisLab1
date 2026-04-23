import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const indexPath = resolve('apps/web/index.html');

createServer(async (_req, res) => {
  try {
    const html = await readFile(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Web shell is unavailable');
  }
}).listen(PORT, () => {
  console.log(`Web app on :${PORT}`);
});
