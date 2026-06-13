console.log("App initialized - Taylor's Intelligence Dashboard v1.2.0");

// State management
let dashboardData = null;
let currentHistory = [];

let currentApiKey = localStorage.getItem('g_tso_api_key');
if (currentApiKey === null || currentApiKey === '') {
  currentApiKey = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_API_KEY : '');
}

let currentEmbedUrl = localStorage.getItem('g_tso_embed_url');
if (currentEmbedUrl === null || currentEmbedUrl === '') {
  currentEmbedUrl = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_EMBED_URL : '');
}

let currentSpreadsheetId = localStorage.getItem('g_tso_spreadsheet_id');
if (currentSpreadsheetId === null || currentSpreadsheetId === '') {
  currentSpreadsheetId = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_SPREADSHEET_ID : '');
}

let currentProxyUrl = localStorage.getItem('g_tso_proxy_url');
if (currentProxyUrl === null || currentProxyUrl === '') {
  currentProxyUrl = (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_PROXY_URL : '');
}

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
const settingSpreadsheetId = document.getElementById('setting-spreadsheet-id');
const settingEmbedUrl = document.getElementById('setting-embed-url');
const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
const dashboardIframe = document.getElementById('dashboard-iframe');
const dashboardSetupPrompt = document.getElementById('dashboard-setup-prompt');
const setupEmbedBtn = document.getElementById('setup-embed-btn');
const dbStatusDot = document.getElementById('db-status-dot');
const dbStatusText = document.getElementById('db-status-text');

// Quick Action Queries
const SUGGESTED_QUERIES = [
  "Summarize the overall data in the sheets.",
  "What are the main insights or trends?",
  "List any recommendations based on the data.",
  "Are there any recurring issues or highlights?"
];

// Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  
  // Set UI inputs
  settingApiKey.value = currentApiKey;
  settingProxyUrl.value = currentProxyUrl;
  settingSpreadsheetId.value = currentSpreadsheetId;
  settingEmbedUrl.value = currentEmbedUrl;
  
  initDashboard();
  
  // Load database
  await loadDashboardData();
  
  renderWelcomeMessage();
  renderSuggestedQueries();
  
  // Listeners
  chatInput.addEventListener('input', autoResizeTextarea);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  sendBtn.addEventListener('click', handleSendMessage);
  clearChatBtn.addEventListener('click', clearChat);
  openSettingsBtn.addEventListener('click', () => toggleModal(true));
  closeSettingsBtn.addEventListener('click', () => toggleModal(false));
  cancelSettingsBtn.addEventListener('click', () => toggleModal(false));
  saveSettingsBtn.addEventListener('click', saveSettings);
  setupEmbedBtn.addEventListener('click', () => toggleModal(true));
  
  toggleKeyVisibility.addEventListener('click', () => {
    const isPass = settingApiKey.type === 'password';
    settingApiKey.type = isPass ? 'text' : 'password';
    const iconName = isPass ? 'eye-off' : 'eye';
    toggleKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  });
});

