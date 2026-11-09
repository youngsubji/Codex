import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, writeFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from '../server.mjs';
import {catalog, preflight, targetUrl, jsonPath, assertions, NeedSetup, CheckFailed} from '../scenarios.mjs';
import {createRun, execute} from '../engine.mjs';

const accounts = () => ({primary: {username: 'tester@example.invalid', password: 'private-test-password'}});
const options = selected => ({accounts: accounts(), selected, profile: {}, browser: 'chromium', allowMutations: false});
test('catalog covers all 42 requested cases and requires complete checks', () => {
  assert.equal(catalog.length, 42);assert.equal(catalog.filter(c => c.priority === 'P0').length, 13);
  const item = catalog.find(c => c.id === 'DASH-02');
  assert(preflight(item, {}, accounts()));
  assert(preflight(item, {cases: {'DASH-02': {checks: [{key: '운행 대수', assertions: [{kind: 'visible'}]}]}}}, accounts()));
  const tenant = catalog.find(c => c.id === 'AUTH-04');
  assert(preflight(tenant, {cases: {'AUTH-04': {checks: []}}}, accounts()));
  assert.throws(() => targetUrl('https://other.example/'), NeedSetup);
  assert.throws(() => jsonPath({}, '$.__proto__'), NeedSetup);
  assert.equal(jsonPath({a: [{id: 3}]}, '$.a[0].id'), 3);
});

test('missing fixtures never launch browsers or become passed', async () => {
  const opts = options(['AUTH-02', 'DASH-02', 'AUTH-04', 'VIDEO-04']);let launches = 0;
  const report = await execute(createRun(opts), opts, {launch: async () => {launches++;throw Error();}});
  assert.equal(launches, 0);assert.equal(report.counts.passed, 0);assert.equal(report.counts.blocked, 4);
  assert.equal(opts.accounts.primary.password, '');
});

test('login success/failure is executed once; other unconfigured cases are blocked', async () => {
  const opts = options(catalog.map(c => c.id));const calls = [];
  const browser = {close: async () => {}, newContext: async () => ({newPage: async () => ({setDefaultTimeout() {}}), storageState: async () => ({cookies: [], origins: []}), close: async () => {}})};
  const report = await execute(createRun(opts), opts, {launch: async () => browser, authenticate: async (_page, account, invalid) => {calls.push({invalid: !!invalid, dummy: account.username.endsWith('@example.invalid')});}});
  assert.equal(calls.length, 2);assert(calls[1].invalid && calls[1].dummy);
  assert.equal(report.counts.passed, 1);assert.equal(report.counts.blocked, 41);
  assert(!JSON.stringify(report).includes('private-test-password'));assert(!JSON.stringify(report).includes('tester@example.invalid'));
});

test('wrong assertion fails; an empty plan cannot pass', async () => {
  const env = {page: {locator: () => ({innerText: async () => 'actual'})}, vars: {}};
  await assert.rejects(assertions([{kind: 'text', selector: '#metric', equals: 'expected'}], env), CheckFailed);
  await assert.rejects(assertions([], env), NeedSetup);
  await assert.rejects(assertions([{kind: 'text', selector: '#metric'}], env), NeedSetup);
});

test('a failed real-account login is not retried by subsequent configured cases', async () => {
  const opts = options(['AUTH-01', 'REPORT-04']);opts.profile = {cases: {'REPORT-04': {checks: [{key: '전체/페이지 범위', steps: [], assertions: [{kind: 'visible', selector: '#fixture'}]}]}}};
  let attempts = 0;
  const browser = {close: async () => {}, newContext: async () => ({newPage: async () => ({setDefaultTimeout() {}}), close: async () => {}})};
  const report = await execute(createRun(opts), opts, {launch: async () => browser, authenticate: async () => {attempts++;throw Error('must not expose private-test-password');}});
  assert.equal(attempts, 1);assert.equal(report.counts.failed, 1);assert.equal(report.counts.blocked, 1);
  assert(!JSON.stringify(report).includes('private-test-password'));
});

test('API tenant check rejects successful responses and accepts actual denial codes', async () => {
  const env = {page: {}, context: {request: {fetch: async () => ({status: () => 200})}}, vars: {}, allowMutations: false};
  const assertion = [{kind: 'api', request: {path: '/fixture'}, denied: true}];
  await assert.rejects(assertions(assertion, env), CheckFailed);
  env.context.request.fetch = async () => ({status: () => 403});await assertions(assertion, env);
  await assert.rejects(assertions([{kind: 'api', request: {path: '/fixture', method: 'DELETE'}, status: 200}], env), NeedSetup);
  env.context.storageState = async () => ({origins: [{origin: 'https://aidrive.co.kr', localStorage: [{name: 'token', value: 'fixture-session-token'}]}]});
  let authorization;
  env.context.request.fetch = async (_url, options) => {authorization = options.headers.Authorization;return {status: () => 200};};
  await assertions([{kind: 'api', request: {path: '/fixture', tokenHeader: 'Authorization'}, status: 200}], env);
  assert.equal(authorization, 'Bearer fixture-session-token');
});

