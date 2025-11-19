// --- ⚙️ 설정 ---
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const TASK_LIST_NAME = SCRIPT_PROPERTIES.getProperty("TASK_LIST_NAME");
const TEAM_MEMBER_NAME = SCRIPT_PROPERTIES.getProperty("TEAM_MEMBER_NAME");
const SHEET_ID = SCRIPT_PROPERTIES.getProperty("SHEET_ID");

const DAILY_SHEET_NAME = "Daily";
const WEEKLY_SHEET_NAME = "Weekly";

// =================================================================
// --- 1. 메인 웹 앱 실행 함수 ---
// =================================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("오늘의 목표 생성기")

    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function getOrUpdateWeeklySummary(weekOffset = 0) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(WEEKLY_SHEET_NAME);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    if (!sheet) {
      sheet = spreadsheet.insertSheet(WEEKLY_SHEET_NAME);
      const headers = [
        "WeekID",
        "Period",
        "CompletedCount",
        "TodoCount",
        "CompletedTasks",
        "TodoTasks",
        "FirstRecordedAt",
      ];
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }

    const weekId = getMondayDateString_(weekOffset);

    if (weekOffset === 0) {
      const freshData = generateWeeklySummaryData_(weekOffset);
      overwriteSheetWithNewData_(sheet, weekId, freshData);
      return { content: formatDataToMarkdown_(freshData), source: "API" };
    }

    const existingRecord = findWeeklyRecord_(sheet, weekId);
    if (existingRecord) {
      return { content: formatDataToMarkdown_(existingRecord), source: "Sheet" };
    }

    const newData = generateWeeklySummaryData_(weekOffset);
    overwriteSheetWithNewData_(sheet, weekId, newData);
    return { content: formatDataToMarkdown_(newData), source: "API" };
  } finally {
    lock.releaseLock();
  }
}

