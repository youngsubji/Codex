import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRun, execute, publicRun} from './engine.mjs';
import {catalog, TARGET} from './scenarios.mjs';

export function createServer({token = randomBytes(24).toString('hex'), htmlPath, runner = execute} = {}) {
  const runs = new Map();let active = null;
  const json = (res, status, value) => {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});res.end(JSON.stringify(value));};
  const auth = req => {const supplied = req.headers.authorization || '';const a = Buffer.from(supplied), b = Buffer.from('Bearer ' + token);return a.length === b.length && timingSafeEqual(a, b);};
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port;
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) return json(res, 403, {error: '로컬 실행기 주소로 접속하세요.'});
    const origin = req.headers.origin;
    if (origin && !['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(origin)) return json(res, 403, {error: '로컬 실행 화면에서 시작하세요.'});
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (req.method === 'GET' && url.pathname === '/') {
      try {let html;try {html = await readFile(htmlPath || new URL('./web/index.html', import.meta.url), 'utf8');}catch (e) {if (htmlPath) throw e;html = await readFile(new URL('../index.html', import.meta.url), 'utf8');}res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'});res.end(html.replace('</head>', '<script>window.AID25_PAIR_TOKEN=' + JSON.stringify(token) + ';</script></head>'));}
      catch {json(res, 503, {error: '실행기 web/index.html이 없습니다. 전체 배포 패키지를 풀어 실행하세요.'});}return;
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, {error: '경로를 찾을 수 없습니다.'});
    if (!auth(req)) return json(res, 401, {error: '로컬 실행 화면을 새로 열어 연결하세요.'});
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {ready: true, target: TARGET, catalogVersion: 1, activeRun: active?.id || null});
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      if (active) return json(res, 409, {error: '진행 중인 테스트를 먼저 완료하거나 중지하세요.'});
      let size = 0;const chunks = [];
      try {
        for await (const chunk of req) {size += chunk.length;if (size > 1024 * 1024) return json(res, 413, {error: '설정은 1MB 이하로 입력하세요.'});chunks.push(chunk);}
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body.accounts?.primary?.username || !body.accounts?.primary?.password) return json(res, 400, {error: '정상 로그인 ID와 PW를 입력하세요.'});
        if (typeof body.accounts.primary.username !== 'string' || typeof body.accounts.primary.password !== 'string') return json(res, 400, {error: '계정 입력 형식을 확인하세요.'});
        if (!Array.isArray(body.selected) || !body.selected.length || new Set(body.selected).size !== body.selected.length || body.selected.some(id => !catalog.some(c => c.id === id))) return json(res, 400, {error: '실행할 테스트를 선택하세요.'});
        if (!['chromium', 'firefox', 'webkit'].includes(body.browser || 'chromium')) return json(res, 400, {error: '브라우저 설정을 확인하세요.'});
        const profile = body.profile || {};
        if (typeof profile !== 'object' || Array.isArray(profile) || profile.target && profile.target !== TARGET || profile.version !== undefined && profile.version !== 1 || profile.cases && (typeof profile.cases !== 'object' || Array.isArray(profile.cases))) return json(res, 400, {error: 'aidrive.co.kr용 버전 1 설정 파일을 선택하세요.'});
        const accounts = {};
        for (const actor of ['primary', 'admin', 'otherTenant']) if (body.accounts[actor]) {
          const a = body.accounts[actor];if (typeof a.username !== 'string' || typeof a.password !== 'string' || a.username.length > 300 || a.password.length > 1000) return json(res, 400, {error: '계정 입력 길이/형식을 확인하세요.'});
          accounts[actor] = {username: a.username, password: a.password};a.password = '';a.username = '';
        }
        const options = {selected: body.selected, accounts, profile, browser: body.browser || 'chromium', showBrowser: body.showBrowser === true, allowMutations: body.allowMutations === true};
        if (active) return json(res, 409, {error: '진행 중인 테스트를 먼저 완료하거나 중지하세요.'});
        const run = createRun(options), controller = new AbortController();runs.set(run.id, run);active = run;
        const timeout = setTimeout(() => controller.abort('time_limit'), 60 * 60 * 1000);timeout.unref();run.cancel = () => controller.abort();
        json(res, 202, {id: run.id});
        // At most ten in-memory reports; no ID/PW, cookie/token, response bodies or screenshots are written.
        if (runs.size > 10) runs.delete(runs.keys().next().value);
        Promise.resolve().then(() => runner(run, options, {signal: controller.signal})).catch(() => {run.state = 'error';for (const r of run.results) if (['pending', 'running'].includes(r.status)) {r.status = 'error';r.detail = '실행기를 다시 시작하고 설정을 확인하세요.';}}).finally(() => {clearTimeout(timeout);active = null;run.finishedAt ||= new Date().toISOString();for (const a of Object.values(accounts)) {a.password = '';a.username = '';}});
      } catch {json(res, 400, {error: 'JSON 설정/요청 형식을 확인하세요.'});}
      return;
    }
    const match = /^\/api\/runs\/([a-f0-9-]+)(\/cancel)?$/.exec(url.pathname);
    const run = match && runs.get(match[1]);
    if (!run) return json(res, 404, {error: '실행 결과를 찾을 수 없습니다.'});
    if (req.method === 'POST' && match[2]) {run.cancel();return json(res, 200, {ok: true});}
    if (req.method === 'GET' && !match[2]) return json(res, 200, publicRun(run));
    json(res, 405, {error: '지원하지 않는 요청입니다.'});
  });
  server.on('close', () => active?.cancel());
  return {server, token};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.AID25_PORT || 4319);
  const {server} = createServer();
  server.listen(port, '127.0.0.1', () => console.log('Aid25 실행기 준비: http://127.0.0.1:' + port + '/?tool=aid25&lang=ko\n이 주소를 브라우저에서 열고 정상 계정 ID/PW를 입력하세요. 종료: Ctrl+C'));
  server.on('error', err => {console.error(err.code === 'EADDRINUSE' ? '4319 포트가 사용 중입니다. 기존 실행기를 종료하거나 AID25_PORT를 지정하세요.' : '로컬 실행기를 시작하지 못했습니다.');process.exitCode = 1;});
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => {server.close();setTimeout(() => process.exit(0), 2000).unref();});
}
