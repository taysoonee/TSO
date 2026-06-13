// Google Apps Script Version: v1.5.0 (TSO Second Brain Secure Google Drive Router)
/**
 * Google Apps Script for TSO Second Brain:
 * 1. Securely searches and reads live markdown/text files from your private Google Drive (.TSO folder).
 * 2. Caches compiled context to avoid hitting Google Drive API rate limits and keep response times fast.
 * 3. Token-safe interaction with the Gemini API using your private API key.
 *
 * Deployment Instructions:
 * 1. Open Google Drive, create a new Apps Script project.
 * 2. Paste this code, save, and click "Deploy" -> "New deployment".
 * 3. Choose "Web app", set Execute as "Me", and Who has access to "Anyone".
 * 4. Configure script property "GEMINI_API_KEY" to contain your private key in settings.
 */

function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    if (data.action === "chat") {
      return handleChatbotRequest(data);
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

function handleChatbotRequest(data) {
  try {
    var apiKey = data.api_key || PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    var folderName = data.folder_name || ".TSO";
    var userPrompt = data.prompt;
    var history = data.history || [];
    
    if (!apiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Gemini API key is missing. Please save it in Script Properties (GEMINI_API_KEY) in your Apps Script Project Settings."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find the folder
    var folder = getFolderByName(folderName);
    if (!folder) {
      var debugMsg = "Google Drive folder '" + folderName + "' not found. ";
      try {
        var parentFolder = getFolderByPath("1. Tay/Obsidian/Second Brain");
        if (parentFolder) {
          debugMsg += "Found parent 'Second Brain'. Folders inside it: ";
          var subFolders = parentFolder.getFolders();
          var names = [];
          while (subFolders.hasNext()) {
            names.push("'" + subFolders.next().getName() + "'");
          }
          debugMsg += names.length > 0 ? names.join(", ") : "(empty)";
        } else {
          debugMsg += "Could not even resolve parent path '1. Tay/Obsidian/Second Brain'. Check your Google Drive structure.";
        }
      } catch (e) {
        debugMsg += "Error during search: " + e.toString();
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: debugMsg
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Load and compile the Second Brain files (wiki and Reports)
    var context = getSecondBrainContext(folder);
    
    // Call Gemini API
    var geminiResult = callGemini(apiKey, userPrompt, history, context);
    var responseText = geminiResult.text;
    
    // Log conversation to Google Sheet
    var logWarning = "";
    try {
      logChatToSpreadsheet(userPrompt, responseText, geminiResult.promptTokens, geminiResult.candidatesTokens);
    } catch (logErr) {
      logWarning = "\n\n⚠️ **Chat Logging Warning**: " + logErr.toString() + " (Please verify your Google Sheet authorization and access permissions).";
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      response: responseText + logWarning
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getFolderByName(name) {
  var firstResolved = null;
  
  // Helper to validate if the folder contains Second Brain content
  function isValidFolder(folder) {
    if (!folder) return false;
    try {
      // Check for compiled_context.txt
      if (folder.getFilesByName("compiled_context.txt").hasNext()) {
        return true;
      }
      // Check for subfolder named "wiki"
      if (folder.getFoldersByName("wiki").hasNext()) {
        return true;
      }
    } catch (e) {
      // Fail-safe to ignore folders with restricted permissions
      console.warn("Permission check failed for folder: " + folder.getName(), e.toString());
    }
    return false;
  }
  
  // Method 1: Try root level path search (e.g. My Drive/Tay)
  var rootFolder = getFolderByPath(name);
  if (rootFolder) {
    if (!firstResolved) firstResolved = rootFolder;
    if (isValidFolder(rootFolder)) return rootFolder;
  }
  
  // Method 2: Try exact path traversal inside Second Brain
  var pathFolder = getFolderByPath("1. Tay/Obsidian/Second Brain/" + name);
  if (pathFolder) {
    if (!firstResolved) firstResolved = pathFolder;
    if (isValidFolder(pathFolder)) return pathFolder;
  }
  
  // Method 3: Search for the folder name directly anywhere in Drive
  var folders = DriveApp.getFoldersByName(name);
  while (folders.hasNext()) {
    var folder = folders.next();
    if (!firstResolved) firstResolved = folder;
    if (isValidFolder(folder)) return folder;
  }
  
  // Method 4: Search for parent folder "Second Brain" first, then look for name inside it
  var parents = DriveApp.getFoldersByName("Second Brain");
  while (parents.hasNext()) {
    var parent = parents.next();
    var subs = parent.getFoldersByName(name);
    while (subs.hasNext()) {
      var sub = subs.next();
      if (!firstResolved) firstResolved = sub;
      if (isValidFolder(sub)) return sub;
    }
  }
  
  // Fallback to the first resolved folder (maintains backwards compatibility)
  return firstResolved;
}

function getFolderByPath(path) {
  try {
    var parts = path.split("/");
    var folder = DriveApp.getRootFolder();
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var subfolders = folder.getFoldersByName(part);
      if (subfolders.hasNext()) {
        folder = subfolders.next();
      } else {
        return null;
      }
    }
    return folder;
  } catch (e) {
    return null;
  }
}

function getSecondBrainContext(parentFolder) {
  var cache = CacheService.getUserCache();
  var cachedContext = cache.get("tso_compiled_context_" + parentFolder.getId());
  if (cachedContext) {
    return cachedContext;
  }
  
  var compiledContext = "";
  
  // 1. Try reading the compiled context file first (highly optimized)
  var files = parentFolder.getFilesByName("compiled_context.txt");
  if (files.hasNext()) {
    var compiledFile = files.next();
    compiledContext = compiledFile.getAs("text/plain").getDataAsString();
  } else {
    // 2. Fallback: Parse file-by-file recursively if compiled_context.txt is missing
    var contextParts = [];
    var subFolders = parentFolder.getFolders();
    while (subFolders.hasNext()) {
      var subFolder = subFolders.next();
      var name = subFolder.getName();
      
      if (name === "wiki" || name === "Reports") {
        processFolderFiles(subFolder, name, contextParts);
      }
    }
    compiledContext = contextParts.join("\n\n");
  }
  
  if (compiledContext && compiledContext.length < 100000) {
    cache.put("tso_compiled_context_" + parentFolder.getId(), compiledContext, 600); // 10 minutes cache
  }
  
  return compiledContext;
}

function processFolderFiles(folder, folderPath, contextParts) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    
    // Only ingest markdown and text files
    if (fileName.endsWith(".md") || fileName.endsWith(".txt")) {
      var content = file.getAs("text/plain").getDataAsString();
      
      // Clean YAML frontmatter
      content = content.replace(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]+/, "");
      
      contextParts.push("# File: " + folderPath + "/" + fileName + "\n" + content.trim());
    }
  }
  
  // Also process nested directories
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    var sub = subfolders.next();
    processFolderFiles(sub, folderPath + "/" + sub.getName(), contextParts);
  }
}

function callGemini(apiKey, prompt, history, context) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + apiKey;
  
  var systemInstruction = "You are the Taylor's Schools Chief of Staff AI Assistant.\n" +
                          "Your task is to answer questions by grounding your response strictly in the provided Taylor's Schools K-12 Market Intelligence Second Brain files (wiki notes, reports, and indices).\n" +
                          "Use clean, professional UK English in your output.\n\n" +
                          "SECOND BRAIN REFERENCE CONTEXT:\n" + context + "\n\n" +
                          "INSTRUCTIONS:\n" +
                          "1. Rely ONLY on the reference context above. If information is not in the context, state that clearly.\n" +
                          "2. Output clean, formatted markdown, tables, and lists. Do NOT output internal monologues, thoughts, or debug comments.";
  
  var contents = [];
  
  // Add conversation history
  for (var i = 0; i < history.length; i++) {
    var role = history[i].role === "model" ? "model" : "user";
    contents.push({
      role: role,
      parts: [{ text: history[i].content }]
    });
  }
  
  // Add current prompt
  contents.push({
    role: "user",
    parts: [{ text: prompt }]
  });
  
  var payload = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.2,
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
  var json = JSON.parse(response.getContentText());
  
  if (response.getResponseCode() !== 200) {
    throw new Error(json.error ? json.error.message : "HTTP " + response.getResponseCode());
  }
  
  var text = json.candidates[0].content.parts[0].text;
  var promptTokens = json.usageMetadata ? json.usageMetadata.promptTokenCount : 0;
  var candidatesTokens = json.usageMetadata ? json.usageMetadata.candidatesTokenCount : 0;
  
  return {
    text: text,
    promptTokens: promptTokens,
    candidatesTokens: candidatesTokens
  };
}

function logChatToSpreadsheet(userPrompt, responseText, promptTokens, candidatesTokens) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // 15-second timeout to prevent concurrent write corruption
  } catch (e) {
    throw new Error("Could not obtain LockService lock to write log: " + e.toString());
  }

  try {
    var sheetId = "1Pge1hWSyIii7IAUim4U_s4wMHywHZR3RdCicnQ_xXZ0";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheets()[0]; // Append to the first sheet tab
    
    var timestamp = new Date().toISOString();
    
    // Cost calculation (Gemini 3.5 Flash: $0.075/1M input tokens, $0.30/1M output tokens)
    var inputCost = (promptTokens || 0) * 0.000000075;
    var outputCost = (candidatesTokens || 0) * 0.0000003;
    var totalCost = inputCost + outputCost;
    
    sheet.appendRow([timestamp, userPrompt, responseText, promptTokens || 0, candidatesTokens || 0, totalCost]);
  } catch (e) {
    throw new Error("Failed to write to Google Sheet: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function auth() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
}
