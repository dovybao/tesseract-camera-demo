// Static HTTPS server for the LAN. Camera (getUserMedia) needs a secure context, so plain http://<ip> won't work on a phone.
import { createServer } from 'node:https';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';

const PORT = Number(process.env.PORT || 8443);
const ROOT = 'public';

const ips = Object.values(networkInterfaces()).flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('172.'))
  .map((n) => n.address);

// Self-signed cert covering every LAN IP; regenerated when the IP set changes.
const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',');
if (!existsSync('cert/key.pem') || !existsSync('cert/san.txt') || readFileSync('cert/san.txt', 'utf8') !== san) {
  execSync('mkdir -p cert');
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout cert/key.pem -out cert/cert.pem -subj "/CN=tesseract-demo" -addext "subjectAltName=${san}"`, { stdio: 'ignore' });
  execSync(`printf '%s' '${san}' > cert/san.txt`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/octet-stream' };

createServer({ key: readFileSync('cert/key.pem'), cert: readFileSync('cert/cert.pem') }, (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nServing ${ROOT}/ over HTTPS on port ${PORT}`);
  for (const ip of ips) {
    const url = `https://${ip}:${PORT}`;
    console.log(`\n  ${url}`);
    try { console.log(execSync(`qrencode -t ANSIUTF8 -m 1 '${url}'`).toString()); } catch {}
  }
  console.log('Phone: scan the QR, accept the certificate warning (Advanced -> Proceed), allow camera.\n');
});
