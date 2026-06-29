console.log("App initialized - v1.3.0 (CORS Fix & Responsive Tabbed UI)");
// State management
let surveyData = null;

let currentApiKey = localStorage.getItem('g_api_key');
if (currentApiKey === null || currentApiKey === '') {
  currentApiKey = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_API_KEY : '');
}

let currentEmbedUrl = localStorage.getItem('g_embed_url');
if (currentEmbedUrl === null || currentEmbedUrl === '') {
  currentEmbedUrl = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_EMBED_URL : '');
}

let currentProxyUrl = localStorage.getItem('g_proxy_url');
if (currentProxyUrl === null || currentProxyUrl === '') {
  currentProxyUrl = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_PROXY_URL : '');
}

let currentPasskey = localStorage.getItem('g_proxy_passkey');
if (currentPasskey === null) {
  currentPasskey = '';
}

let chatHistory = [];

// DOM elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const quickQueries = document.getElementById('quick-queries');
const clearChatBtn = document.getElementById('clear-chat-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingApiKey = document.getElementById('setting-api-key');
const settingProxyUrl = document.getElementById('setting-proxy-url');
const settingProxyPasskey = document.getElementById('setting-proxy-passkey');
const settingEmbedUrl = document.getElementById('setting-embed-url');
const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
const dashboardIframe = document.getElementById('dashboard-iframe');
const dashboardSetupPrompt = document.getElementById('dashboard-setup-prompt');
const setupEmbedBtn = document.getElementById('setup-embed-btn');
const dbStatusDot = document.getElementById('db-status-dot');
const dbStatusText = document.getElementById('db-status-text');

// Recommended Quick Action Queries
const SUGGESTED_QUERIES = [
  "What are the top 3 reasons parents choose AISM?",
  "How has the overall NPS score trended from 2021 to 2026?",
  "What is the most common feedback from Detractors in 2026?",
  "Which communication channels do parents find most useful?"
];

// Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  // Render initial icons
  lucide.createIcons();
  
  // Set initial settings inputs
  settingApiKey.value = currentApiKey;
  settingProxyUrl.value = currentProxyUrl;
  settingProxyPasskey.value = currentPasskey;
  settingEmbedUrl.value = currentEmbedUrl;
  
  // Setup Dashboard
  initDashboard();
  
  // Load local data
  await loadSurveyData();
  
  // Render welcome message
  renderWelcomeMessage();
  
  // Render suggested queries
  renderSuggestedQueries();
  
  // Auto-resize input textarea
  chatInput.addEventListener('input', autoResizeTextarea);
  
  // Input Key Press Event
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Event Listeners
  sendBtn.addEventListener('click', handleSendMessage);
  clearChatBtn.addEventListener('click', clearChat);
  
  // Modal toggle listeners
  openSettingsBtn.addEventListener('click', () => toggleModal(true));
  closeSettingsBtn.addEventListener('click', () => toggleModal(false));
  cancelSettingsBtn.addEventListener('click', () => toggleModal(false));
  saveSettingsBtn.addEventListener('click', saveSettings);
  setupEmbedBtn.addEventListener('click', () => toggleModal(true));
  
  // Toggle show/hide API key
  toggleKeyVisibility.addEventListener('click', () => {
    const isPass = settingApiKey.type === 'password';
    settingApiKey.type = isPass ? 'text' : 'password';
    const iconName = isPass ? 'eye-off' : 'eye';
    toggleKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  });

  // Mobile Tab Navigation Switcher
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  const panels = {
    'left-panel': document.getElementById('left-panel'),
    'right-panel': document.getElementById('right-panel')
  };

  // Initially hide the right panel on mobile by default
  if (panels['right-panel']) {
    panels['right-panel'].classList.add('mobile-hidden');
  }

  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPanelId = btn.getAttribute('data-panel');
      
      // Update nav buttons active state
      mobileNavBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show target panel, hide others
      Object.keys(panels).forEach(panelId => {
        if (panels[panelId]) {
          if (panelId === targetPanelId) {
            panels[panelId].classList.remove('mobile-hidden');
          } else {
            panels[panelId].classList.add('mobile-hidden');
          }
        }
      });
    });
  });
});

