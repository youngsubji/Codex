/**
 * ==============================================================================
 * YOUNGSUB 업무 일정 대시보드 - Google Sheets(구글 시트) 연동 백엔드
 * ==============================================================================
 * 
 * [연동된 구글 스프레드시트]
 * - 시트 URL: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
 * - 시트 ID: YOUR_SPREADSHEET_ID
 * - 배포된 웹 앱 URL: YOUR_APPS_SCRIPT_WEB_APP_URL
 * 
 * [설치 및 배포 방법 - 가장 추천하는 방법]
 * 방법 1 (구글 시트에서 직접 연동 - 가장 간편 ⭐):
 *   1. 위 구글 시트 링크(https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit)를 엽니다.
 *   2. 상단 메뉴 [확장 프로그램] -> [Apps Script]를 클릭합니다.
 *   3. 열린 편집창의 모든 내용을 지우고, 이 파일의 전체 코드를 붙여넣습니다.
 *   4. [Ctrl + S]로 저장합니다.
 *   5. (선택) 상단 함수 선택창에서 'initSpreadsheet' 선택 후 [실행]을 누르면 시트에 헤더가 자동 생성됩니다!
 *   6. 우측 상단 [배포] -> [새 배포] 클릭
 *      - 유형: [웹 앱] 선택
 *      - 설명: 대시보드 구글 시트 연동
 *      - 다음 사용자 권한으로 실행: [나 (내 계정)]
 *      - 액세스 권한이 있는 사용자: [모든 사용자(Anyone)]  <-- ★ 필수!
 *   7. [배포] 클릭 후 발급되는 [웹 앱 URL]을 복사하여 대시보드에 입력하세요!
 * 
 * 방법 2 (기존 독립형 Apps Script 프로젝트에서 연동):
 *   - 기존 스크립트 편집기(YOUR_SCRIPT_PROJECT_ID)에 이 코드를 붙여넣고 저장 후 [배포] -> [새 배포]를 진행하셔도 완벽하게 연동됩니다.
 * ==============================================================================
 */

// 연동할 구글 스프레드시트 ID
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";

// 시트 탭 이름
const SHEET_PROJECTS = "프로젝트";
const SHEET_TASKS = "하위업무";

/**
 * 스프레드시트 객체 가져오기
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    // 만약 시트에 직접 바인딩된 스크립트인 경우
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * [초기화 함수]
 * Apps Script 상단에서 'initSpreadsheet'를 선택하고 [실행]을 누르면
 * 구글 시트에 '프로젝트'와 '하위업무' 시트가 자동으로 예쁘게 생성됩니다!
 */
function initSpreadsheet() {
  var ss = getSpreadsheet();

  // 1. 프로젝트 시트 생성 및 서식 지정
  var pSheet = ss.getSheetByName(SHEET_PROJECTS);
  if (!pSheet) pSheet = ss.insertSheet(SHEET_PROJECTS);

  if (pSheet.getLastRow() === 0) {
    var pHeaders = ["프로젝트 ID", "프로젝트명", "담당자", "시작일", "종료일", "진행상태", "색상", "메모", "최종수정일시"];
    pSheet.getRange(1, 1, 1, pHeaders.length).setValues([pHeaders]);
    formatHeaderRow(pSheet, pHeaders.length, "#1d4ed8");
  }

  // 2. 하위업무 시트 생성 및 서식 지정
  var tSheet = ss.getSheetByName(SHEET_TASKS);
  if (!tSheet) tSheet = ss.insertSheet(SHEET_TASKS);

  if (tSheet.getLastRow() === 0) {
    var tHeaders = ["업무 ID", "소속 프로젝트 ID", "업무명", "담당자", "시작일", "종료일", "진행상태", "메모", "최종수정일시"];
    tSheet.getRange(1, 1, 1, tHeaders.length).setValues([tHeaders]);
    formatHeaderRow(tSheet, tHeaders.length, "#047857");
  }

  Logger.log("구글 시트 초기화 완료: " + ss.getName());
  return "구글 시트 초기화가 완료되었습니다!";
}

/**
 * 날짜 포맷팅 헬퍼 (YYYY-MM-DD 변환)
 */
function formatDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, "0");
    var d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dObj = new Date(s);
  if (!isNaN(dObj.getTime())) {
    var y = dObj.getFullYear();
    var m = String(dObj.getMonth() + 1).padStart(2, "0");
    var d = String(dObj.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  return s;
}

/**
 * 데이터 불러오기 (GET 요청 처리)
 * 구글 시트의 '프로젝트' 및 '하위업무' 시트에서 모든 행 데이터를 읽어와 대시보드에 전달합니다.
 */
function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var pSheet = ss.getSheetByName(SHEET_PROJECTS);
    var tSheet = ss.getSheetByName(SHEET_TASKS);

    var projects = [];
    var tasks = [];

    // 1. 프로젝트 데이터 읽기
    if (pSheet && pSheet.getLastRow() > 1) {
      var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 9).getValues();
      for (var i = 0; i < pData.length; i++) {
        var row = pData[i];
        if (row[0] && row[1]) {
          projects.push({
            id: String(row[0]),
            name: String(row[1]),
            owner: String(row[2] || ""),
            start: formatDate(row[3]),
            end: formatDate(row[4]),
            status: String(row[5] || "대기"),
            color: String(row[6] || "#4777ed"),
            memo: String(row[7] || "")
          });
        }
      }
    }

    // 2. 하위 업무 데이터 읽기
    if (tSheet && tSheet.getLastRow() > 1) {
      var tData = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 9).getValues();
      for (var j = 0; j < tData.length; j++) {
        var rowT = tData[j];
        if (rowT[0] && rowT[2]) {
          tasks.push({
            id: String(rowT[0]),
            projectId: String(rowT[1]),
            name: String(rowT[2]),
            owner: String(rowT[3] || ""),
            start: formatDate(rowT[4]),
            end: formatDate(rowT[5]),
            status: String(rowT[6] || "대기"),
            memo: String(rowT[7] || "")
          });
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      source: "google_spreadsheet",
      sheetName: ss.getName(),
      data: {
        version: "1.2.0",
        projects: projects,
        tasks: tasks,
        updatedAt: new Date().toISOString()
      }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 데이터 저장하기 (POST 요청 처리)
 * 대시보드에서 프로젝트/업무를 등록, 수정, 삭제했을 때 구글 시트의 행으로 동기화합니다.
 */
function doPost(e) {
  try {
    var postData = "";
    if (e && e.postData && e.postData.contents) {
      postData = e.postData.contents;
    } else {
      throw new Error("전송된 데이터 본문이 없습니다.");
    }

    var parsed = JSON.parse(postData);
    if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) {
      throw new Error("유효한 프로젝트 대시보드 데이터 포맷이 아닙니다.");
    }

    var ss = getSpreadsheet();
    var nowIso = new Date().toISOString();

    // 1. 프로젝트 시트 갱신
    var pSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!pSheet) pSheet = ss.insertSheet(SHEET_PROJECTS);
    pSheet.clear();

    var pHeaders = ["프로젝트 ID", "프로젝트명", "담당자", "시작일", "종료일", "진행상태", "색상", "메모", "최종수정일시"];
    var pRows = [pHeaders];

    for (var i = 0; i < parsed.projects.length; i++) {
      var p = parsed.projects[i];
      pRows.push([
        p.id,
        p.name,
        p.owner,
        p.start,
        p.end,
        p.status,
        p.color || "#4777ed",
        p.memo || "",
        nowIso
      ]);
    }

    pSheet.getRange(1, 1, pRows.length, pHeaders.length).setValues(pRows);
    formatHeaderRow(pSheet, pHeaders.length, "#1d4ed8");

    // 2. 하위업무 시트 갱신
    var tSheet = ss.getSheetByName(SHEET_TASKS);
    if (!tSheet) tSheet = ss.insertSheet(SHEET_TASKS);
    tSheet.clear();

    var tHeaders = ["업무 ID", "소속 프로젝트 ID", "업무명", "담당자", "시작일", "종료일", "진행상태", "메모", "최종수정일시"];
    var tRows = [tHeaders];

    for (var j = 0; j < parsed.tasks.length; j++) {
      var t = parsed.tasks[j];
      tRows.push([
        t.id,
        t.projectId,
        t.name,
        t.owner,
        t.start,
        t.end,
        t.status,
        t.memo || "",
        nowIso
      ]);
    }

    tSheet.getRange(1, 1, tRows.length, tHeaders.length).setValues(tRows);
    formatHeaderRow(tSheet, tHeaders.length, "#047857");

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "구글 스프레드시트에 성공적으로 저장되었습니다.",
      spreadsheetName: ss.getName(),
      projectsCount: parsed.projects.length,
      tasksCount: parsed.tasks.length,
      updatedAt: nowIso
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 시트 헤더 디자인 적용
 */
function formatHeaderRow(sheet, numCols, bgColor) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground(bgColor);
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);
}
