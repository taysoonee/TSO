/**
 * Google Apps Script to handle survey form submissions.
 * Paste this code inside your Google Spreadsheet's Apps Script editor:
 * (Spreadsheet -> Extensions -> Apps Script)
 * 
 * Be sure to deploy this as a Web App:
 * 1. Click "Deploy" -> "New deployment"
 * 2. Select type: "Web app"
 * 3. Description: AISM Survey Backend
 * 4. Execute as: "Me" (your email)
 * 5. Who has access: "Anyone"
 * 6. Click "Deploy" and copy the Web App URL.
 */

function doPost(e) {
  try {
    // Parse incoming JSON data
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    // Get target sheet
    // Open by active spreadsheet or specific spreadsheet ID
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Prepare the headers mapping (matching Google Form columns)
    // Adjust order to match your Google Sheet exactly:
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
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
    
  } catch (error) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
  }
}

/**
 * Handle CORS preflight request (necessary for browser fetch POST calls)
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}