// Load the compiled data.json and attempt live Google Sheet fetch
async function loadSurveyData() {
  dbStatusDot.className = 'status-dot yellow';
  dbStatusText.textContent = 'Loading dataset...';
  
  try {
    // 1. Fetch the baseline data.json (trends and fallback static survey data)
    const response = await fetch('data.json');
    if (!response.ok) {
      throw new Error(`Data fetch failed: status ${response.status}`);
    }
    surveyData = await response.json();
    
    // Set UI to static loaded initially
    let isLive = false;
    let responseCount = surveyData.raw_survey_responses ? surveyData.raw_survey_responses.length : 0;
    
    // 2. Attempt to fetch live data from the Google Sheet via proxy Web App
    dbStatusText.textContent = 'Connecting to Google Sheet via proxy...';
    try {
      if (currentProxyUrl) {
        const sheetRes = await fetch(currentProxyUrl, {
          method: 'POST',
          body: JSON.stringify({
            action: 'get_data',
            passkey: currentPasskey
          })
        });
        if (sheetRes.ok) {
          const result = await sheetRes.json();
          if (result.status === 'success' && Array.isArray(result.data)) {
            surveyData.raw_survey_responses = result.data;
            responseCount = result.data.length;
            isLive = true;
          } else {
            console.warn('Proxy data fetch error:', result.message);
          }
        }
      } else {
        console.warn('Google Apps Script proxy URL not configured.');
      }
    } catch (sheetErr) {
      console.warn('Could not load live survey data, using static fallback:', sheetErr);
    }
    
    dbStatusDot.className = 'status-dot green';
    dbStatusText.textContent = `Database Loaded (${isLive ? 'Live' : 'Static'}: ${responseCount} responses)`;
    sendBtn.disabled = !(currentApiKey || currentProxyUrl);
    chatInput.placeholder = "Ask about NPS trends, reasons for choosing AISM, or parent feedback...";
  } catch (error) {
    console.error('Error loading survey data:', error);
    dbStatusDot.className = 'status-dot red';
    dbStatusText.textContent = 'Failed to load data.json';
    chatInput.placeholder = "Database error. Please check data.json file path.";
    
    appendMessage('bot', `⚠️ **Error loading survey database:** Could not find or parse \`data.json\`. Make sure you run the data preparation script to generate it first!`);
  }
}

// Robust CSV parser supporting quotes and escaped double quotes
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"'; // Escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

// Substring matcher to map CSV headers to API keys robustly
function getFieldKey(header) {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm.includes('year') && norm.length < 6) return 'year';
  if (norm.includes('timestamp')) return 'timestamp';
  if (norm.includes('childwhoisenrolled')) return 'year_group';
  if (norm.includes('reasonswhyaismis')) return 'reasons_raw';
  if (norm.includes('receivedenoughinformation')) return 'preparedness_rating';
  if (norm.includes('whatwasmostuseful')) return 'preparedness_feedback';
  if (norm.includes('attendthenewparentorientation')) return 'orientation_attended';
  if (norm.includes('communityverywelcoming')) return 'community_welcoming_rating';
  if (norm.includes('childrenfeelsettled')) return 'settled_rating';
  if (norm.includes('likelyisitthatyouwouldrecommend')) return 'recommend_nps_score';
  if (norm.includes('whatistheonethingwecoulddo')) return 'recommendation_feedback';
  if (norm.includes('promotern')) return 'is_promoter';
  if (norm.includes('passiven')) return 'is_passive';
  if (norm.includes('detractorn')) return 'is_detractor';
  if (norm.includes('sentimentwhatistheone')) return 'sentiment';
  if (norm.includes('categorywhatistheone')) return 'category';
  return null;
}

// Convert parsed CSV rows into typed JS objects
function processLiveCSV(parsedLines) {
  const headers = parsedLines[0].map(h => h.trim());
  const records = [];
  
  for (let i = 1; i < parsedLines.length; i++) {
    const row = parsedLines[i];
    if (row.length < headers.length) continue;
    
    const rec = {};
    headers.forEach((header, colIdx) => {
      const key = getFieldKey(header);
      if (key) {
        let val = row[colIdx] ? row[colIdx].trim() : '';
        
        // Convert to numbers or boolean logic
        if (key === 'year' || key === 'recommend_nps_score' || key === 'is_promoter' || key === 'is_passive' || key === 'is_detractor') {
          const num = Number(val);
          rec[key] = (val === '' || isNaN(num)) ? null : num;
        } else {
          rec[key] = val === '' ? null : val;
        }
      }
    });
    
    if (Object.keys(rec).length > 0) {
      records.push(rec);
    }
  }
  return records;
}

