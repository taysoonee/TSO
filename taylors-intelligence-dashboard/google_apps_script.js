// Google Apps Script Version: v1.2.7 (Taylor's Intelligence Dashboard Self-Healing Indexer & Router)
/**
 * Google Apps Script for Taylor's Intelligence Dashboard:
 * 1. Rapid metadata load (returns only sheet names, avoiding massive downloads on startup)
 * 2. Self-Healing Indexer (automatically creates a sheet tab named "Index" with default descriptions if it doesn't exist)
 * 3. Token-Safe Dynamic RAG Router (reads descriptions from "Index" to load ONLY relevant sheets, and filters/caps sheet rows to prevent token limits)
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
 * Returns only the sheet names in the workbook (excluding admin sheets)
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
      if (name !== "Chat Logs" && name !== "Index") {
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
 * Dynamically reads the sheet descriptions from the "Index" tab.
 * Automatically creates and populates the tab with default descriptions if missing.
 */
function getSheetDescriptions(ss) {
  var indexSheet = ss.getSheetByName("Index");
  var descriptions = {};
  
  var defaults = {
    "Fees": "Contains tuition/school fees, AND academic exam results (IB average score, IB student counts for 45/44/>=40/pass, A-Level A*/A/B/C/pass counts, IGCSE A*/A/B/C/pass counts, and HSC Bands 1-6) for Malaysian schools.",
    "SG Fees": "Contains tuition/school fees, AND academic exam results (IB average score, IB student counts for 45/44/>=40/pass, A-Level A*/A/B/C/pass counts, IGCSE A*/A/B/C/pass counts, and HSC Bands 1-6) for Singaporean schools.",
    "Enrolment": "Contains student enrolment numbers, school capacity, class capacities, intake stats, and historical headcount figures.",
    "Academic Results": "Contains historical examination results, including IGCSE pass rates, A-Level grades, IBDP scores, and student academic performance records."
  };
  
  if (!indexSheet) {
    try {
      indexSheet = ss.insertSheet("Index");
      indexSheet.appendRow(["Sheet Name", "Description"]);
      for (var sheetName in defaults) {
        indexSheet.appendRow([sheetName, defaults[sheetName]]);
      }
    } catch (e) {
      Logger.log("Could not create Index sheet: " + e.toString());
    }
    return defaults;
  }
  
  try {
    var values = indexSheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var sName = values[i][0] ? values[i][0].toString().trim() : "";
      var sDesc = values[i][1] ? values[i][1].toString().trim() : "";
      if (sName !== "") {
        descriptions[sName] = sDesc;
      }
    }
  } catch (readErr) {
    Logger.log("Failed reading Index sheet: " + readErr.toString());
  }
  
  // Merge missing defaults
  for (var key in defaults) {
    if (!descriptions[key]) {
      descriptions[key] = defaults[key];
    }
  }
  
  return descriptions;
}