// Load survey database dynamically from Proxy (or local JSON fallback)
async function loadDashboardData() {
  dbStatusDot.className = 'status-dot yellow';
  dbStatusText.textContent = 'Connecting database...';
  
  if (!currentProxyUrl) {
    dbStatusDot.className = 'status-dot red';
    dbStatusText.textContent = 'Proxy URL required';
    chatInput.placeholder = "Please click settings in the top right to configure your Apps Script URL.";
    chatInput.disabled = true;
    return;
  }
  
  try {
    chatInput.placeholder = "Loading dashboard database dynamically...";
    chatInput.disabled = true;
    
    // Request raw sheets data from Apps Script bridge (keeps sheet restricted!)
    const response = await fetch(currentProxyUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'load_data',
        spreadsheet_id: currentSpreadsheetId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Data fetch failed: HTTP ${response.status}`);
    }
    
    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    // In v1.1.0 router architecture, we load the list of available sheet tabs
    const sheetNames = result.sheetNames || [];
    dashboardData = sheetNames; // Store sheet names metadata locally
    
    dbStatusDot.className = 'status-dot green';
    dbStatusText.textContent = `Live Connected (Tabs: ${sheetNames.length})`;
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.placeholder = "Ask about trends, recommendations, or insights...";
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    dbStatusDot.className = 'status-dot red';
    dbStatusText.textContent = 'Connection failed';
    chatInput.placeholder = "Failed to load database. Check settings or authorize Apps Script.";
    
    appendMessage('bot', `⚠️ **Database Connection Error:** Failed to load live data from Google Sheets.
    
**Reasons this happens:**
1. Your Google Apps Script Web App URL is incorrect or hasn't been deployed.
2. The Spreadsheet ID is incorrect.
3. The Spreadsheet hasn't been shared with your personal Gmail account yet.

*Please review your Settings panel (gear icon) to configure.*`);
  }
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
    settingSpreadsheetId.value = currentSpreadsheetId;
    settingEmbedUrl.value = currentEmbedUrl;
  } else {
    settingsModal.classList.add('hidden');
  }
}

// Save Settings from Modal
async function saveSettings() {
  currentApiKey = settingApiKey.value.trim();
  currentProxyUrl = settingProxyUrl.value.trim();
  currentSpreadsheetId = settingSpreadsheetId.value.trim();
  currentEmbedUrl = settingEmbedUrl.value.trim();
  
  localStorage.setItem('g_tso_api_key', currentApiKey);
  localStorage.setItem('g_tso_proxy_url', currentProxyUrl);
  localStorage.setItem('g_tso_spreadsheet_id', currentSpreadsheetId);
  localStorage.setItem('g_tso_embed_url', currentEmbedUrl);
  
  initDashboard();
  toggleModal(false);
  
  // Reload database
  await loadDashboardData();
  
  appendMessage('bot', `⚙️ **Settings updated successfully!** Dashboard reloaded and database sync re-initiated.`);
}

// Render Welcome Message
function renderWelcomeMessage() {
  const welcomeText = `👋 Welcome to the **Taylor's Schools Intelligence Assistant**. 

I have access to your live **intelligence database** through your secure Apps Script proxy.

You can ask me to:
- *Analyze trends and insights in the dataset.*
- *Search and summarize specific entries.*
- *Answer operational questions based on your sheets.*

**What insights would you like to explore today?**`;
  
  appendMessage('bot', welcomeText);
}

// Render Chips
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
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Clear Chat Area
function clearChat() {
  chatMessages.innerHTML = '';
  currentHistory = [];
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
  
  // Add message to UI
  appendMessage('user', text);
  chatInput.value = '';
  autoResizeTextarea();
  
  // Add thinking state
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
    thinkingDiv.remove();
    appendMessage('bot', response);
    
    currentHistory.push({ role: 'user', content: text });
    currentHistory.push({ role: 'model', content: response });
  } catch (error) {
    thinkingDiv.remove();
    console.error('API Error:', error);
    appendMessage('bot', `❌ **API Connection Error:** ${error.message}. Check your settings or network connection.`);
  }
}

// Send Request to Gemini API
async function callGeminiAPI(promptText) {
  // Proxy Call (Option A)
  if (currentProxyUrl) {
    const proxyBody = {
      action: 'chat',
      prompt: promptText,
      history: currentHistory.map(h => ({ role: h.role, content: h.content })),
      spreadsheet_id: currentSpreadsheetId
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

  // Direct Browser Call (Option B - Fallback)
  if (!currentApiKey) {
    throw new Error("No API Key or Proxy URL configured.");
  }
  
  const historyContents = currentHistory.map(h => ({
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
      maxOutputTokens: 2048
    }
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${currentApiKey}`, {
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
    throw new Error('Empty response from Gemini.');
  }
  
  return textResponse;
}

// Simple Markdown Parser for UI Rendering
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = '';
  const lines = text.split('\n');
  let inList = false;
  let listType = null;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Tables
    if (line.startsWith('|')) {
      if (inList) {
        html += `</${listType}>`;
        inList = false;
        listType = null;
      }
      
      const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (line.includes('---')) {
        continue;
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

    // Lists
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

    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) { html += `</${listType}>`; }
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      html += `<li>${formatInline(numMatch[2].trim())}</li>`;
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

    // Plain text Paragraphs
    if (inList) {
      html += `</${listType}>`;
      inList = false;
      listType = null;
    }
    html += `<p>${formatInline(line)}</p>`;
  }

  if (inList) { html += `</${listType}>`; }
  if (inTable) { html += renderTable(tableHeaders, tableRows); }

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
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/`(.*?)`/g, '<code>$1</code>');
  return text;
}

// Resizable Splitter Logic
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');
const dragBar = document.getElementById('drag-bar');

let isDragging = false;

dragBar.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.classList.add('resizing');
  dragBar.classList.add('dragging');
  dashboardIframe.classList.add('no-pointer-events'); // Prevent iframe from capturing mouseevents
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  const containerWidth = document.querySelector('.app-main').clientWidth;
  // Get boundary offset relative to container's left edge
  const containerOffsetLeft = document.querySelector('.app-main').getBoundingClientRect().left;
  const leftWidth = e.clientX - containerOffsetLeft;
  const leftPercentage = (leftWidth / containerWidth) * 100;
  
  // Enforce min 20% and max 80% sizes
  if (leftPercentage > 20 && leftPercentage < 80) {
    leftPanel.style.flex = `0 0 ${leftPercentage}%`;
    rightPanel.style.flex = `0 0 ${100 - leftPercentage}%`;
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.classList.remove('resizing');
    dragBar.classList.remove('dragging');
    dashboardIframe.classList.remove('no-pointer-events');
  }
});
