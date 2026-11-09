# Aid25 로컬 자동화 테스트 실행기

대상: https://aidrive.co.kr/

이 실행기는 QA Workbench의 **테스트설계 및 aid테스트 → Aid25 자동화 테스트** 화면과 연결됩니다. Node.js 20 이상이 필요합니다. Netlify에 올리는 정적 HTML만으로는 다른 웹사이트의 브라우저·세션·API를 자동 조작할 수 없어 사용자 PC에서 Playwright 브라우저를 실행합니다.

## 시작

1. 실행기 ZIP 전체를 새 폴더에 압축 해제합니다.
2. Windows: `start-windows.cmd`를 실행합니다. Mac/Linux: 터미널에서 `sh start.sh`를 실행합니다.
3. 첫 실행 시 Node 패키지와 Chromium을 내려받습니다. 완료 후 `http://127.0.0.1:4319/?tool=aid25&lang=ko`를 엽니다.
4. 정상 로그인 ID/E-mail과 PW를 입력하고 테스트를 선택한 뒤 **테스트 시작**을 누릅니다.
5. 진행 상태와 결과를 확인하고 JSON/CSV로 다운로드합니다. **테스트 중지**로 실행을 취소할 수 있습니다.

현재 답변에서 실제 사용자 계정은 제공되지 않았으므로 대상 사이트에 로그인하거나 대상 서비스 테스트를 실행하지 않았습니다. 구현 확인은 모의 브라우저와 로컬 HTTP 연결, DOM 기반 UI 점검으로 수행했습니다. 설치 안내의 브라우저 다운로드는 사용자 PC에서 실행됩니다.

Firefox/WebKit을 사용할 때는 폴더에서 `npx playwright install firefox webkit`을 추가 실행하세요. Linux에서 필요한 시스템 라이브러리가 없다는 메시지가 나오면 Playwright의 운영체제 의존성 안내에 따라 설치하세요. 서버 환경에서는 ‘실행 브라우저 보기’를 해제해 headless로 실행할 수 있습니다.

GitHub 소스에서 직접 실행한다면 `npm ci`, `npx playwright install chromium`, `npm start`를 실행합니다. 패키지 안에서는 `web/index.html`, GitHub 저장소 안에서는 상위 `index.html`을 사용합니다. `node_modules`와 브라우저 실행 파일은 ZIP/Git에 포함하지 않습니다.

## 현재 자동 실행 범위

총 **42개**: P0 13개, P1 22개, 공통 7개입니다. `catalog.json`에 요청된 케이스와 각 하위 검증 항목을 등록했습니다.

- **AUTH-01**은 입력한 정상 계정으로 로그인 성공을 확인하고, 새 브라우저 컨텍스트에서 존재하지 않는 `example.invalid` 테스트 ID로 실패 로그인을 1회 확인합니다. 실제 정상 계정에 잘못된 PW를 반복 대입하지 않습니다.
- 정상 계정 로그인이 실패하면 같은 실행의 후속 케이스에서 이 계정으로 재로그인을 반복하지 않습니다.
- **나머지 41개**는 기준 데이터·계산식·권한 정책·실제 화면 선택자/API 경로가 아직 준비되지 않았다는 사용자 답변에 따라, 설정 JSON이 없으면 **설정 필요**로 표시합니다. 구현된 단계/판정 엔진과 하위 검증 틀을 사용해 실제 서비스에 맞는 설정을 채워야 실행 가능합니다. 이 41개가 현재 서비스용으로 구성·검증을 마친 테스트라는 의미는 아닙니다.
- 모든 필수 하위 검증과 판정 기준이 있어야 해당 케이스를 실행합니다. 빈 계획이나 메뉴 존재만으로 케이스 전체를 통과시키지 않습니다.
- 영상 요청·할당량 차감·데이터/설정 변경은 ‘변경 테스트 허용’을 선택한 경우에만 실행합니다. 전용 테스트 데이터와 정리/복구 절차를 준비하세요.
- AUTH-03은 일반/관리자 메뉴와 API 모두 필요합니다. AUTH-04는 승인된 타 고객사 ID와 자기 고객사의 정상 조회 대조군, 실제 API 차단 판정이 필요합니다. 임의 ID 탐색은 구현하지 않았습니다.
- DASH-05의 ‘5분 갱신’은 실제 300,000ms 이상 대기를 요구합니다. COMMON-07은 지원 브라우저 목록과 브라우저별 하위 검증이 필요합니다.

