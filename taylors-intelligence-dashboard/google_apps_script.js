// Google Apps Script Version: v1.0.0 (Taylor's Intelligence Dashboard Proxy & Data Loader)
/**
 * Google Apps Script for Taylor's Intelligence Dashboard to handle:
 * 1. Secure dynamic data loading (opens private spreadsheet and returns JSON database)
 * 2. Secure Chatbot proxy (attaches Gemini API key securely from Script Properties)
 *
 * Deploy instructions:
 * 1. Open https://script.google.com/home/projects/1tnaxWlcIYieTbbJNfT_IBSvwssoDsdD-J3AqnK2ZkDrq0VHDhAjmVzc5/edit
 * 2. Paste this code, saving the script.
 * 3. Go to project settings (gear icon) and add two Script Properties:
 *    - GEMINI_API_KEY: (Your Google AI Studio API key)
 *    - SPREADSHEET_ID: 1Dh4OkkSQY8rcpdjITqQqFYYwzuQtTEPpqz9LF8GAHdk
 * 4. Click Deploy -> New deployment -> Select type: Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Deploy, authorize permissions, and copy the Web App URL.
 */

function doPost(e) {
  try {
    // Parse incoming JSON data
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    // Route 1: Chatbot proxy request
    if (data.action === "chat") {
      return handleChatbotRequest(data);
    }
    
    // Route 2: Live data loader (opens private spreadsheet by ID and outputs JSON)
    if (data.action === "load_data") {
      return handleLoadData(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Invalid action. Supported actions: 'load_data', 'chat'."
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Reads worksheets from the private spreadsheet and returns a structured JSON
 */
function handleLoadData(data) {
  try {
    var spreadsheetId = data.spreadsheet_id || PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Spreadsheet ID is missing in request and Script Properties."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var payload = {};
    
    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      // Skip chat log sheet to avoid inflating database context size
      if (name === "Chat Logs") return;
      
      var range = sheet.getDataRange();
      var values = range.getValues();
      if (values.length > 0) {
        // Clean header keys
        var headers = values[0].map(function(h) {
          return h.toString().trim();
        });
        
        var rows = [];
        for (var i = 1; i < values.length; i++) {
          var row = values[i];
          var rowObj = {};
          var hasValue = false;
          
          headers.forEach(function(header, colIdx) {
            if (header !== "") {
              var val = row[colIdx];
              // Format Date objects to ISO date strings
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              }
              rowObj[header] = val;
              if (val !== null && val !== "") {
                hasValue = true;
              }
            }
          });
          
          if (hasValue) {
            rows.push(rowObj);
          }
        }
        payload[name] = rows;
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: payload
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Secure Chatbot request handler
 */
function handleChatbotRequest(data) {
  try {
    var prompt = data.prompt;
    var history = data.history || [];
    var systemPrompt = data.systemPrompt || "";
    
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    if (!apiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "API Key not configured in Script Properties."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
    
    var contents = history.map(function(h) {
      return {
        role: h.role,
        parts: [{ text: h.content }]
      };
    });
    
    contents.push({
      role: "user",
      parts: [{ text: prompt }]
    });
    
    var payload = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 2048
      }
    };
    
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    var responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Gemini API returned status " + responseCode + ": " + responseText
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var result = JSON.parse(responseText);
    var botText = result.candidates[0].content.parts[0].text;
    
    // Log the conversation to "Chat Logs" tab in the spreadsheet
    try {
      var spreadsheetId = data.spreadsheet_id || PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
      var ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : null;
      if (ss) {
        var logSheet = ss.getSheetByName("Chat Logs");
        if (!logSheet) {
          logSheet = ss.insertSheet("Chat Logs");
          logSheet.appendRow(["Timestamp", "User Query", "Bot Response", "Est. Input Tokens", "Est. Output Tokens", "Est. Cost ($)"]);
        }
        
        var estInputTokens = Math.ceil(JSON.stringify(payload).length / 4);
        var estOutputTokens = Math.ceil(botText.length / 4);
        var estCost = (estInputTokens * 0.000000075) + (estOutputTokens * 0.00000030);
        
        logSheet.appendRow([
          new Date(), 
          prompt, 
          botText, 
          estInputTokens, 
          estOutputTokens, 
          Number(estCost.toFixed(6))
        ]);
      }
    } catch (logErr) {
      Logger.log("Failed to log conversation: " + logErr.toString());
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