// --- 나머지 함수들은 생략 (이전 답변과 동일) ---
function getTodaysTasksAndFormatMD() {
  /* 이전과 동일 */ try {
    Tasks.Tasklists.list();
  } catch (e) {
    throw new Error("Google Tasks API 서비스가 활성화되지 않았습니다.");
  }
  const taskListId = findTaskListIdByName_(TASK_LIST_NAME);
  if (!taskListId) throw new Error(`'${TASK_LIST_NAME}' Task 목록을 찾을 수 없습니다.`);
  const now = new Date();
  const todayKstString = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
  const todayTasks = [];
  let pageToken = null;
  try {
    do {
      const response = Tasks.Tasks.list(taskListId, {
        showCompleted: true,
        showHidden: true,
        maxResults: 100,
        pageToken: pageToken,
      });
      if (response.items) {
        response.items.forEach((task) => {
          let isTaskForToday = false;
          let reason = "";

          // 1. 완료된 태스크 (완료 날짜 저장)
          let completedDate = null;
          if (task.completed) {
            completedDate = Utilities.formatDate(new Date(task.completed), "Asia/Seoul", "yyyy-MM-dd");
            if (completedDate === todayKstString) {
              isTaskForToday = true;
              reason = `완료: ${completedDate}`;
            }
          }

          // 2. 마감일 체크 (오늘, 과거, 미래 모두)
          if (task.due && task.status !== "completed") {
            const dueDate = new Date(task.due);
            const dueDateKst = Utilities.formatDate(dueDate, "Asia/Seoul", "yyyy-MM-dd");
            const today = new Date(todayKstString);
            const due = new Date(dueDateKst);

            // 날짜 차이 계산 (일 단위)
            const diffTime = due.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            // D-day 계산: 오늘이면 D-Day, 과거면 D+N, 미래면 D-N
            let dDayLabel = "";
            if (diffDays === 0) {
              dDayLabel = "마감 D-Day";
              isTaskForToday = true;
            } else if (diffDays < 0) {
              dDayLabel = `마감 D+${Math.abs(diffDays)}`;
              // 과거 마감 중 최근 3일까지만 표시
              if (Math.abs(diffDays) <= 3) {
                isTaskForToday = true;
              }
            } else if (diffDays > 0 && diffDays <= 3) {
              dDayLabel = `마감 D-${diffDays}`;
              // 미래 마감 중 3일 이내만 표시
              isTaskForToday = true;
            }

            if (dDayLabel) {
              if (reason) reason += `, ${dDayLabel}`;
              else reason = dDayLabel;
            }
          }

          // 3. 오늘 생성된 태스크 (updated 필드 사용)
          if (
            task.updated &&
            Utilities.formatDate(new Date(task.updated), "Asia/Seoul", "yyyy-MM-dd") === todayKstString &&
            !task.completed // 완료되지 않은 태스크만
          ) {
            // 생성 날짜를 직접 확인하는 것이 어려우므로 updated 필드 활용
            // updated가 오늘이고 완료되지 않은 태스크는 오늘 생성/수정된 것으로 간주
            if (!reason) { // 이미 마감으로 표시되지 않았다면
              isTaskForToday = true;
              reason = "신규/수정";
            }
          }

          if (isTaskForToday && task.title) {
            todayTasks.push({
              title: task.title,
              status: task.status,
              reason: reason,
              completedDate: completedDate
            });
          }
        });
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
  } catch (e) {
    throw new Error(`'${TASK_LIST_NAME}' 목록에서 태스크를 가져오는 중 오류: ${e.message}`);
  }
  const title = `**${TEAM_MEMBER_NAME} 님 (${todayKstString}) 일일 목록입니다** 🗓️\n\n`;
  if (todayTasks.length === 0) return title + `- (오늘 관련 태스크 없음)`;

  // 태스크를 카테고리별로 분류
  const dDayTasks = todayTasks.filter(t => t.reason.includes('마감 D-Day') && t.status !== 'completed');
  const soonDueTasks = todayTasks.filter(t => t.reason.includes('마감 D-') && !t.reason.includes('D-Day') && t.status !== 'completed');
  const overdueTasks = todayTasks.filter(t => t.reason.includes('마감 D+') && t.status !== 'completed');
  const newTasks = todayTasks.filter(t =>
    t.reason === '신규/수정' &&
    t.status !== 'completed' &&
    !t.reason.includes('마감')
  );
  const completedTasks = todayTasks.filter(t => t.status === 'completed');

  let result = title;

  // 1. 오늘 마감 (D-Day) - 가장 중요
  if (dDayTasks.length > 0) {
    result += `**🔥 오늘 마감**\n`;
    result += dDayTasks.map(task =>
      `- [ ] ${task.title} (${task.reason})`
    ).join("\n") + "\n\n";
  }

  // 2. 곧 마감 (D-1, D-2, D-3)
  if (soonDueTasks.length > 0) {
    result += `**⏰ 곧 마감**\n`;
    result += soonDueTasks.map(task =>
      `- [ ] ${task.title} (${task.reason})`
    ).join("\n") + "\n\n";
  }

  // 3. 마감 지난 (D+)
  if (overdueTasks.length > 0) {
    result += `**⚠️ 마감 지남**\n`;
    result += overdueTasks.map(task =>
      `- [ ] ${task.title} (${task.reason})`
    ).join("\n") + "\n\n";
  }

  // 4. 신규/수정
  if (newTasks.length > 0) {
    result += `**📝 신규/수정**\n`;
    result += newTasks.map(task =>
      `- [ ] ${task.title} (${task.reason})`
    ).join("\n") + "\n\n";
  }

  // 5. 완료된 태스크 (우선순위 낮음)
  if (completedTasks.length > 0) {
    result += `**✅ 완료**\n`;
    result += completedTasks.map(task =>
      `- [x] ${task.title} (${task.reason})`
    ).join("\n") + "\n\n";
  }

  return result.trim();
}
function recordHistory(mdContent) {
  /* 이전과 동일 */ try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    let sheet = spreadsheet.getSheetByName(DAILY_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(DAILY_SHEET_NAME, 0);
      sheet.appendRow(["RecordedAt", "Content"]);
    }
    const now = new Date();
    const todayKstString = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - 500);
      const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, 1);
      const dates = range.getValues();
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i][0] && Utilities.formatDate(new Date(dates[i][0]), "Asia/Seoul", "yyyy-MM-dd") === todayKstString) {
          sheet.getRange(startRow + i, 1, 1, 2).setValues([[now, mdContent]]);
          return "✅ 일일 히스토리 덮어쓰기 완료!";
        }
      }
    }
    sheet.appendRow([now, mdContent]);
    return "✅ 일일 히스토리 신규 기록 완료!";
  } catch (e) {
    return `❌ 일일 기록 실패: ${e.message}`;
  }
}
function getHistory() {
  /* 이전과 동일 */ try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheetByName(DAILY_SHEET_NAME);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const numRowsToGet = Math.min(20, lastRow - 1);
    const startRow = lastRow - numRowsToGet + 1;
    const data = sheet.getRange(startRow, 1, numRowsToGet, 2).getValues();
    return data.reverse().map((row) => {
      const dateString = row[0]
        ? Utilities.formatDate(new Date(row[0]), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss")
        : "(날짜 없음)";
      const lines = (row[1] || "").toString().split("\n");
      return { date: dateString, title: lines.shift() || "", content: lines.join("\n").trim() };
    });
  } catch (e) {
    throw new Error(`일일 히스토리 읽기 오류: ${e.message}`);
  }
}
function findTaskListIdByName_(listName) {
  /* 이전과 동일 */ const taskLists = Tasks.Tasklists.list().items;
  return taskLists ? taskLists.find((list) => list.title === listName)?.id : null;
}
function getMondayDateString_(weekOffset) {
  /* 이전과 동일 */ const base = new Date();
  if (weekOffset) base.setDate(base.getDate() + weekOffset * 7);
  const kstNow = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kstNow.getDay();
  const diff = kstNow.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(kstNow.setDate(diff));
  return Utilities.formatDate(monday, "Asia/Seoul", "yyyy-MM-dd");
}
function generateWeeklySummaryData_(weekOffset) {
  /* 이전과 동일 */ const taskListId = findTaskListIdByName_(TASK_LIST_NAME);
  if (!taskListId) throw new Error(`'${TASK_LIST_NAME}' Task 목록을 찾을 수 없습니다.`);
  const monday = new Date(getMondayDateString_(weekOffset));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStartKst = Utilities.formatDate(monday, "Asia/Seoul", "yyyy-MM-dd");
  const weekEndKst = Utilities.formatDate(sunday, "Asia/Seoul", "yyyy-MM-dd");
  const completedTasks = [],
    todoTasks = [];
  let pageToken = null;
  do {
    const response = Tasks.Tasks.list(taskListId, {
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
      pageToken: pageToken,
    });
    if (response.items) {
      response.items.forEach((task) => {
        if (!task.title) return;
        if (task.completed) {
          const completedKst = Utilities.formatDate(new Date(task.completed), "Asia/Seoul", "yyyy-MM-dd");
          if (completedKst >= weekStartKst && completedKst <= weekEndKst)
            completedTasks.push({ title: task.title, date: completedKst });
        }
        if (task.status !== "completed") {
          const updatedKst = Utilities.formatDate(new Date(task.updated), "Asia/Seoul", "yyyy-MM-dd");
          if (updatedKst >= weekStartKst && updatedKst <= weekEndKst)
            todoTasks.push({ title: task.title, date: updatedKst });
        }
      });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  completedTasks.sort((a, b) => a.date.localeCompare(b.date));
  todoTasks.sort((a, b) => a.date.localeCompare(b.date));
  return {
    period: `${Utilities.formatDate(monday, "Asia/Seoul", "yyyy-MM-dd(E)")} ~ ${Utilities.formatDate(
      sunday,
      "Asia/Seoul",
      "yyyy-MM-dd(E)"
    )}`,
    completedCount: completedTasks.length,
    todoCount: todoTasks.length,
    completedTasks:
      completedTasks.length > 0
        ? completedTasks.map((t) => `- [x] ${t.title} (완료: ${t.date})`).join("\n")
        : `(완료한 태스크 없음)`,
    todoTasks:
      todoTasks.length > 0
        ? todoTasks.map((t) => `- [ ] ${t.title} (수정: ${t.date})`).join("\n")
        : `(해야 할 태스크 없음)`,
  };
}
function formatDataToMarkdown_(data) {
  /* 이전과 동일 */ let md = `**📊 ${TEAM_MEMBER_NAME} 님 주간 정리 (${data.period})**\n\n`;
  md += `✅ **완료한 일 (${data.completedCount}개)**\n`;
  md += data.completedTasks;
  md += `\n\n📝 **해야 할 일 (${data.todoCount}개)**\n`;
  md += data.todoTasks;
  return md;
}

// --- 헬퍼 함수 (핵심 수정) ---

function overwriteSheetWithNewData_(sheet, weekId, newData) {
  const headers = ["WeekID", "Period", "CompletedCount", "TodoCount", "CompletedTasks", "TodoTasks", "FirstRecordedAt"];
  const newRowData = [
    weekId,
    newData.period,
    newData.completedCount,
    newData.todoCount,
    newData.completedTasks,
    newData.todoTasks,
    new Date(),
  ];

  const lastRow = sheet.getLastRow();
  const oldData = lastRow > 1 ? sheet.getRange("A2:G" + lastRow).getValues() : [];

  const dataMap = new Map();
  oldData.forEach((row) => {
    const normalizedWeekId = row[0] instanceof Date ? Utilities.formatDate(row[0], "Asia/Seoul", "yyyy-MM-dd") : row[0];
    dataMap.set(normalizedWeekId, row);
  });

  dataMap.set(weekId, newRowData);

  const sortedData = Array.from(dataMap.values()).sort((a, b) => {
    const idA = a[0] instanceof Date ? Utilities.formatDate(a[0], "Asia/Seoul", "yyyy-MM-dd") : a[0];
    const idB = b[0] instanceof Date ? Utilities.formatDate(b[0], "Asia/Seoul", "yyyy-MM-dd") : b[0];
    return idA.localeCompare(idB);
  });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }
  if (sortedData.length > 0) {
    sheet.getRange(2, 1, sortedData.length, headers.length).setValues(sortedData);
  }
}

function findWeeklyRecord_(sheet, weekId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const allData = sheet.getRange("A2:G" + lastRow).getValues();
  for (let i = allData.length - 1; i >= 0; i--) {
    const currentRow = allData[i];
    const normalizedWeekId =
      currentRow[0] instanceof Date ? Utilities.formatDate(currentRow[0], "Asia/Seoul", "yyyy-MM-dd") : currentRow[0];

    if (normalizedWeekId === weekId) {
      return {
        period: currentRow[1],
        completedCount: currentRow[2],
        todoCount: currentRow[3],
        completedTasks: currentRow[4],
        todoTasks: currentRow[5],
      };
    }
  }
  return null;
}