/**
 * Intelligent Dynamic Routing Chat Handler using sheet-based metadata index
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
    
    // Load descriptions dynamically from "Index" tab
    var sheetDescriptions = getSheetDescriptions(ss);
    
    var sheets = ss.getSheets();
    var allSheetNames = [];
    sheets.forEach(function(s) {
      var name = s.getName();
      if (name !== "Chat Logs" && name !== "Index") allSheetNames.push(name);
    });
    
    var sheetsInfo = allSheetNames.map(function(name) {
      var sheet = ss.getSheetByName(name);
      var headersSnippet = "";
      if (sheet) {
        var lastCol = sheet.getLastColumn();
        if (lastCol > 0) {
          var headerValues = sheet.getRange(1, 1, 1, Math.min(lastCol, 100)).getValues();
          if (headerValues && headerValues[0]) {
            var columns = headerValues[0].filter(function(h) { 
              return h !== null && h !== "" && h !== undefined; 
            }).map(function(h) { return h.toString().trim(); });
            if (columns.length > 0) {
              headersSnippet = " (Columns: " + columns.slice(0, 30).join(", ") + ")";
            }
          }
        }
      }
      var baseDesc = sheetDescriptions[name] || "General data sheet.";
      return {
        name: name,
        description: baseDesc + headersSnippet
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
    
    if (routerText.error) {
      throw new Error("Gemini Router API Error: " + routerText.error.message);
    }
    
    try {
      var rawJson = routerText.candidates[0].content.parts[0].text;
      selectedSheets = JSON.parse(rawJson);
    } catch (routeErr) {
      selectedSheets = allSheetNames;
    }
    
    // Step 2: Load data ONLY from the selected sheets with strict row and property limits to prevent token caps
    var loadedData = {};
    
    // Academic detection keywords and regex (safe matching for words and literal 'a*')
    var academicQueryRegex = /\b(igcse|a-level|ib|exam|results|hsc)\b|a\*/i;
    var isAcademicQuery = academicQueryRegex.test(prompt || "");
    var academicHeaderKeywords = ['igcse', 'a-level', 'a*', 'ib', 'hsc', 'pass', 'average', 'score'];

    selectedSheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        var range = sheet.getDataRange();
        var values = range.getValues();
        if (values.length > 0) {
          var headers = values[0].map(function(h) { return h.toString().trim(); });
          
          // Map academic header indices
          var academicColIndices = [];
          headers.forEach(function(header, idx) {
            var normalizedHeader = header.toLowerCase().replace(/[\s-_]/g, '');
            var isAcademic = academicHeaderKeywords.some(function(keyword) {
              var normalizedKeyword = keyword.replace(/[\s-_]/g, '');
              return normalizedHeader.indexOf(normalizedKeyword) !== -1;
            });
            if (isAcademic && idx < 100) {
              academicColIndices.push(idx);
            }
          });

          // Pre-filter: only keep rows that have at least one non-empty/non-false value (excluding headers)
          var activeRows = [];
          for (var i = 1; i < values.length; i++) {
            var row = values[i];
            var hasAnyVal = false;
            for (var c = 0; c < Math.min(row.length, 100); c++) {
              var cellVal = row[c];
              if (cellVal !== null && cellVal !== "" && cellVal !== undefined && cellVal !== false) {
                if (typeof cellVal === 'string' && cellVal.trim() === '') {
                  continue; // Skip whitespace-only cells
                }
                hasAnyVal = true;
                break;
              }
            }
            if (hasAnyVal) {
              activeRows.push(row);
            }
          }

          var processedRows = [];
          var maxRows = 2000;
          // Take the last 2000 active rows (latest data)
          var startIdx = Math.max(0, activeRows.length - maxRows);
          var rowsToProcess = activeRows.slice(startIdx);

          rowsToProcess.forEach(function(row) {
            var rowObj = {};
            var hasValue = false;
            var hasAcademicValue = false;
            
            headers.forEach(function(header, colIdx) {
              if (header !== "" && colIdx < 100) {
                var val = row[colIdx];
                if (val instanceof Date) {
                  val = val.toISOString().split('T')[0];
                }
                if (val !== null && val !== "" && val !== undefined) {
                  rowObj[header] = val;
                  hasValue = true;
                  if (academicColIndices.indexOf(colIdx) !== -1) {
                    hasAcademicValue = true;
                  }
                }
              }
            });
            
            if (hasValue) {
              if (isAcademicQuery && academicColIndices.length > 0 && !hasAcademicValue) {
                return; 
              }
              processedRows.push(rowObj);
            }
          });
          
          loadedData[sheetName] = processedRows;
        }
      }
    });
    
    // Step 3: Run final query with Gemini
    var systemPrompt = "You are \"Taylor's Schools Intelligence Bot\", a professional data analyst assistant.\n" +
                        "Answer user queries strictly grounded in the provided JSON dataset.\n\n" +
                        "DATA CONTEXT (Filtered/Loaded Sheets: " + JSON.stringify(Object.keys(loadedData)) + "):\n" +
                        JSON.stringify(loadedData) + "\n\n" +
                        "INSTRUCTIONS:\n" +
                        "1. Ground answers strictly in the provided JSON dataset. Do NOT make up any information.\n" +
                        "2. Output ONLY clean, professional, user-facing answers with clear categories, bullet points, and tables. Start directly with the answer.\n" +
                        "3. CRITICAL: Do NOT write any internal monologues, debugging steps, raw search lists, calculations, or 'thinking out loud' text (such as 'wait, let me look at this' or 'why is X repeated'). Present only the final computed and structured result.\n" +
                        "4. Be concise and professional. If the data is missing from the selected sheets, indicate which sheets were searched (" + JSON.stringify(Object.keys(loadedData)) + ") and ask the user to clarify.";
                        
    var contents = history.map(function(h) {
      return { role: h.role, parts: [{ text: h.content }] };
    });
    contents.push({ role: "user", parts: [{ text: prompt }] });
    
    var finalPayload = {
      contents: contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192 }
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
    
    if (result.error) {
      throw new Error("Gemini Final API Error: " + result.error.message);
    }
    
    if (!result.candidates || result.candidates.length === 0) {
      throw new Error("Gemini Final API returned no response candidates. API Response: " + resultText);
    }
    
    var botText = result.candidates[0].content.parts[0].text;
    
    // Step 4: Log conversation
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