test('GraphQL denial requires a matching permission error and null protected data', async () => {
  let payload = {errors: [{extensions: {code: 'FORBIDDEN'}}], data: {vehicle: null}};
  const env = {page: {}, context: {request: {fetch: async () => ({status: () => 200, body: async () => Buffer.from(JSON.stringify(payload))})}}, vars: {}, allowMutations: false};
  const criteria = [{kind: 'api', request: {path: 'https://live-aid25-api.aimatics.net/graphql'}, denied: true, graphqlDenial: {codePath: '$.errors[0].extensions.code', codes: ['FORBIDDEN'], dataPath: '$.data.vehicle'}}];
  await assertions(criteria, env);
  payload.data.vehicle = {id: 'foreign'};await assert.rejects(assertions(criteria, env), CheckFailed);
});

test('download checks actually parse XLSX/CSV content and remove temporary files', async () => {
  const {default: ExcelJS} = await import('exceljs');
  const workbook = new ExcelJS.Workbook();const sheet = workbook.addWorksheet('Report');
  sheet.addRow(['차량', '일자']);sheet.addRow(['서울 테스트', '2026-11-09']);
  let data = await workbook.xlsx.writeBuffer(), name = 'report.xlsx';const saved = [];
  const env = {page: {waitForEvent: async () => ({failure: async () => null, suggestedFilename: () => name, saveAs: async file => {saved.push(file);await writeFile(file, data);}}), locator: () => ({click: async () => {}})}, vars: {}};
  const criteria = [{kind: 'download', selector: '#download', headers: ['차량', '일자'], rows: 1, contains: ['서울', '2026-11-09']}];
  await assertions(criteria, env);
  await assert.rejects(assertions([{...criteria[0], rows: 99}], env), CheckFailed);
  name = 'report.csv';data = Buffer.from('\uFEFF차량,일자\r\n"서울\n테스트",2026-11-09\r\n');
  await assertions(criteria, env);
  for (const file of saved) await assert.rejects(stat(file), {code: 'ENOENT'});
});

async function request(port, {method = 'GET', path = '/', headers = {}, body} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path, method, headers}, res => {let text = '';res.on('data', c => text += c);res.on('end', () => resolve({status: res.statusCode, text, data: (() => {try {return JSON.parse(text);} catch {return null;}})()}));});
    req.on('error', reject);if (body) req.write(body);req.end();
  });
}

test('HTTP pairing, origin/host checks, concurrent-run exclusion and cancel work without leaking credentials', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aid25-test-'));const htmlPath = path.join(dir, 'index.html');await writeFile(htmlPath, '<html><head></head><body>Fixture</body></html>');
  let signal;
  const {server} = createServer({token: 'pair-fixture', htmlPath, runner: async (run, opts, deps) => {
    signal = deps.signal;run.state = 'running';await new Promise(resolve => signal.addEventListener('abort', resolve, {once: true}));run.state = 'cancelled';
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));const port = server.address().port;
  const headers = {Authorization: 'Bearer pair-fixture', 'Content-Type': 'application/json'};
  try {
    assert.equal((await request(port)).status, 200);
    assert.equal((await request(port, {path: '/api/health'})).status, 401);
    assert.equal((await request(port, {path: '/api/health', headers: {...headers, Origin: 'https://unrelated.example'}})).status, 403);
    assert.equal((await request(port, {path: '/api/health', headers: {...headers, Host: 'attacker.example:' + port}})).status, 403);
    assert.equal((await request(port, {path: '/api/health', headers})).status, 200);
    const body = JSON.stringify({...options(['AUTH-01']), showBrowser: false});
    const responses = await Promise.all([request(port, {method: 'POST', path: '/api/runs', headers, body}), request(port, {method: 'POST', path: '/api/runs', headers, body})]);
    assert.deepEqual(responses.map(r => r.status).sort(), [202, 409]);
    const id = responses.find(r => r.status === 202).data.id;
    const report = await request(port, {path: '/api/runs/' + id, headers});
    assert(!report.text.includes('private-test-password'));assert(!report.text.includes('tester@example.invalid'));
    assert.equal((await request(port, {method: 'POST', path: '/api/runs/' + id + '/cancel', headers})).status, 200);
    await new Promise(resolve => setImmediate(resolve));assert(signal.aborted);
  } finally {await new Promise(resolve => server.close(resolve));await rm(dir, {recursive: true, force: true});}
});
