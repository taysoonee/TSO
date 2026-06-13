// TSO Second Brain Chatbot Configuration
const CONFIG = {
  // Deployed Google Apps Script Web App URL
  DEFAULT_PROXY_URL: "https://script.google.com/macros/s/AKfycbxJId2cTI4m0WKsHMPnb_QzTd3tIq8_hJxSbciUqaKmsINyt6E1N9_pWl5c8QeMh9UOdA/exec",
  
  // LEAVE EMPTY FOR SECURITY. Save your API key in Google Apps Script Script Properties.
  DEFAULT_API_KEY: "",
  
  // Default folder name in Google Drive. 
  // Since .TSO is a symlink to your "Tay" folder in your work account, this is set to "Tay".
  DEFAULT_FOLDER_NAME: "Tay",

  // Suggested starter queries
  SUGGESTED_QUERIES: [
    "What is the latest intelligence report on Alice Smith School?",
    "Summarise competitor pricing shifts or fee structures.",
    "Show the main insights from recent reports.",
    "Tell me about the Taylor's Schools Growth Strategy."
  ]
};
