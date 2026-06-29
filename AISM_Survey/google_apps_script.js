// Google Apps Script Version: v1.2.0 (CORS Fix & Cost Tracking)
/**
 * Google Apps Script to handle survey form submissions and secure Chatbot requests.
 * Paste this code inside your Google Spreadsheet's Apps Script editor:
 * (Spreadsheet -> Extensions -> Apps Script)
 * 
 * Be sure to configure Script Properties:
 * 1. Open the script editor.
 * 2. Click the gear icon on the left (Project Settings).
 * 3. Under "Script Properties", click "Add script property".
 * 4. Property Name: GEMINI_API_KEY
 * 5. Value: (Paste your actual Gemini API Key here)
 * 6. Save Script Properties.
 * 
 * Be sure to deploy/re-deploy this as a Web App:
 * 1. Click "Deploy" -> "New deployment" (or "Manage deployments" -> edit to increment version).
 * 2. Select type: "Web app"
 * 3. Description: AISM Survey Backend & Chatbot Proxy
 * 4. Execute as: "Me" (your email)
 * 5. Who has access: "Anyone"
 * 6. Click "Deploy" and copy/update the Web App URL.
 */

function doPost(e) {
  try {
    // Parse incoming JSON data
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    // Verify passkey for administrative actions (chat and get_data)
    if (data.action === "chat" || data.action === "get_data") {
      var configuredPasskey = PropertiesService.getScriptProperties().getProperty("PROXY_PASSKEY");
      if (configuredPasskey && configuredPasskey.trim() !== "") {
        if (!data.passkey || data.passkey.trim() !== configuredPasskey.trim()) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "error",
            message: "Unauthorized: Invalid or missing Proxy Passkey."
          }))
          .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    // Route to chatbot proxy if action is "chat"
    if (data.action === "chat") {
      return handleChatbotRequest(data);
    }
    
    // Route to secure data fetch if action is "get_data"
    if (data.action === "get_data") {
      return handleGetDataRequest(data);
    }
    
    // Otherwise, default to existing survey form submission logic
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Prepare the headers mapping
    var headers = [
      "Timestamp",
      "This feedback is for my child who is enrolled in",
      "Could you tell us the reasons why AISM is the preferred school for your child/ren?",
      "Reasons Other",
      "Prior to starting at AISM, we received enough information...",
      "What was most useful or additional information...",
      "Did you attend the New Parent Orientation?",
      "Orient: Better prepared",
      "Orient: Campus comfort",
      "Orient: Aware of key personnel",
      "As you did not attend, how did you receive induction info?",
      "Induction Info Other",
      "First week prepared",
      "Community welcoming",
      "Timely & effective communication",
      "NPS Score",
      "What is the one thing we could do to make you recommend us?"
    ];
    
    // Generate timestamp
    var timestamp = new Date();
    
    // Format list attributes
    var reasons = Array.isArray(data.preferredReasons) ? data.preferredReasons.join(", ") : (data.preferredReasons || "");
    var induction = Array.isArray(data.inductionSources) ? data.inductionSources.join(", ") : (data.inductionSources || "");
    
    // Build row values
    var rowValues = [
      timestamp,
      data.yearGroup || "",
      reasons,
      data.preferredReasonsOtherText || "",
      data.preparationInfo || "",
      data.usefulInfoFeedback || "",
      data.attendOrientation || "",
      data.orientationBetterPrepared || "",
      data.orientationCampusComfort || "",
      data.orientationAwarePersonnel || "",
      induction,
      data.inductionSourcesOtherText || "",
      data.firstWeekPrepared || "",
      data.communityWelcoming || "",
      data.communicationTimely || "",
      data.npsScore || "",
      data.recommendationAction || ""
    ];
    
    // Append row
    sheet.appendRow(rowValues);
    
    // Return CORS-enabled success response
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Survey response recorded successfully."
    }))
    .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Chatbot request handler (proxies calls securely to Gemini API)
 */
