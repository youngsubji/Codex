import {readFile} from 'node:fs/promises';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

export const TARGET = 'https://aidrive.co.kr';
// Observed in the public aid25 frontend bundle; not arbitrary user-supplied hosts.
export const API_ORIGINS = [TARGET, 'https://live-aid25-api.aimatics.net', 'https://aid25-rest-api.aimatics.net'];
export const catalog = JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8'));
export class NeedSetup extends Error {}
export class CheckFailed extends Error {}
const requireValue = (ok, message) => {if (!ok) throw new NeedSetup(message);};
const check = (ok, message) => {if (!ok) throw new CheckFailed(message);};
const literal = (v, vars) => typeof v === 'string' ? v.replace(/\{\{([\w.-]+)\}\}/g, (_, k) => {
  requireValue(Object.hasOwn(vars, k), '기준 데이터 누락: ' + k);return String(vars[k]);
}) : v;
const expand = (v, vars) => typeof v === 'string' ? literal(v, vars) : Array.isArray(v) ? v.map(x => expand(x, vars)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x, vars)])) : v;
export function targetUrl(value) {
  const url = new URL(value, TARGET);
  requireValue(url.origin === TARGET && !url.username && !url.password, '조회 경로는 https://aidrive.co.kr 안에서 지정하세요.');
  return url.href;
}
export function apiUrl(value) {
  const url = new URL(value, TARGET);
  requireValue(API_ORIGINS.includes(url.origin) && !url.username && !url.password, 'API는 aid25의 확인된 서비스 주소에서만 지정하세요.');
  return url.href;
}
export function jsonPath(value, key = '$') {
  if (key === '$') return value;
  requireValue(/^\$(?:\.[\w-]+|\[\d+\])+$/.test(key), 'JSON 경로 형식을 확인하세요.');
  let v = value;
  for (const k of key.slice(1).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    requireValue(!['__proto__', 'constructor', 'prototype'].includes(k), '지원하지 않는 JSON 경로입니다.');
    if (v == null || !Object.hasOwn(v, k)) throw new CheckFailed('기대 JSON 경로가 없습니다.');v = v[k];
  }
  return v;
}
const same = (a, b) => {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
};

export function preflight(item, profile = {}, credentials = {}, allowMutations = false) {
  if (item.builtin) return null;
  const recipe = profile.cases?.[item.id];
  if (!recipe) return '설정 필요: ' + item.needs;
  if (item.mutates && !allowMutations) return '변경 테스트 허용이 필요합니다. 전용 테스트 데이터로 실행하세요.';
  if (!Array.isArray(recipe.checks) || recipe.checks.length > 100) return '하위 검증 항목을 설정하세요.';
  if (item.id === 'AUTH-03' && profile.primaryRole !== 'user') return '일반 사용자 검증용 primaryRole: user 설정과 계정이 필요합니다.';
  if (item.id === 'AUTH-04') {
    const t = profile.tenantFixtures;
    if (!t || !t.ownTenantId || !t.foreignTenantId || t.ownTenantId === t.foreignTenantId || !t.vehicleId || !t.driverId || !t.videoId) return '서로 다른 고객사와 승인된 타 고객사 차량/운전자/영상 ID가 필요합니다.';
  }
  if (item.id === 'COMMON-07') {
    const browsers = profile.compatibilityBrowsers;
    if (!Array.isArray(browsers) || !browsers.length || browsers.some(b => !['chromium', 'firefox', 'webkit'].includes(b))) return '합의된 지원 브라우저 목록 compatibilityBrowsers를 설정하세요.';
    if (!item.checks.every(key => browsers.every(browser => recipe.checks.some(p => p.key === key && p.browser === browser)))) return '성능·호환성은 각 지원 브라우저별 하위 판정이 필요합니다.';
  }
  for (const key of item.checks) {
    const parts = recipe.checks.filter(p => p.key === key);
    if (!parts.length) return '하위 검증 설정 필요: ' + key;
    for (const part of parts) {
      if (!Array.isArray(part.assertions) || !part.assertions.length) return '판정 기준 설정 필요: ' + key;
      if (part.assertions.length > 60 || (part.steps?.length || 0) > 100) return '하위 항목당 단계/판정 수를 줄이세요.';
      const actor = part.actor || 'primary';
      if (actor !== 'primary' && (!credentials[actor]?.username || !credentials[actor]?.password)) return '추가 테스트 계정 필요: ' + actor;
      if (item.id === 'AUTH-03' && key.startsWith('관리자') && actor !== 'admin') return '관리자 검증에는 admin 계정이 필요합니다.';
      if (item.id === 'AUTH-03' && key.includes('API') && !part.assertions.some(a => a.kind === 'api')) return '역할별 API 검증이 필요합니다.';
      if (item.id === 'AUTH-04' && !part.assertions.some(a => a.kind === 'api' && a.denied === true)) return '고객사 격리는 API 차단 판정이 필요합니다.';
      if (item.id === 'AUTH-04' && !part.assertions.some(a => a.kind === 'api' && a.status === 200 && a.equals !== undefined && a.equals !== null && !a.denied)) return '고객사 격리는 자기 고객사 데이터의 정상 조회 대조군도 필요합니다.';
      if (item.id === 'DASH-05' && key === '5분 갱신' && !part.steps?.some(s => s.action === 'wait' && s.ms >= 300000)) return '5분 자동 갱신은 300,000ms 이상 실제 대기를 설정하세요.';
      if (/REPLACE_|실제_/.test(JSON.stringify(part))) return '예시 자리표시자를 실제 테스트 설정으로 바꾸세요.';
    }
  }
  return null;
}

