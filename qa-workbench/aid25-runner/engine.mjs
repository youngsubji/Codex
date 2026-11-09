import {randomUUID} from 'node:crypto';
import {catalog, TARGET, preflight, login, steps, assertions, NeedSetup, CheckFailed} from './scenarios.mjs';

export function publicRun(run) {
  return {id: run.id, target: TARGET, state: run.state, startedAt: run.startedAt, finishedAt: run.finishedAt,
    browser: run.browser, results: run.results.map(r => ({...r})),
    counts: Object.fromEntries(['passed', 'failed', 'blocked', 'error', 'skipped', 'running', 'pending'].map(s => [s, run.results.filter(r => r.status === s).length]))};
}

export function createRun(options) {
  const ids = new Set(options.selected);
  return {id: randomUUID(), state: 'queued', startedAt: new Date().toISOString(), finishedAt: null,
    browser: options.browser || 'chromium', results: catalog.filter(c => ids.has(c.id)).map(c => ({id: c.id, title: c.title, priority: c.priority, group: c.group, expected: c.expected,
      status: 'pending', detail: '', durationMs: 0, checks: []}))};
}

export async function execute(run, options, {signal, launch, authenticate = login} = {}) {
  const browsers = new Map(), states = new Map(), failedActors = new Set(), passwords = options.accounts;
  const close = async () => {await Promise.allSettled([...browsers.values()].map(b => b.close()));};
  signal?.addEventListener('abort', close, {once: true});
  const getBrowser = async name => {
    if (signal?.aborted) throw Error('cancelled');
    if (!browsers.has(name)) {
      const factory = launch || (async browser => {const pw = await import('playwright');return pw[browser].launch({headless: !options.showBrowser});});
      const browser = await factory(name);browsers.set(name, browser);
      if (signal?.aborted) {await browser.close();throw Error('cancelled');}
    }
    return browsers.get(name);
  };
  const context = async (actor = 'primary', browserName = run.browser) => {
    if (failedActors.has(actor)) throw new NeedSetup('로그인 실패로 이 계정의 후속 테스트를 중단했습니다. 계정·추가 인증을 확인한 뒤 새로 실행하세요.');
    const key = actor + ':' + browserName, browser = await getBrowser(browserName);
    if (!states.has(key)) {
      if (!passwords[actor]?.username || !passwords[actor]?.password) throw new NeedSetup('테스트 계정 설정 필요: ' + actor);
      const ctx = await browser.newContext({locale: 'ko-KR', timezoneId: options.profile.timezone || 'Asia/Seoul', acceptDownloads: true});
      try {const page = await ctx.newPage();page.setDefaultTimeout(20000);await authenticate(page, passwords[actor]);states.set(key, await ctx.storageState());}
      catch {failedActors.add(actor);throw new CheckFailed('정상 로그인 성공을 확인하지 못했습니다. 계정·추가 인증·서비스 접속을 확인하세요. 이 계정으로 재시도하지 않습니다.');}
      finally {await ctx.close();}
    }
    return browser.newContext({storageState: states.get(key), locale: 'ko-KR', timezoneId: options.profile.timezone || 'Asia/Seoul', acceptDownloads: true});
  };
  run.state = 'running';
  try {
    for (const result of run.results) {
      if (signal?.aborted) break;
      const item = catalog.find(c => c.id === result.id);
      const missing = preflight(item, options.profile, passwords, options.allowMutations);
      if (missing) {result.status = 'blocked';result.detail = missing;continue;}
      const start = performance.now();result.status = 'running';
      try {
        if (item.id === 'AUTH-01') {
          const verified = await context();await verified.close();result.checks.push({key: '정상 로그인', status: 'passed'});
          const ctx = await (await getBrowser(run.browser)).newContext({locale: 'ko-KR'});
          try {
            const page = await ctx.newPage();page.setDefaultTimeout(20000);
            // One nonexistent example.invalid account, never repeated guesses against the user's account.
            await authenticate(page, {username: 'qa-invalid-' + randomUUID() + '@example.invalid', password: randomUUID()}, true);
            result.checks.push({key: '실패 로그인', status: 'passed'});
          } finally {await ctx.close();}
        } else {
          const recipe = options.profile.cases[item.id];
          const vars = {...options.profile.fixtures, ...options.profile.tenantFixtures, ...recipe.fixtures};
          for (const part of recipe.checks) {
            if (signal?.aborted) throw Error('cancelled');
            if (!['chromium', 'firefox', 'webkit'].includes(part.browser || run.browser)) throw new NeedSetup('지원하지 않는 테스트 브라우저입니다.');
            const ctx = await context(part.actor || 'primary', part.browser || run.browser);
            const page = await ctx.newPage();page.setDefaultTimeout(20000);
            const env = {page, context: ctx, signal, vars, allowMutations: !!options.allowMutations, mocked: false};
            const sub = {key: part.key, status: 'running', browser: part.browser || run.browser, actor: part.actor || 'primary'};result.checks.push(sub);
            try {
              await steps(part.steps || [], env);await assertions(part.assertions, env);
              sub.status = 'passed';if (env.mocked) sub.mode = '모의 응답/장애 주입';
            } catch (e) {sub.status = signal?.aborted ? 'skipped' : e instanceof NeedSetup ? 'blocked' : e instanceof CheckFailed ? 'failed' : 'error';throw e;}
            finally {await ctx.close();}
          }
        }
        result.status = 'passed';result.detail = '설정된 모든 하위 판정을 통과했습니다.';
      } catch (error) {
        if (signal?.aborted) {result.status = 'skipped';result.detail = signal.reason === 'time_limit' ? '최대 실행 시간(60분)에 도달해 중지했습니다.' : '사용자가 실행을 중지했습니다.';}
        else if (error instanceof NeedSetup) {result.status = 'blocked';result.detail = error.message;}
        else if (error instanceof CheckFailed) {result.status = 'failed';result.detail = error.message;}
        else {result.status = 'error';result.detail = '브라우저 실행 오류 또는 시간 초과입니다. 브라우저 설치·접속·로그인과 설정한 선택자를 확인하세요.';}
      } finally {result.durationMs = Math.round(performance.now() - start);}
    }
    run.state = signal?.aborted ? 'cancelled' : 'finished';
  } catch {
    run.state = signal?.aborted ? 'cancelled' : 'error';
  } finally {
    for (const row of run.results) if (['pending', 'running'].includes(row.status)) {row.status = 'skipped';row.detail = '실행이 종료되어 검증하지 않았습니다.';}
    run.finishedAt = new Date().toISOString();
    await close();states.clear();
    for (const account of Object.values(passwords)) if (account) {account.password = '';account.username = '';}
    signal?.removeEventListener('abort', close);
  }
  return publicRun(run);
}