실행 완료와 전체 통과는 다릅니다. 통과·실패·설정 필요·실행 오류·미실행을 별도로 집계합니다. 기본 설정으로 42개를 선택하면 AUTH-01을 실제 실행하고 나머지는 설정 필요가 됩니다. 전체 실행은 최대 60분이며 이후 중지됩니다.

## 계정과 데이터

ID/PW는 UI의 비밀번호 입력 필드에 입력합니다. 계정은 로컬 실행기에만 전송하며 결과/설정 파일이나 브라우저 저장소에 저장하지 않습니다. 입력 PW는 시작 요청 후 화면에서 지우고 실행기 내부 계정 값은 종료 시 지웁니다. 브라우저 인증 상태는 실행 중 메모리에 유지하고 컨텍스트/브라우저를 종료합니다. 스크린샷·트레이스·응답 원문을 보고서에 저장하지 않습니다. 결과는 최대 10개를 메모리에 보관하며 서버 종료 시 사라집니다.

서버는 `127.0.0.1`에만 바인딩하며 로컬 페이지에 생성한 실행 토큰을 넣습니다. 외부 Origin과 잘못된 Host, 실행 토큰 없는 API 호출을 차단합니다. Netlify 페이지에서 로컬 API로 직접 비밀번호를 보내는 방식은 사용하지 않습니다. 로컬 실행 화면으로 이동해 입력하세요.

사이트 로그인 폼 선택자는 공개 `LoginView` 코드의 `input.login_input[placeholder="E-mail"]`, `input.login_input[type="password"]`, `.login_btn`, `.failed_notification`을 근거로 했습니다. 로그인 성공은 `/login` 이탈, 인증 토큰 존재, 로그인 폼 비표시를 함께 확인합니다. 사이트 UI나 추가 인증 방식이 변경되면 어댑터를 갱신해야 합니다. 대상의 현재 실제 계정으로 이 선택자를 검증하지는 않았습니다.

## 시나리오 JSON

화면의 **설정 예시 다운로드**는 전체 케이스의 필수 하위 항목을 포함합니다. `REPLACE_` 자리표시자는 실행하지 않습니다. 실제 값으로 바꾼 후 업로드하세요. 계정 PW는 JSON에 넣지 않고 화면에 입력합니다.

설정 구조 예시(완성된 실제 서비스 설정이 아님):

```json
{
  "version": 1,
  "target": "https://aidrive.co.kr",
  "timezone": "Asia/Seoul",
  "primaryRole": "user",
  "fixtures": {"expectedRows": 20},
  "cases": {
    "REPORT-04": {
      "checks": [{
        "key": "전체/페이지 범위",
        "actor": "primary",
        "steps": [{"action": "goto", "path": "/REPLACE_REPORT_PATH"}],
        "assertions": [{"kind": "count", "selector": "REPLACE_ROW_SELECTOR", "equals": 20}]
      }]
    }
  }
}
```

각 케이스는 `catalog.json`의 모든 `checks` 키를 포함해야 합니다. 하위 검증마다 `actor`(primary/admin/otherTenant), 선택적 `browser`(chromium/firefox/webkit), `steps`, 하나 이상의 `assertions`를 둡니다. 실제 조회 조건·원본과 계산식·에러 정책은 테스트 소유자가 확정해야 합니다.

지원 단계:

- `goto`(path), `fill`(selector/value), `click`, `doubleClick`, `select`, `check`, `reload`
- `waitFor`(selector/state), `wait`(ms), `clearSession`, `offline`(value)
- `routeAbort`(pattern), `routeResponse`(pattern/status/json), `routeDelay`(pattern/ms), `unroute`(pattern)
- `captureText`(selector/key), `watchRequests`(pattern/key), `watchDialogs`(key), `measure`(key/steps)
- `api`(request, status/equals 등 API 판정과 같은 항목): 동시 요청은 `parallel` 분기에 구성할 수 있습니다.
- `parallel`(branches: 단계 배열 2~5개, 변경 허용 필요)
- `video`(selector/operation: play, pause, seek, stop; seek는 seconds 필요)