async function expectApi(a, page, context, vars, allowMutations) {
  requireValue(a.request?.path, 'API 경로를 설정하세요.');
  const url = apiUrl(a.request.path), method = (a.request.method || 'GET').toUpperCase();
  const readonlyQuery = method === 'POST' && typeof a.request.data?.query === 'string' && /^\s*query\b/.test(a.request.data.query) && !/\bmutation\b/.test(a.request.data.query);
  requireValue(['GET', 'HEAD'].includes(method) || readonlyQuery || allowMutations, '변경 API 요청은 변경 테스트 허용 후 실행하세요.');
  const headers = {...a.request.headers};
  if (a.request.tokenHeader) {
    const state = await context.storageState();
    const token = state.origins.find(o => o.origin === TARGET)?.localStorage.find(v => v.name === 'token')?.value;
    requireValue(token, 'API 인증 토큰이 없습니다.');headers[a.request.tokenHeader] = (a.request.tokenPrefix ?? 'Bearer ') + token;
  }
  const response = await context.request.fetch(url, {method, headers, data: a.request.data, timeout: 20000, maxRedirects: 0});
  const status = response.status();
  let parsed;
  const json = async () => {
    if (parsed !== undefined) return parsed;
    const bytes = await response.body();check(bytes.length <= 20 * 1024 * 1024, '검증 응답 크기가 20MB를 넘었습니다.');
    try {parsed = JSON.parse(bytes.toString('utf8'));return parsed;} catch {throw new CheckFailed('API 응답이 JSON이 아닙니다.');}
  };
  if (a.denied && ![401, 403, 404].includes(status)) {
    check(status === 200 && !!a.graphqlDenial, '권한 없는 API 요청이 차단되지 않았습니다.');
    requireValue(a.graphqlDenial?.codePath && a.graphqlDenial?.dataPath && a.graphqlDenial?.codes?.length, 'HTTP 200인 GraphQL 차단 응답은 권한 오류 코드와 빈 데이터 경로 판정이 필요합니다.');
    const data = await json(), denial = a.graphqlDenial;
    check(denial.codes.includes(jsonPath(data, denial.codePath)) && jsonPath(data, denial.dataPath) === null, '권한 오류와 민감 데이터 비노출을 확인하지 못했습니다.');
  }
  if (a.status !== undefined) check((Array.isArray(a.status) ? a.status : [a.status]).includes(status), 'API 응답 코드가 기대값과 다릅니다.');
  requireValue(a.denied || a.status !== undefined || a.equals !== undefined || a.aggregate, 'API 응답의 판정 기준이 없습니다.');
  if (a.equals !== undefined || a.aggregate) {
    check(status >= 200 && status < 300, '데이터 조회 API가 성공하지 않았습니다.');
    const data = await json();
    let value = jsonPath(data, a.path || '$');
    if (a.aggregate) {
      check(Array.isArray(value), '집계할 API 결과가 배열이 아닙니다.');
      const op = a.aggregate.op, field = a.aggregate.field;
      if (op === 'count') value = value.length;
      else if (op === 'distinctCount') value = new Set(value.map(r => jsonPath(r, field))).size;
      else {
        const nums = value.map(r => Number(jsonPath(r, field)));check(nums.every(Number.isFinite), '집계 원본에 유효하지 않은 숫자가 있습니다.');
        const sum = nums.reduce((s, n) => s + n, 0);
        requireValue(['sum', 'mean'].includes(op), '지원하지 않는 집계 방식입니다.');value = op === 'sum' ? sum : nums.length ? sum / nums.length : 0;
      }
    }
    if (a.tolerance !== undefined) check(Number.isFinite(Number(value)) && Math.abs(Number(value) - Number(a.equals)) <= a.tolerance, 'API 집계/수치가 기대값과 다릅니다.');
    else check(same(value, a.equals), 'API 값이 기준 데이터와 다릅니다.');
    if (a.saveAs) vars[a.saveAs] = value;
  }
}