function handleChatbotRequest(data) {
  try {
    var prompt = data.prompt;
    var history = data.history || [];
    var systemPrompt = data.systemPrompt || "";
    
    // Retrieve API key securely from Apps Script properties (not exposed to user browser)
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    if (!apiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "API Key not configured in Google Script properties. Please set GEMINI_API_KEY in script settings."
      }))
      .setMimeType(ContentService.MimeType.JSON);
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
        maxOutputTokens: 8192
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
      }))
      .setMimeType(ContentService.MimeType.JSON);
    }
    
    var result = JSON.parse(responseText);
    var botText = result.candidates[0].content.parts[0].text;
    
    // Log the conversation and estimated costs to a sheet named "Chat Logs" in the background
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var logSheet = ss.getSheetByName("Chat Logs");
      if (!logSheet) {
        logSheet = ss.insertSheet("Chat Logs");
        logSheet.appendRow(["Timestamp", "User Query", "Bot Response", "Est. Input Tokens", "Est. Output Tokens", "Est. Cost ($)"]);
      }
      
      // Calculate estimated tokens (1 token ≈ 4 characters)
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
    } catch (logErr) {
      Logger.log("Failed to log conversation: " + logErr.toString());
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      response: botText
    }))
    .setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle CORS preflight request (necessary for browser fetch POST calls)
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Run this function manually in the editor to force the Authorization popup!
 */
function authorizeScript() {
  UrlFetchApp.fetch("https://generativelanguage.googleapis.com/");
  Logger.log("Authorized successfully!");
}

/**
 * Reads data from the active Google Sheet, sanitises/maps headers, and returns it as JSON.
 */
function handleGetDataRequest(data) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        data: []
      }))
      .setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = values[0].map(function(h) { return h.toString().trim(); });
    var records = [];
    
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var rec = {};
      var hasData = false;
      
      headers.forEach(function(header, colIdx) {
        var key = getFieldKeyScript(header);
        if (key) {
          var val = row[colIdx];
          if (val instanceof Date) {
            rec[key] = val.toISOString();
          } else {
            var strVal = val !== null && val !== undefined ? val.toString().trim() : '';
            if (key === 'year' || key === 'recommend_nps_score' || key === 'is_promoter' || key === 'is_passive' || key === 'is_detractor') {
              var num = Number(strVal);
              rec[key] = (strVal === '' || isNaN(num)) ? null : num;
            } else {
              rec[key] = strVal === '' ? null : strVal;
            }
          }
          if (rec[key] !== null) {
            hasData = true;
          }
        }
      });
      
      if (hasData) {
        records.push(rec);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: records
    }))
    .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Maps spreadsheet headers to database keys (identical to frontend mapping logic)
 */
function getFieldKeyScript(header) {
  var norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm.indexOf('year') !== -1 && norm.length < 6) return 'year';
  if (norm.indexOf('timestamp') !== -1) return 'timestamp';
  if (norm.indexOf('childwhoisenrolled') !== -1) return 'year_group';
  if (norm.indexOf('reasonswhyaismis') !== -1) return 'reasons_raw';
  if (norm.indexOf('receivedenoughinformation') !== -1) return 'preparedness_rating';
  if (norm.indexOf('whatwasmostuseful') !== -1) return 'preparedness_feedback';
  if (norm.indexOf('attendthenewparentorientation') !== -1) return 'orientation_attended';
  if (norm.indexOf('communityverywelcoming') !== -1) return 'community_welcoming_rating';
  if (norm.indexOf('childrenfeelsettled') !== -1) return 'settled_rating';
  if (norm.indexOf('likelyisitthatyouwouldrecommend') !== -1) return 'recommend_nps_score';
  if (norm.indexOf('whatistheonethingwecoulddo') !== -1) return 'recommendation_feedback';
  if (norm.indexOf('promotern') !== -1) return 'is_promoter';
  if (norm.indexOf('passiven') !== -1) return 'is_passive';
  if (norm.indexOf('detractorn') !== -1) return 'is_detractor';
  if (norm.indexOf('sentimentwhatistheone') !== -1) return 'sentiment';
  if (norm.indexOf('categorywhatistheone') !== -1) return 'category';
  return null;
}