지원 판정:

- `visible`, `hidden`, `text`(equals/contains/notContains), `number`(equals/tolerance), `count`(equals)
- `attribute`(name/equals), `input`(equals), `url`(equals), `noDuplicates`(선택적 count), `finite`
- `duration`(key/maxMs), `value`(key/equals 또는 min/max), `noGlobal`(name: 무해한 입력 검증용 전역 표식 이름)
- `video`(paused/minTime/maxTime)
- `api`(request.path/method/headers/data; 선택적 tokenHeader/tokenPrefix, status, path/equals/tolerance, aggregate)
- `download`(selector, headers 배열, 데이터 rows 수; 선택적 sheet, contains 배열): XLSX/CSV를 실제 파싱해 헤더/행/내용 확인, 임시 파일 삭제

`${}` JavaScript 코드는 실행하지 않습니다. `{{fixtureName}}`만 기준값으로 치환합니다. API 값 경로는 `$.data.items[0].id` 형식입니다. 사용자 입력으로 임의 JavaScript를 실행하는 단계는 없습니다.

API 직접 요청 허용 주소는 공개 서비스 코드에서 확인한 `https://aidrive.co.kr`, `https://live-aid25-api.aimatics.net`, `https://aid25-rest-api.aimatics.net`입니다. API 판정에서 `request.tokenHeader: "Authorization"`을 설정하면 현재 행위자 브라우저의 인증 토큰을 메모리에서 읽어 사용합니다. 보고서에는 기록하지 않습니다. POST는 명시적 읽기 전용 GraphQL query 또는 변경 허용이 필요합니다.

`api.aggregate`는 `{ "op": "count|distinctCount|sum|mean", "field": "$.field" }`로 설정하고 `path`에서 고른 원본 배열을 집계하여 `equals`와 비교합니다. `saveAs`로 값을 메모리의 후속 기준값에 보관할 수 있습니다. 차량 수는 `distinctCount`로 이벤트 중복을 제거하세요. 운행률 등 서비스별 산식은 원본과 확정된 기대값을 함께 준비해야 합니다.

AUTH-04에는 `tenantFixtures`의 `ownTenantId`, `foreignTenantId`, `vehicleId`, `driverId`, `videoId`가 필요합니다. 자기 고객사 API의 `status:200`과 기대 데이터 값, 타 고객사 요청의 `denied:true`를 함께 판정합니다. `denied:true`는 HTTP 401/403/404를 확인합니다. GraphQL HTTP 200 오류 응답은 `graphqlDenial: {codePath, codes, dataPath}`를 설정하고 권한 오류 코드 일치와 민감 데이터 null을 함께 검증합니다. 단순 HTTP 200이나 빈 화면은 차단 성공이 아닙니다.

COMMON-07의 `compatibilityBrowsers`에는 실제 지원 브라우저를 나열하고, 각 하위 항목마다 해당 브라우저를 `browser`에 지정한 검증을 모두 준비하세요. 장애 주입을 사용한 하위 결과는 **모의 응답/장애 주입**으로 표시합니다. 이는 실제 서버의 장애 정책을 입증했다는 뜻이 아닙니다.

## 검증 범위

`npm test`로 카탈로그·미설정 차단·로그인 재시도 방지·API/GraphQL 격리 판정·로컬 HTTP 인증/Origin/Host 제한·동시 실행 방지·취소·보고서의 계정 정보 제외, XLSX/CSV 다운로드 파일의 실제 파싱과 임시 파일 삭제를 검사합니다. 테스트의 브라우저는 모의 객체이며 대상 서비스에 접근하지 않습니다.

웹 UI는 DOM 환경에서 로컬 HTTP 실행기와 연결해 메뉴 위치, 42개 목록, ID/PW 입력, P0 선택, 시작→결과 조회, PW 제거, 보고서 버튼, 메뉴 이동을 검증했습니다. 실제 Playwright 브라우저 설치와 Aidrive 로그인/전체 테스트, 실제 브라우저 시각 검증은 사용자 PC와 테스트 데이터로 추가 확인해야 합니다.
