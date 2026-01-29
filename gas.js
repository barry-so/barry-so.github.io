function doGet(e) {
    const ss = SpreadsheetApp.getActive();
    const params = e.parameter;
  
    if (params.action === "listTests") {
      return output(
        ss.getSheets().map(s => s.getName())
      );
    }
  
    const test = params.test;
    if (!test) return output({ error: "Missing 'test' parameter" });
  
    const sheet = ss.getSheetByName(test);
    if (!sheet) return output({ error: `Invalid test name '${test}'` });
  
    const station = params.station || "1";
    const rows = sheet.getDataRange().getValues().slice(1);
  
    const questions = rows
      .filter(r => r[0].toString() === station)
      .map(r => ({
        question: r[1],
        options: r[2] ? r[2].split(";") : []
      }));
  
    return output(questions);
  }
  
  function doPost(e) {
    const ss = SpreadsheetApp.getActive();
    const params = e.parameter;
  
    const test = params.test;
    if (!test) return output({ error: "Missing 'test' parameter" });
  
    const sheet = ss.getSheetByName(test);
    if (!sheet) return output({ error: `Invalid test name '${test}'` });
  
    const name = params.name || "Unknown";
    const email = params.email || "Unknown";
    const isFinal = params.final === "true";
    const oobTime = parseInt(params.oobTime || "0", 10);
  
    // determine max questions dynamically
    const data = sheet.getDataRange().getValues().slice(1).filter(r => r[0].toString() === (params.station || "1"));
    const maxQuestions = data.length;
  
    // collect answers, mark skipped
    const answers = [];
    for (let i = 1; i <= maxQuestions; i++) {
      if (params["q" + i] !== undefined && params["q" + i] !== "") {
        answers.push(params["q" + i]);
      } else {
        answers.push(""); // skipped
      }
    }
  
    // cache handling
    const cache = CacheService.getUserCache();
    const cacheKey = `${email}_${test}`;
    const previous = cache.get(cacheKey);
    const accumulated = previous ? JSON.parse(previous) : [];
  
    for (let i = 0; i < answers.length; i++) {
      accumulated[i] = answers[i];
    }
  
    cache.put(cacheKey, JSON.stringify(accumulated), 21600);
    if (!isFinal) return output({ status: "saved" });
  
    // grading
    const station = params.station || "1";
    const stationData = data;
  
    let score = 0;
    const colors = []; // to store cell colors for each answer
  
    for (let i = 0; i < stationData.length; i++) {
      const correct = stationData[i][3];
      const student = accumulated[i];
  
      if (!student) {
        colors.push("#FFFF00"); // yellow for skipped
        continue;
      }
  
      if (correct && student.toString().trim().toLowerCase() === correct.toString().trim().toLowerCase()) {
        score++;
        colors.push("#00FF00"); // green for correct
      } else {
        colors.push("#FF0000"); // red for incorrect
      }
    }
  
    const timeFormatted =
      String(Math.floor(oobTime / 60)).padStart(2, "0") +
      ":" +
      String(oobTime % 60).padStart(2, "0");
  
    // append row
    const row = ["", "", "", "", new Date(), name, email, ...accumulated, score, timeFormatted];
    const rowIndex = sheet.appendRow(row).getRowIndex();
  
    // apply colors to answer cells (offset: 7 = answers start at column H)
    for (let i = 0; i < colors.length; i++) {
      sheet.getRange(rowIndex, 8 + i).setBackground(colors[i]);
    }
  
    cache.remove(cacheKey);
    return output({ score });
  }
  
  /**
   * Helper to return JSON from doGet / doPost.
   * This fixes "ReferenceError: output is not defined" in Apps Script.
   */
  function output(data) {
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  