// State Management
let currentHistory = [];
let currentProxyUrl = localStorage.getItem('tso_sb_proxy_url') || (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_PROXY_URL : '');
let currentApiKey = localStorage.getItem('tso_sb_api_key') || '';
let currentFolderName = localStorage.getItem('tso_sb_folder_name') || (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_FOLDER_NAME : '.TSO');

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const quickQueries = document.getElementById('quick-queries');
const clearChatBtn = document.getElementById('clear-chat-btn');
const dbStatusDot = document.getElementById('db-status-dot');
const dbStatusText = document.getElementById('db-status-text');

// Settings Elements
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const proxyUrlInput = document.getElementById('proxy-url-input');
const apiKeyInput = document.getElementById('api-key-input');
const folderNameInput = document.getElementById('folder-name-input');

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  
  // Populate settings fields
  proxyUrlInput.value = currentProxyUrl;
  apiKeyInput.value = currentApiKey;
  folderNameInput.value = currentFolderName;
  
  // Update status dot and message
  updateStatus();
  
  // Render welcome message and suggested queries
  renderWelcomeMessage();
  renderSuggestedQueries();
  
  // Setup listeners
  chatInput.addEventListener('input', autoResizeTextarea);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  sendBtn.addEventListener('click', handleSendMessage);
  clearChatBtn.addEventListener('click', clearChat);
  
  // Modal toggle listeners
  openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Global click to close modal if clicked overlay
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
    }
  });
});

// Update Proxy and Connection Status
function updateStatus() {
  if (currentProxyUrl) {
    dbStatusDot.className = 'status-dot green';
    dbStatusText.textContent = 'Proxy Online';
    sendBtn.disabled = false;
  } else {
    dbStatusDot.className = 'status-dot red';
    dbStatusText.textContent = 'Proxy Not Set';
    sendBtn.disabled = true;
  }
}

// Auto-grow Textarea Input
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = (chatInput.scrollHeight - 4) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '' || !currentProxyUrl;
}

// Render Welcome Message
function renderWelcomeMessage() {
  appendMessage('bot', `👋 **Hello!** I am your TSO Second Brain Assistant. 

I can help you search, summarize, and answer questions directly from your private Obsidian wiki pages and strategic reports stored inside your **Google Drive**.

${!currentProxyUrl ? '⚠️ **Setup Required:** Please click the settings icon above to configure your Apps Script Web App Proxy URL.' : 'Ask me anything to begin!'}`);
}

// Render Quick Action Suggested Queries
function renderSuggestedQueries() {
  quickQueries.innerHTML = '';
  const queries = (typeof CONFIG !== 'undefined' ? CONFIG.SUGGESTED_QUERIES : []);
  queries.forEach(query => {
    const chip = document.createElement('div');
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

// Append Chat Message Bubbles
function appendMessage(sender, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  messageDiv.innerHTML = parseMarkdown(text);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Display thinking anim
function appendThinkingIndicator() {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'message thinking';
  thinkingDiv.id = 'thinking-indicator';
  thinkingDiv.innerHTML = `
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  `;
  chatMessages.appendChild(thinkingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return thinkingDiv;
}

// Clear Conversations
function clearChat() {
  chatMessages.innerHTML = '';
  currentHistory = [];
  renderWelcomeMessage();
}

// Handle sending input
async function handleSendMessage() {
  const text = chatInput.value.trim();
  if (text === '' || !currentProxyUrl) return;

  chatInput.value = '';
  autoResizeTextarea();
  
  appendMessage('user', text);
  const thinkingIndicator = appendThinkingIndicator();

  try {
    const response = await callProxyAPI(text);
    thinkingIndicator.remove();
    appendMessage('bot', response);
    
    currentHistory.push({ role: 'user', content: text });
    currentHistory.push({ role: 'model', content: response });
  } catch (error) {
    thinkingIndicator.remove();
    console.error('API Error:', error);
    appendMessage('bot', `❌ **Proxy Connection Error:** ${error.message}. Please check your web app deployment or API settings.`);
  }
}

// Execute Google Apps Script Web App Request
async function callProxyAPI(promptText) {
  const requestBody = {
    action: 'chat',
    prompt: promptText,
    history: currentHistory.map(h => ({ role: h.role, content: h.content })),
    api_key: currentApiKey,
    folder_name: currentFolderName
  };

  const response = await fetch(currentProxyUrl, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain' // Setting text/plain avoids CORS preflight triggers in Google Web Apps
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.status === 'error') {
    throw new Error(result.message);
  }
  return result.response;
}

// Save Settings from Modal
function saveSettings() {
  currentProxyUrl = proxyUrlInput.value.trim();
  currentApiKey = apiKeyInput.value.trim();
  currentFolderName = folderNameInput.value.trim();
  
  localStorage.setItem('tso_sb_proxy_url', currentProxyUrl);
  localStorage.setItem('tso_sb_api_key', currentApiKey);
  localStorage.setItem('tso_sb_folder_name', currentFolderName);
  
  updateStatus();
  settingsModal.classList.add('hidden');
  clearChat();
}

// Lightweight Custom Markdown Parser for UI Bubbles
function parseMarkdown(text) {
  if (!text) return '';
  
  // Sinks HTML characters to prevent injections
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Linebreaks and lists
  let lines = html.split('\n');
  let result = [];
  let inList = false;
  let inTable = false;
  
  for (let line of lines) {
    line = line.trim();
    
    // Headers
    if (line.startsWith('### ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h3>${line.substring(4)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h2>${line.substring(3)}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h1>${line.substring(2)}</h1>`);
      continue;
    }
    
    // Unordered lists
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${line.substring(2)}</li>`);
      continue;
    }
    
    if (inList && !line.startsWith('* ') && !line.startsWith('- ')) {
      result.push('</ul>');
      inList = false;
    }
    
    // Table processing
    if (line.startsWith('|')) {
      if (!inTable) {
        result.push('<table>');
        inTable = true;
      }
      
      // Skip markdown alignment lines
      if (line.includes('---')) continue;
      
      let cells = line.split('|').map(c => c.trim()).filter((c, index, arr) => index > 0 && index < arr.length - 1);
      let rowHtml = cells.map(c => `<td>${c}</td>`).join('');
      result.push(`<tr>${rowHtml}</tr>`);
      continue;
    }
    
    if (inTable && !line.startsWith('|')) {
      result.push('</table>');
      inTable = false;
    }
    
    if (line === '') {
      result.push('<br>');
    } else {
      result.push(`<p>${line}</p>`);
    }
  }
  
  if (inList) result.push('</ul>');
  if (inTable) result.push('</table>');
  
  return result.join('');
}
