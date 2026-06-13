// Google Apps Script Version: v1.1.2 (Taylor's Intelligence Dashboard Dynamic Router & Proxy)
/**
 * Google Apps Script for Taylor's Intelligence Dashboard:
 * 1. Rapid metadata load (returns only sheet names, avoiding massive downloads on startup)
 * 2. Intelligent Routing (reads user query, asks Gemini which sheets are relevant, loads ONLY those sheets, and answers the query)
 *
 * (Access raw code directly from your TSO GitHub repository)
 */

function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    if (data.action === "chat") {
      return handleChatbotRequest(data);
    }
    
    if (data.action === "load_data") {
      return handleLoadData(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Invalid action."
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Returns only the sheet names in the workbook (extremely fast load)
 */
function handleLoadData(data) {
  try {
    var spreadsheetId = data.spreadsheet_id || PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Spreadsheet ID is missing."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var sheetNames = [];
    
    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      if (name !== "Chat Logs") {
        sheetNames.push(name);
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sheetNames: sheetNames
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Intelligent Dynamic Routing Chat Handler
 */
function handleChatbotRequest(data) {
  try {
    var prompt = data.prompt;
    var history = data.history || [];
    
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    var spreadsheetId = data.spreadsheet_id || PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    
    if (!apiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "API Key not configured in Script Properties."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Spreadsheet ID not configured."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var allSheetNames = [];
    sheets.forEach(function(s) {
      if (s.getName() !== "Chat Logs") allSheetNames.push(s.getName());
    });
    
    // Metadata dictionary defining the contents of key tabs to help the router make perfect decisions
    var sheetDescriptions = {
      "Fees": "Contains tuition/school fees, AND academic exam results (IB average score, IB student counts for 45/44/>=40/pass, A-Level A*/A/B/C/pass counts, IGCSE A*/A/B/C/pass counts, and HSC Bands 1-6) for Malaysian schools.",
      "SG Fees": "Contains tuition/school fees, AND academic exam results (IB average score, IB student counts for 45/44/>=40/pass, A-Level A*/A/B/C/pass counts, IGCSE A*/A/B/C/pass counts, and HSC Bands 1-6) for Singaporean schools.",
      "Enrolment": "Contains student enrolment numbers, school capacity, class capacities, intake stats, and historical headcount figures.",
      "Academic Results": "Contains historical examination results, including IGCSE pass rates, A-Level grades, IBDP scores, and student academic performance records."
    };
    
    var sheetsInfo = allSheetNames.map(function(name) {
      return {
        name: name,
        description: sheetDescriptions[name] || "General data sheet."
      };
    });
    
    // Step 1: Query Gemini to find out which sheets are relevant to the user query
    var routingPrompt = "You are a database router. Given a user query and a list of available sheets with their descriptions, determine which sheets are relevant to answer the query. Return ONLY a valid JSON list of strings representing the exact sheet names. Do not add any explanation or markdown formatting.\n\n" +
                        "Available Sheets with Descriptions:\n" + JSON.stringify(sheetsInfo) + "\n\n" +
                        "User Query: \"" + prompt + "\"\n\n" +
                        "Response format: [\"SheetName1\", \"SheetName2\"]";
                        
    var routerUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + apiKey;
    var routerPayload = {
      contents: [{ role: "user", parts: [{ text: routingPrompt }] }],
      generationConfig: { temperature: 0.0, responseMimeType: "application/json" }
    };
    
    var routerOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(routerPayload),
      muteHttpExceptions: true
    };
    
    var routerResponse = UrlFetchApp.fetch(routerUrl, routerOptions);
    var routerText = JSON.parse(routerResponse.getContentText());
    var selectedSheets = [];
    
    try {
      var rawJson = routerText.candidates[0].content.parts[0].text;
      selectedSheets = JSON.parse(rawJson);
    } catch (routeErr) {
      // Fallback: if router fails, load all sheets to be safe
      selectedSheets = allSheetNames;
    }
    
    // Step 2: Load data ONLY from the selected sheets
    var loadedData = {};
    selectedSheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        var range = sheet.getDataRange();
        var values = range.getValues();
        if (values.length > 0) {
          var headers = values[0].map(function(h) { return h.toString().trim(); });
          var rows = [];
          for (var i = 1; i < values.length; i++) {
            var row = values[i];
            var rowObj = {};
            var hasValue = false;
            headers.forEach(function(header, colIdx) {
              if (header !== "") {
                var val = row[colIdx];
                if (val instanceof Date) {
                  val = val.toISOString().split('T')[0];
                }
                rowObj[header] = val;
                if (val !== null && val !== "") hasValue = true;
              }
            });
            if (hasValue) rows.push(rowObj);
          }
          loadedData[sheetName] = rows;
        }
      }
    });
    
    // Step 3: Run the final analysis query with Gemini using the filtered dataset
    var systemPrompt = "You are \"Taylor's Schools Intelligence Bot\", a data analyst assistant.\n" +
                        "Answer user queries strictly grounded in the provided JSON dataset.\n\n" +
                        "DATA CONTEXT (Filtered/Loaded Sheets: " + JSON.stringify(Object.keys(loadedData)) + "):\n" +
                        JSON.stringify(loadedData) + "\n\n" +
                        "INSTRUCTIONS:\n" +
                        "1. Ground answers strictly in the provided JSON dataset.\n" +
                        "2. Formulate answers using clear categories, bullet points, and tables.\n" +
                        "3. Be concise and professional.\n" +
                        "4. If the data is missing from the selected sheets, indicate which sheets were searched (" + JSON.stringify(Object.keys(loadedData)) + ") and ask the user to clarify.";
                        
    var contents = history.map(function(h) {
      return { role: h.role, parts: [{ text: h.content }] };
    });
    contents.push({ role: "user", parts: [{ text: prompt }] });
    
    var finalPayload = {
      contents: contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.15, maxOutputTokens: 2048 }
    };
    
    var finalOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(finalPayload),
      muteHttpExceptions: true
    };
    
    var finalResponse = UrlFetchApp.fetch(routerUrl, finalOptions);
    var resultText = finalResponse.getContentText();
    var result = JSON.parse(resultText);
    var botText = result.candidates[0].content.parts[0].text;
    
    // Step 4: Log conversation to Chat Logs
    try {
      var logSheet = ss.getSheetByName("Chat Logs");
      if (!logSheet) {
        logSheet = ss.insertSheet("Chat Logs");
        logSheet.appendRow(["Timestamp", "User Query", "Sheets Loaded", "Bot Response", "Est. Input Tokens", "Est. Output Tokens", "Est. Cost ($)"]);
      }
      var estInputTokens = Math.ceil(JSON.stringify(finalPayload).length / 4);
      var estOutputTokens = Math.ceil(botText.length / 4);
      var estCost = (estInputTokens * 7.5e-8) + (estOutputTokens * 3e-7);
      
      logSheet.appendRow([
        new Date(), 
        prompt, 
        JSON.stringify(Object.keys(loadedData)),
        botText, 
        estInputTokens, 
        estOutputTokens, 
        Number(estCost.toFixed(6))
      ]);
    } catch (logErr) {
      Logger.log("Failed to log: " + logErr.toString());
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      response: botText
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}
