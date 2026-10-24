const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') { console.error('Could not load the private .env setup file.'); process.exit(1); } }
process.env.ANALYSIS_SETUP_STAMP = fs.existsSync(path.join(root, '.env')) ? String(Math.floor(fs.statSync(path.join(root, '.env')).mtimeMs)) : '0';
process.env.ANALYSIS_CODE_STAMP = ['preview.cjs', 'round-analysis.cjs', 'local-video.cjs'].map(file => Math.floor(fs.statSync(path.join(__dirname, file)).mtimeMs)).join('-');
const { handler } = require('./round-analysis.cjs');
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4175;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const routes = require('../vercel.json').routes.filter(route => route.src);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (url.pathname === '/api/analyze-rounds') return await handler(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const route = routes.find(route => new RegExp('^' + route.src + '$').test(url.pathname));
    if (route?.status) {
      const location = route.headers?.Location;
      res.writeHead(route.status, location ? { Location: url.pathname.replace(new RegExp('^' + route.src + '$'), location) + url.search } : {});
      res.end(); return;
    }
    const pathname = route?.dest ? url.pathname.replace(new RegExp('^' + route.src + '$'), route.dest) : url.pathname;
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative), extension = path.extname(file).toLowerCase();
    const allowed = /^(?:(?:index|dojo|vod|training)\.html|favicon\.ico|robots\.txt|sitemap\.xml|(?:css|js|assets|pages)\/)/.test(relative);
    if (!allowed || relative.split(/[\\/]/).some(part => part.startsWith('.')) || !file.startsWith(root + path.sep) || !types[extension] || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found.'); return; }
    res.writeHead(200, { 'Content-Type': types[extension] + '; charset=utf-8', 'Content-Length': fs.statSync(file).size, 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
});
server.requestTimeout = 600000;
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/vod'));