// Setup Dashboard View
function initDashboard() {
  if (currentEmbedUrl && currentEmbedUrl.trim() !== '') {
    dashboardIframe.src = currentEmbedUrl;
    dashboardIframe.classList.remove('hidden');
    dashboardSetupPrompt.classList.add('hidden');
  } else {
    dashboardIframe.src = '';
    dashboardIframe.classList.add('hidden');
    dashboardSetupPrompt.classList.remove('hidden');
  }
}

// Toggle Settings Modal
function toggleModal(show) {
  if (show) {
    settingsModal.classList.remove('hidden');
    settingApiKey.value = currentApiKey;
    settingProxyUrl.value = currentProxyUrl;
    settingProxyPasskey.value = currentPasskey;
    settingEmbedUrl.value = currentEmbedUrl;
  } else {
    settingsModal.classList.add('hidden');
  }
}

// Save Settings from Modal
function saveSettings() {
  currentApiKey = settingApiKey.value.trim();
  currentProxyUrl = settingProxyUrl.value.trim();
  currentPasskey = settingProxyPasskey.value.trim();
  currentEmbedUrl = settingEmbedUrl.value.trim();
  
  localStorage.setItem('g_api_key', currentApiKey);
  localStorage.setItem('g_proxy_url', currentProxyUrl);
  localStorage.setItem('g_proxy_passkey', currentPasskey);
  localStorage.setItem('g_embed_url', currentEmbedUrl);
  
  initDashboard();
  toggleModal(false);
  
  if (surveyData) {
    sendBtn.disabled = !(currentApiKey || currentProxyUrl);
  }
  
  // Reload the live database using the new proxy credentials
  loadSurveyData();
  
  appendMessage('bot', `⚙️ **Settings updated successfully!** Dashboard reloaded and API credentials updated.`);
}

// Render Welcome Message
function renderWelcomeMessage() {
  const welcomeText = `👋 Hello! I am your **AISM Parent Insights Assistant**. 

I have access to the **New Parent Surveys (2021 - 2026)** datasets, including NPS scores, orientation satisfaction ratings, drivers for joining the school, and qualitative parent feedback.

You can ask me questions like:
- *What are the top categories of complaints from parents?*
- *How has the Net Promoter Score (NPS) changed year-over-year?*
- *Give me a summary of recommendations to improve the New Parent Orientation.*

**How can I help you analyze the school survey data today?**`;
  
  appendMessage('bot', welcomeText);
}

// Render Query Chips
function renderSuggestedQueries() {
  quickQueries.innerHTML = '';
  SUGGESTED_QUERIES.forEach(query => {
    const chip = document.createElement('button');
    chip.className = 'query-chip';
    chip.textContent = query;
    chip.addEventListener('click', () => {
      chatInput.value = query;
      autoResizeTextarea();
      handleSendMessage();
    });
    quickQueries.appendChild(chip);
  });
}

// Append Message to UI
function appendMessage(sender, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  
  const senderSpan = document.createElement('span');
  senderSpan.className = 'message-sender';
  senderSpan.textContent = sender === 'user' ? 'You' : 'Assistant';
  
  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'message-bubble';
  bubbleDiv.innerHTML = parseMarkdown(text);
  
  msgDiv.appendChild(senderSpan);
  msgDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(msgDiv);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Clear Chat Area
function clearChat() {
  chatMessages.innerHTML = '';
  chatHistory = [];
  renderWelcomeMessage();
}

// Auto Resize Input Height
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = (chatInput.scrollHeight - 8) + 'px';
}

// Handle User Message submission
async function handleSendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!currentApiKey && !currentProxyUrl) {
    appendMessage('bot', '🔒 **API Key or Proxy URL Required:** Please click the settings icon in the top right and configure either your Gemini API Key or your Google Apps Script Proxy URL to start chatting.');
    toggleModal(true);
    return;
  }
  
  // Add message to UI
  appendMessage('user', text);
  chatInput.value = '';
  autoResizeTextarea();
  
  // Add bot thinking state
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'message bot thinking-bubble';
  thinkingDiv.innerHTML = `
    <span class="message-sender">Assistant</span>
    <div class="message-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatMessages.appendChild(thinkingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const response = await callGeminiAPI(text);
    
    // Remove thinking state
    thinkingDiv.remove();
    
    // Add bot response
    appendMessage('bot', response);
    
    // Save to history
    chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'model', content: response });
  } catch (error) {
    thinkingDiv.remove();
    console.error('Gemini API Error:', error);
    appendMessage('bot', `❌ **API Connection Error:** ${error.message}. Please verify your API Key in settings or check your network connection.`);
  }
}

// Send Request to Gemini API
async function callGeminiAPI(promptText) {
  // Build data payload overview
  const systemPrompt = `You are "AISM Parent Insights Bot", an AI narrative economist and survey analyst for Australian International School Malaysia (AISM).
