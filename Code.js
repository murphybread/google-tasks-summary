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
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 권한 승인을 강제로 띄우기 위한 함수입니다.
 * 이 함수를 실행하여 권한 팝업이 뜨면 승인해주세요.
 */
function requestCalendarPermissions() {
  console.log("권한 확인 중...");
  // try-catch 없이 직접 호출하여 팝업 유도
  Calendar.Events.list("primary", { maxResults: 1 });
  console.log("✅ 캘린더 권한이 확인되었습니다!");
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

/**
 * Retrieve tasks from multiple lists and format them into Markdown.
 * Supports multiple list names separated by commas (e.g., "Normal, High").
 */
function getTodaysTasksAndFormatMD() {
  try {
    Tasks.Tasklists.list();
  } catch (e) {
    throw new Error("Google Tasks API service is not enabled.");
  }

  // Split list names by comma and trim whitespace
  const targetListNames = TASK_LIST_NAME.split(",").map((name) => name.trim());
  const todayTasks = [];
  const now = new Date();
  const todayKstString = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");

  // Iterate through each list name to fetch tasks
  targetListNames.forEach((listName) => {
    const taskListId = findTaskListIdByName_(listName);

    if (!taskListId) {
      console.warn(`Task list not found: ${listName}`);
      return; // Skip if list is not found
    }

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

            // 1. Check completed tasks
            let completedDate = null;
            if (task.completed) {
              completedDate = Utilities.formatDate(new Date(task.completed), "Asia/Seoul", "yyyy-MM-dd");
              if (completedDate === todayKstString) {
                isTaskForToday = true;
                reason = `Completed: ${completedDate}`;
              }
            }

            // 2. Check due date
            if (task.due && task.status !== "completed") {
              const dueDate = new Date(task.due);
              const dueDateKst = Utilities.formatDate(dueDate, "Asia/Seoul", "yyyy-MM-dd");
              const today = new Date(todayKstString);
              const due = new Date(dueDateKst);

              const diffTime = due.getTime() - today.getTime();
              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

              let dDayLabel = "";
              if (diffDays === 0) {
                dDayLabel = "Due D-Day";
                isTaskForToday = true;
              } else if (diffDays < 0) {
                dDayLabel = `Overdue D+${Math.abs(diffDays)}`;
                if (Math.abs(diffDays) <= 3) {
                  isTaskForToday = true;
                }
              } else if (diffDays > 0 && diffDays <= 3) {
                dDayLabel = `Due D-${diffDays}`;
                isTaskForToday = true;
              }

              if (dDayLabel) {
                if (reason) reason += `, ${dDayLabel}`;
                else reason = dDayLabel;
              }
            }

            // 3. Check newly created or updated tasks
            if (
              task.updated &&
              Utilities.formatDate(new Date(task.updated), "Asia/Seoul", "yyyy-MM-dd") === todayKstString &&
              !task.completed
            ) {
              if (!reason) {
                isTaskForToday = true;
                reason = "New/Updated";
              }
            }

            if (isTaskForToday && task.title) {
              todayTasks.push({
                title: task.title,
                status: task.status,
                reason: reason,
                completedDate: completedDate,
                listName: listName, // Track source list name if needed
                notes: task.notes || null, // Include task details/notes
              });
            }
          });
        }
        pageToken = response.nextPageToken;
      } while (pageToken);
    } catch (e) {
      console.error(`Error fetching tasks from list '${listName}': ${e.message}`);
    }
  });

  const title = `**${TEAM_MEMBER_NAME} (${todayKstString}) Daily Tasks** 🗓️\n\n`;

  // 0. Calendar Events
  const calendarEvents = getTodaysCalendarEvents(todayKstString);
  let result = title;

  if (calendarEvents.length > 0) {
    result += `**📅 Today's Schedule**\n`;
    result += calendarEvents.map((e) => `- [ ] ${e.time} ${e.title}`).join("\n") + "\n\n";
  } else {
    result += `**📅 Today's Schedule**\n- (No events)\n\n`;
  }

  // Categorize tasks
  const dDayTasks = todayTasks.filter((t) => t.reason.includes("Due D-Day") && t.status !== "completed");
  const soonDueTasks = todayTasks.filter(
    (t) => t.reason.includes("Due D-") && !t.reason.includes("D-Day") && t.status !== "completed"
  );
  const overdueTasks = todayTasks.filter((t) => t.reason.includes("Overdue D+") && t.status !== "completed");
  const newTasks = todayTasks.filter(
    (t) => t.reason === "New/Updated" && t.status !== "completed" && !t.reason.includes("Due")
  );
  const completedTasks = todayTasks.filter((t) => t.status === "completed");

  if (todayTasks.length === 0 && calendarEvents.length === 0) return title + `- (No tasks or events for today)`;

  // Helper function to format task with optional notes
  const formatTask = (task, checkbox) => {
    let line = `${checkbox} ${task.title} (${task.reason})`;
    if (task.notes) {
      // Limit to first 5 lines OR 300 characters (whichever comes first)
      const maxChars = 300;
      const maxLines = 5;
      const lines = task.notes.split("\n");
      const limitedLines = [];
      let totalLength = 0;
      let hasMore = false;

      for (let i = 0; i < lines.length && i < maxLines; i++) {
        const currentLine = lines[i];

        if (totalLength + currentLine.length > maxChars) {
          // Add partial line up to 300 characters
          const remainingChars = maxChars - totalLength;
          if (remainingChars > 0) {
            limitedLines.push(currentLine.substring(0, remainingChars));
          }
          hasMore = true;
          break;
        }

        limitedLines.push(currentLine);
        totalLength += currentLine.length;
      }

      if (lines.length > limitedLines.length || totalLength >= maxChars) {
        hasMore = true;
      }

      // Format as indented code block
      line += `\n    \`\`\`\n`;
      line += limitedLines.map((noteLine) => `    ${noteLine}`).join("\n");
      if (hasMore) {
        line += `\n    ...`;
      }
      line += `\n    \`\`\``;
    }
    return line;
  };

  // Generate Markdown Output
  if (dDayTasks.length > 0) {
    result += `**🔥 Due Today**\n`;
    result += dDayTasks.map((task) => formatTask(task, "- [ ]")).join("\n") + "\n\n";
  }

  if (soonDueTasks.length > 0) {
    result += `**⏰ Due Soon**\n`;
    result += soonDueTasks.map((task) => formatTask(task, "- [ ]")).join("\n") + "\n\n";
  }

  if (overdueTasks.length > 0) {
    result += `**⚠️ Overdue**\n`;
    result += overdueTasks.map((task) => formatTask(task, "- [ ]")).join("\n") + "\n\n";
  }

  if (newTasks.length > 0) {
    result += `**📝 New/Updated**\n`;
    result += newTasks.map((task) => formatTask(task, "- [ ]")).join("\n") + "\n\n";
  }

  if (completedTasks.length > 0) {
    result += `**✅ Completed**\n`;
    result += completedTasks.map((task) => formatTask(task, "- [x]")).join("\n") + "\n\n";
  }

  return result.trim();
}