function csv(text) {
  const rows = [];let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {if (quote && text[i + 1] === '"') {cell += '"';i++;} else quote = !quote;}
    else if (c === ',' && !quote) {row.push(cell);cell = '';}
    else if ((c === '\r' || c === '\n') && !quote) {if (c === '\r' && text[i + 1] === '\n') i++;row.push(cell);if (row.some(Boolean)) rows.push(row);row = [];cell = '';}
    else cell += c;
  }
  check(!quote, 'CSV 파일의 따옴표가 올바르지 않습니다.');row.push(cell);if (row.some(Boolean)) rows.push(row);return rows;
}

async function expectDownload(a, page) {
  requireValue(a.selector && Array.isArray(a.headers) && Number.isInteger(a.rows) && a.rows >= 0, '다운로드 선택자·기대 헤더·행 수를 설정하세요.');
  const directory = await mkdtemp(path.join(tmpdir(), 'aid25-download-'));
  try {
    const event = page.waitForEvent('download', {timeout: 30000});await page.locator(a.selector).click();
    const download = await event;check(!await download.failure(), '파일 다운로드가 실패했습니다.');
    const file = path.join(directory, 'result');await download.saveAs(file);check((await stat(file)).size <= 20 * 1024 * 1024, '다운로드 파일이 20MB를 넘었습니다.');
    const name = download.suggestedFilename().toLowerCase();let rows;
    if (name.endsWith('.xlsx')) {
      const {default: ExcelJS} = await import('exceljs');const book = new ExcelJS.Workbook();await book.xlsx.readFile(file);
      const sheet = a.sheet ? book.getWorksheet(a.sheet) : book.worksheets[0];check(sheet, '기대 시트가 없습니다.');
      rows = [];sheet.eachRow({includeEmpty: false}, r => {if (r.hasValues) rows.push(r.values.slice(1).map(v => v?.text ?? v));});
    } else if (name.endsWith('.csv')) rows = csv((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    else throw new NeedSetup('파일 열기 검증은 XLSX/CSV를 지원합니다. 실제 다운로드 형식을 확인하세요.');
    check(same(rows[0], a.headers), '다운로드 헤더가 기대값과 다릅니다.');check(rows.length - 1 === a.rows, '다운로드 데이터 행 수가 다릅니다.');
    for (const content of a.contains || []) check(JSON.stringify(rows).includes(content), '다운로드의 한글/날짜/필터 값이 기대값과 다릅니다.');
  } finally {await rm(directory, {recursive: true, force: true});}
}

export async function steps(list, env) {
  requireValue(Array.isArray(list) && list.length <= 100, '실행 단계는 최대 100개입니다.');
  for (const raw of list) {
    if (env.signal?.aborted) throw new Error('cancelled');
    const s = expand(raw, env.vars), p = env.page, loc = s.selector ? p.locator(s.selector) : null;
    switch (s.action) {
      case 'goto': await p.goto(targetUrl(s.path), {waitUntil: 'domcontentloaded', timeout: 30000});break;
      case 'fill': await loc.fill(String(s.value));break;
      case 'click': await loc.click();break;
      case 'doubleClick': requireValue(env.allowMutations, '중복 요청 테스트는 변경 허용이 필요합니다.');await loc.dblclick();break;
      case 'select': await loc.selectOption(s.value);break;
      case 'check': await loc.setChecked(s.value !== false);break;
      case 'reload': await p.reload({waitUntil: 'domcontentloaded'});break;
      case 'waitFor': await loc.waitFor({state: s.state || 'visible', timeout: Math.min(s.timeout || 20000, 360000)});break;
      case 'wait': requireValue(Number.isFinite(s.ms) && s.ms >= 0 && s.ms <= 360000, '대기 시간은 0~360,000ms입니다.');await p.waitForTimeout(s.ms);break;
      case 'clearSession': await env.context.clearCookies();await p.evaluate(() => {localStorage.removeItem('token');sessionStorage.clear();});break;
      case 'offline': await env.context.setOffline(!!s.value);break;
      case 'routeAbort': await p.route(s.pattern, r => r.abort());env.mocked = true;break;
      case 'routeResponse': await p.route(s.pattern, r => r.fulfill({status: s.status || 500, contentType: 'application/json', body: JSON.stringify(s.json ?? {})}));env.mocked = true;break;
      case 'routeDelay': requireValue(s.ms >= 0 && s.ms <= 30000, '지연 시간은 30초 이하로 설정하세요.');await p.route(s.pattern, async r => {const response = await r.fetch();await p.waitForTimeout(s.ms);await r.fulfill({response});});env.mocked = true;break;
      case 'unroute': await p.unroute(s.pattern);break;
      case 'captureText': requireValue(s.key, '저장할 기준값 이름이 없습니다.');env.vars[s.key] = (await loc.innerText()).trim();break;
      case 'watchRequests': requireValue(s.key && s.pattern, '요청 관찰 이름과 경로를 설정하세요.');env.vars[s.key] = 0;p.on('request', request => {if (request.url().includes(s.pattern)) env.vars[s.key]++;});break;
      case 'watchDialogs': requireValue(s.key, '대화상자 관찰 이름을 설정하세요.');env.vars[s.key] = 0;p.on('dialog', dialog => {env.vars[s.key]++;dialog.dismiss().catch(() => {});});break;
      case 'api': await expectApi(s, p, env.context, env.vars, env.allowMutations);break;
      case 'parallel': requireValue(env.allowMutations && Array.isArray(s.branches) && s.branches.length >= 2 && s.branches.length <= 5, '동시 요청은 변경 허용 후 2~5개 분기로 실행하세요.');await Promise.all(s.branches.map(branch => steps(branch, env)));break;
      case 'measure': {requireValue(s.key, '측정 이름이 없습니다.');const start = performance.now();await steps(s.steps, env);env.vars[s.key] = performance.now() - start;break;}
      case 'video': await loc.evaluate(async (el, options) => {if (!(el instanceof HTMLMediaElement)) throw Error('not media');if (options.operation === 'play') await el.play();else if (options.operation === 'pause') el.pause();else if (options.operation === 'seek') el.currentTime = options.seconds;else if (options.operation === 'stop') {el.pause();el.currentTime = 0;}else throw Error('invalid operation');}, {operation: s.operation, seconds: s.seconds});break;
      default: throw new NeedSetup('지원하지 않는 실행 단계입니다: ' + String(s.action));
    }
  }
}

export async function assertions(list, env) {
  requireValue(Array.isArray(list) && list.length > 0 && list.length <= 60, '판정 기준을 설정하세요.');
  for (const raw of list) {
    if (env.signal?.aborted) throw new Error('cancelled');
    const a = expand(raw, env.vars), p = env.page, loc = a.selector ? p.locator(a.selector) : null;
    switch (a.kind) {
      case 'visible': await loc.waitFor({state: 'visible', timeout: 20000});check(await loc.isVisible(), '기대 요소가 표시되지 않습니다.');break;
      case 'hidden': await loc.waitFor({state: 'hidden', timeout: 20000});check(!await loc.isVisible(), '숨겨야 할 요소가 노출됩니다.');break;
      case 'text': {requireValue(a.equals !== undefined || a.contains !== undefined || a.notContains !== undefined, '텍스트 기대값을 설정하세요.');const v = (await loc.innerText()).trim();if (a.equals !== undefined) check(v === String(a.equals), '화면 문구/지표가 기대값과 다릅니다.');if (a.contains !== undefined) check(v.includes(String(a.contains)), '기대 문구가 없습니다.');if (a.notContains !== undefined) check(!v.includes(String(a.notContains)), '노출되면 안 되는 문구가 있습니다.');break;}
      case 'number': {const v = Number((await loc.innerText()).replace(/[,\s%]/g, ''));check(Number.isFinite(v) && Math.abs(v - Number(a.equals)) <= (a.tolerance || 0), '화면 집계 수치가 기준값과 다릅니다.');break;}
      case 'count': check(await loc.count() === a.equals, '요소/행 수가 기대값과 다릅니다.');break;
      case 'attribute': check(await loc.getAttribute(a.name) === String(a.equals), '요소 속성/선택 조건이 기대값과 다릅니다.');break;
      case 'input': check(await loc.inputValue() === String(a.equals), '입력/검색 조건이 유지되지 않았습니다.');break;
      case 'url': check(p.url() === targetUrl(a.equals), '이동한 URL이 기대값과 다릅니다.');break;
      case 'noDuplicates': {const values = await loc.allTextContents();check(values.length === new Set(values.map(x => x.trim())).size, '목록에 중복 값이 있습니다.');if (a.count !== undefined) check(values.length === a.count, '목록에 누락 또는 초과 항목이 있습니다.');break;}
      case 'finite': {const values = await loc.allTextContents();check(values.length > 0 && values.every(x => !/NaN|Infinity|∞|undefined|null/.test(x)), '비정상/미수신 값이 표시됩니다.');break;}
      case 'duration': requireValue(Number.isFinite(a.maxMs) && a.maxMs > 0, '합의된 성능 한도를 설정하세요.');check(Number.isFinite(env.vars[a.key]) && env.vars[a.key] <= a.maxMs, '합의된 성능 한도를 초과했습니다.');break;
      case 'value': {requireValue(Object.hasOwn(env.vars, a.key), '캡처한 기준값이 없습니다.');const value = env.vars[a.key];requireValue(a.equals !== undefined || a.min !== undefined || a.max !== undefined, '기준값 판정 조건을 설정하세요.');if (a.equals !== undefined) check(same(value, a.equals), '캡처한 값이 기준과 다릅니다.');if (a.min !== undefined) check(Number(value) >= a.min, '측정값이 최소 기준보다 작습니다.');if (a.max !== undefined) check(Number(value) <= a.max, '측정값이 최대 기준보다 큽니다.');break;}
      case 'noGlobal': requireValue(typeof a.name === 'string' && /^[A-Za-z_]\w{0,100}$/.test(a.name) && !['constructor', 'prototype', '__proto__'].includes(a.name), '스크립트 실행 확인용 표식 이름을 설정하세요.');check(await p.evaluate(name => typeof window[name] === 'undefined', a.name), '입력값의 스크립트 실행 표식이 감지되었습니다.');break;
      case 'video': {const v = await loc.evaluate(el => ({paused: el.paused, time: el.currentTime, ready: el.readyState, error: !!el.error}));check(!v.error, '영상 재생 오류가 발생했습니다.');if (a.paused !== undefined) check(v.paused === a.paused, '영상 재생/정지 상태가 다릅니다.');if (a.minTime !== undefined) check(v.time >= a.minTime, '영상 재생/탐색 시간이 기준에 도달하지 않았습니다.');if (a.maxTime !== undefined) check(v.time <= a.maxTime, '영상 탐색/종료 시간이 기대 범위를 벗어났습니다.');break;}
      case 'api': await expectApi(a, p, env.context, env.vars, env.allowMutations);break;
      case 'download': await expectDownload(a, p);break;
      default: throw new NeedSetup('지원하지 않는 판정 기준입니다: ' + String(a.kind));
    }
  }
}

export async function login(page, account, invalid = false) {
  await page.goto(TARGET + '/login', {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.locator('input.login_input[placeholder="E-mail"]').fill(account.username);
  await page.locator('input.login_input[type="password"]').fill(account.password);
  await page.locator('.login_btn').click();
  if (invalid) {
    await page.locator('.failed_notification').waitFor({state: 'visible', timeout: 15000});
    check(!await page.evaluate(() => localStorage.getItem('token')), '잘못된 인증정보로 인증 토큰이 발급되었습니다.');
    check(new URL(page.url()).pathname.startsWith('/login'), '실패 로그인 후 보호 화면으로 이동했습니다.');
  } else {
    await page.waitForFunction(() => {const token = localStorage.getItem('token');return token && token !== 'null' && token !== 'undefined' && !location.pathname.startsWith('/login');}, null, {timeout: 20000});
    check(!await page.locator('.login_form').isVisible(), '로그인 폼이 계속 표시됩니다.');
  }
}