You must answer queries about new parent surveys (years 2021 to 2026).
All answers must be strictly accurate, factual, and backed by calculations or comments from the provided dataset.

DATA CONTEXT:
${JSON.stringify(surveyData)}

INSTRUCTIONS:
1. Ground answers strictly in the provided JSON dataset. If the database does not contain facts, state that you don't know.
2. For quantitative metrics like NPS or orientation ratings, refer to "question_trends" or compute averages from "raw_survey_responses".
   - Note: promoter_pct, passive_pct, and detractor_pct in trends represent percentages (e.g., 0.42 = 42%).
   - Promoter score counts (is_promoter=1) minus Detractor score counts (is_detractor=1) divided by total non-null counts equals NPS.
3. For qualitative answers, synthesize key themes from "recommendation_feedback" (recommender comments) or "preparedness_feedback" (orientation comments) in the "raw_survey_responses" list. Group by categories and sentiments. Quote short example comments when helpful.
4. Format all responses cleanly using bullet points, bold tags, and markdown tables.
5. Be concise and write for a school administrator dashboard audience.`;

  // Format request body using Gemini API guidelines
  const historyContents = chatHistory.map(h => ({
    role: h.role,
    parts: [{ text: h.content }]
  }));
  
  historyContents.push({
    role: 'user',
    parts: [{ text: promptText }]
  });

  const requestBody = {
    contents: historyContents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 8192
    }
  };

  if (currentProxyUrl) {
    const proxyBody = {
      action: 'chat',
      prompt: promptText,
      history: chatHistory.map(h => ({ role: h.role, content: h.parts?.[0]?.text || h.content })),
      systemPrompt: systemPrompt,
      passkey: currentPasskey
    };

    const response = await fetch(currentProxyUrl, {
      method: 'POST',
      body: JSON.stringify(proxyBody)
    });

    if (!response.ok) {
      throw new Error(`Proxy error: HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    return result.response;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const result = await response.json();
  const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('Empty response from model');
  }
  
  return textResponse;
}

// Simple Markdown Parser for Frontend rendering
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = '';
  const lines = text.split('\n');
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Handle Tables
    if (line.startsWith('|')) {
      if (inList) {
        html += `</${listType}>`;
        inList = false;
        listType = null;
      }
      
      const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (line.includes('---')) {
        continue; // delimiter row
      }
      
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      html += renderTable(tableHeaders, tableRows);
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    // Headers
    if (line.startsWith('###')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h3>${formatInline(line.substring(3).trim())}</h3>`;
      continue;
    }
    if (line.startsWith('##')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h2>${formatInline(line.substring(2).trim())}</h2>`;
      continue;
    }
    if (line.startsWith('#')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h1>${formatInline(line.substring(1).trim())}</h1>`;
      continue;
    }

    // Unordered lists
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList || listType !== 'ul') {
        if (inList) { html += `</${listType}>`; }
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${formatInline(line.substring(2).trim())}</li>`;
      continue;
    }

    // Ordered lists
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      const itemNum = parseInt(numMatch[1], 10);
      if (!inList || listType !== 'ol') {
        if (inList) { html += `</${listType}>`; }
        html += `<ol start="${itemNum}">`;
        inList = true;
        listType = 'ol';
      }
      html += `<li value="${itemNum}">${formatInline(numMatch[2].trim())}</li>`;
      continue;
    }

    // Empty lines
    if (line === '') {
      if (inList) {
        html += `</${listType}>`;
        inList = false;
        listType = null;
      }
      continue;
    }

    // Regular text paragraph
    if (inList) {
      html += `</${listType}>`;
      inList = false;
      listType = null;
    }
    html += `<p>${formatInline(line)}</p>`;
  }

  // Close open blocks
  if (inList) {
    html += `</${listType}>`;
  }
  if (inTable) {
    html += renderTable(tableHeaders, tableRows);
  }

  return html;
}

function renderTable(headers, rows) {
  const th = headers.map(h => `<th>${formatInline(h)}</th>`).join('');
  const tr = rows.map(row => {
    const td = row.map(r => `<td>${formatInline(r)}</td>`).join('');
    return `<tr>${td}</tr>`;
  }).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function formatInline(text) {
  // Bold **
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code `
  text = text.replace(/`(.*?)`/g, '<code>$1</code>');
  return text;
}
