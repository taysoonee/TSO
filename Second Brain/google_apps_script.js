// Google Apps Script Version: v1.3.0 (TSO Second Brain Secure Google Drive Router)
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
    var responseText = callGemini(apiKey, userPrompt, history, context);
    
    // Log conversation to Google Drive
    logChatToDrive(folder, userPrompt, responseText);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      response: responseText
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getFolderByName(name) {
  // Method 1: Try root level path search (e.g. My Drive/Tay)
  var rootFolder = getFolderByPath(name);
  if (rootFolder) return rootFolder;
  
  // Method 2: Try exact path traversal inside Second Brain
  var pathFolder = getFolderByPath("1. Tay/Obsidian/Second Brain/" + name);
  if (pathFolder) return pathFolder;
  
  // Method 3: Search for the folder name directly anywhere in Drive
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  
  // Method 4: Search for parent folder "Second Brain" first, then look for name inside it
  var parents = DriveApp.getFoldersByName("Second Brain");
  while (parents.hasNext()) {
    var parent = parents.next();
    var subs = parent.getFoldersByName(name);
    if (subs.hasNext()) {
      return subs.next();
    }
  }
  
  return null;
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
  var cachedContext = cache.get("tso_compiled_context");
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
    cache.put("tso_compiled_context", compiledContext, 600); // 10 minutes cache
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
  var json = JSON.parse(response.getContentText());
  
  if (response.getResponseCode() !== 200) {
    throw new Error(json.error ? json.error.message : "HTTP " + response.getResponseCode());
  }
  
  return json.candidates[0].content.parts[0].text;
}

function logChatToDrive(folder, userPrompt, responseText) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // 15-second timeout to prevent concurrent write corruption
  } catch (e) {
    console.error("Could not obtain lock to write log: " + e.toString());
    return;
  }

  try {
    // Write directly to the root of the resolved Second Brain folder (which maps to .TSO)
    var logFileName = "chat_history.jsonl";
    var logEntry = {
      timestamp: new Date().toISOString(),
      user: userPrompt,
      model: responseText
    };
    var logLine = JSON.stringify(logEntry) + "\n";

    var files = folder.getFilesByName(logFileName);
    var logFile;
    if (files.hasNext()) {
      logFile = files.next();
      var existingContent = logFile.getAs("text/plain").getDataAsString();
      logFile.setContent(existingContent + logLine);
    } else {
      folder.createFile(logFileName, logLine, "text/plain");
    }
  } catch (e) {
    // Fail silently to prevent chat failure if logging fails
    console.error("Failed to log chat: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}
