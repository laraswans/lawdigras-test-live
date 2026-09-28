import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrief } from './digest.mjs';
import { providerView } from './provider.mjs';
import { createShare, openShare, revokeShare } from './share.mjs';
import { ClioError } from './clio.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
async function readBody(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 100_000) throw Object.assign(new Error('body too large'), { status: 413 }); }
  return s ? JSON.parse(s) : {};
}
// Internal routes sit behind the firm's SSO proxy, which sets x-firm-user. Only share/open is public.
const internal = req => typeof req.headers['x-firm-user'] === 'string';

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    let m;
    if ((m = url.pathname.match(/^\/api\/matters\/(\d+)\/brief$/))) {
      if (!internal(req)) return json(res, 403, { error: 'internal only' });
      return json(res, 200, await buildBrief(m[1]));
    }
    if ((m = url.pathname.match(/^\/api\/matters\/(\d+)\/share$/)) && req.method === 'POST') {
      if (!internal(req)) return json(res, 403, { error: 'internal only' });
      const { provider, sections, update } = await readBody(req);
      if (!provider) return json(res, 400, { error: 'provider is required' });
      return json(res, 201, await createShare({ matterId: m[1], provider, sections, update }));
    }
    if ((m = url.pathname.match(/^\/api\/shares\/([\w-]+)\/revoke$/)) && req.method === 'POST') {
      if (!internal(req)) return json(res, 403, { error: 'internal only' });
      return json(res, (await revokeShare(m[1])) ? 200 : 404, { revoked: m[1] });
    }
    if (url.pathname === '/api/share/open' && req.method === 'POST') {
      const { token, password } = await readBody(req);
      const { share, error } = await openShare(token, password);
      if (error) return json(res, 403, { error });
      return json(res, 200, providerView(await buildBrief(share.matterId), share));
    }
    const file = url.pathname === '/' ? 'brief.html' : url.pathname.slice(1);
    if (!/^[\w-]+\.(html|js|css)$/.test(file)) return json(res, 404, { error: 'not found' });
    const content = await readFile(join(PUBLIC, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] }); res.end(content);
  } catch (e) {
    const status = e.status === 413 ? 413 : e instanceof ClioError ? (e.status === 404 ? 404 : 502) : e.code === 'ENOENT' ? 404 : e instanceof SyntaxError ? 400 : 500;
    if (status >= 500) console.error(e);
    json(res, status, { error: status === 502 ? 'Clio is unavailable, try again shortly' : status === 404 ? 'not found' : status === 400 ? 'bad request' : 'something went wrong' });
  }
}).listen(process.env.PORT ?? 3000, () => console.log(`Case Brief on http://localhost:${process.env.PORT ?? 3000}`));