/**
 * 오늘 날짜의 캘린더 이벤트를 가져옵니다.
 * @param {string} todayKstString "yyyy-MM-dd" 형식의 오늘 날짜 문자열
 * @returns {Array<{time: string, title: string}>}
 */
function getTodaysCalendarEvents(todayKstString) {
  try {
    const calendarId = "primary"; // 기본 캘린더 사용
    const now = new Date();
    const startOfDay = new Date(todayKstString + "T00:00:00+09:00");
    const endOfDay = new Date(todayKstString + "T23:59:59+09:00");

    const events = Calendar.Events.list(calendarId, {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    if (!events.items || events.items.length === 0) {
      return [];
    }

    return events.items.map((event) => {
      let timeString = "";
      if (event.start.dateTime) {
        // 시간 지정 이벤트
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const startStr = Utilities.formatDate(start, "Asia/Seoul", "HH:mm");
        const endStr = Utilities.formatDate(end, "Asia/Seoul", "HH:mm");
        timeString = `[${startStr}~${endStr}]`;
      } else if (event.start.date) {
        // 하루 종일 이벤트
        timeString = "[종일]";
      }
      return {
        time: timeString,
        title: event.summary,
      };
    });
  } catch (e) {
    console.error("캘린더 이벤트 가져오기 실패: " + e.message);
    return [{ time: "[에러]", title: `캘린더 오류: ${e.message}` }];
  }
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

/**
 * Generate weekly summary data from multiple lists.
 */
function generateWeeklySummaryData_(weekOffset) {
  // Split list names by comma and trim whitespace
  const targetListNames = TASK_LIST_NAME.split(",").map((name) => name.trim());

  const monday = new Date(getMondayDateString_(weekOffset));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStartKst = Utilities.formatDate(monday, "Asia/Seoul", "yyyy-MM-dd");
  const weekEndKst = Utilities.formatDate(sunday, "Asia/Seoul", "yyyy-MM-dd");

  const completedTasks = [];
  const todoTasks = [];

  // Iterate through each list name
  targetListNames.forEach((listName) => {
    const taskListId = findTaskListIdByName_(listName);
    if (!taskListId) {
      console.warn(`Task list not found: ${listName}`);
      return;
    }

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
              completedTasks.push({ title: task.title, date: completedKst, notes: task.notes || null });
          }
          if (task.status !== "completed") {
            const updatedKst = Utilities.formatDate(new Date(task.updated), "Asia/Seoul", "yyyy-MM-dd");
            if (updatedKst >= weekStartKst && updatedKst <= weekEndKst)
              todoTasks.push({ title: task.title, date: updatedKst, notes: task.notes || null });
          }
        });
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
  });

  completedTasks.sort((a, b) => a.date.localeCompare(b.date));
  todoTasks.sort((a, b) => a.date.localeCompare(b.date));

  // Helper function to format weekly task with notes
  const formatWeeklyTask = (t, checkbox, dateLabel) => {
    let line = `${checkbox} ${t.title} (${dateLabel}: ${t.date})`;
    if (t.notes) {
      // Limit to first 5 lines OR 300 characters (whichever comes first)
      const maxChars = 300;
      const maxLines = 5;
      const lines = t.notes.split("\n");
      const limitedLines = [];
      let totalLength = 0;
      let hasMore = false;

      for (let i = 0; i < lines.length && i < maxLines; i++) {
        const currentLine = lines[i];

        if (totalLength + currentLine.length > maxChars) {
          // Add partial line up to 300 characters
          const remainingChars = maxChars - totalLength;
          if (remainingChars > 0) {
            limitedLines.push(currentLine.substring(0, remainingChars));
          }
          hasMore = true;
          break;
        }

        limitedLines.push(currentLine);
        totalLength += currentLine.length;
      }

      if (lines.length > limitedLines.length || totalLength >= maxChars) {
        hasMore = true;
      }

      // Format as indented code block
      line += `\n    \`\`\`\n`;
      line += limitedLines.map((noteLine) => `    ${noteLine}`).join("\n");
      if (hasMore) {
        line += `\n    ...`;
      }
      line += `\n    \`\`\``;
    }
    return line;
  };

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
        ? completedTasks.map((t) => formatWeeklyTask(t, "- [x]", "Done")).join("\n")
        : `(No completed tasks)`,
    todoTasks:
      todoTasks.length > 0
        ? todoTasks.map((t) => formatWeeklyTask(t, "- [ ]", "Updated")).join("\n")
        : `(No active tasks)`,
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
