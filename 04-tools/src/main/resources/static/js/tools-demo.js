// AI Agent Tools Demo JavaScript

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');

// Session state
let sessionId = null;
let isProcessing = false;

// Initialize session on page load
window.addEventListener('DOMContentLoaded', async () => {
    await startSession();
});

// Start a new session
async function startSession() {
    try {
        const response = await fetch('/api/agent/start', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            sessionId = data.sessionId;
            console.log('Session started:', sessionId);
        } else {
            console.error('Failed to start session');
        }
    } catch (error) {
        console.error('Error starting session:', error);
    }
}

// Send Button Click Handler
sendButton.addEventListener('click', () => {
    sendMessage();
});

// Enter key to send (Shift+Enter for new line)
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Clear Button Click Handler
clearButton.addEventListener('click', () => {
    clearChat();
});

// Try Example Function (called from HTML)
function tryExample(exampleText) {
    messageInput.value = exampleText;
    messageInput.focus();
    sendMessage();
}

// Send Message to Agent
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || isProcessing) {
        return;
    }

    // Add user message to chat
    addUserMessage(message);
    
    // Clear input
    messageInput.value = '';
    
    // Show loading indicator
    const loadingId = addLoadingIndicator();
    
    // Disable send button
    isProcessing = true;
    sendButton.disabled = true;
    
    try {
        const response = await fetch('/api/agent/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                sessionId: sessionId
            })
        });

        const data = await response.json();
        
        // Remove loading indicator
        removeLoadingIndicator(loadingId);

        if (response.ok) {
            // Update session ID
            sessionId = data.sessionId;
            
            // Add agent response to chat
            addAgentMessage(data.answer, data.toolExecutions || []);
        } else {
            addErrorMessage(data.error || 'Failed to get response from agent');
        }
    } catch (error) {
        removeLoadingIndicator(loadingId);
        addErrorMessage('Failed to communicate with the agent: ' + error.message);
    } finally {
        isProcessing = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

// Add User Message to Chat
function addUserMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message user';
    messageDiv.innerHTML = `
        <div class="message-icon">👤</div>
        <div class="message-bubble">
            <div class="message-content">${escapeHtml(message)}</div>
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add Agent Message to Chat
function addAgentMessage(answer, toolExecutions) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message agent';
    
    let toolsHtml = '';
    const toolBadges = formatToolExecutions(toolExecutions);
    if (toolBadges) {
        toolsHtml = `
            <div class="tools-used">
                <strong>Tools run:</strong> ${toolBadges}
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="message-icon">🤖</div>
        <div class="message-bubble">
            <div class="message-content markdown-body">${renderMarkdown(answer)}</div>
            ${toolsHtml}
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add Error Message
function addErrorMessage(errorText) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message agent';
    messageDiv.innerHTML = `
        <div class="message-icon">⚠️</div>
        <div class="message-bubble" style="border: 2px solid #e74c3c;">
            <div class="message-content" style="color: #e74c3c;">
                <strong>Error:</strong> ${escapeHtml(errorText)}
            </div>
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add Loading Indicator
function addLoadingIndicator() {
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = `
        <div class="message-icon">🤖</div>
        <div class="message-bubble">
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        </div>
    `;
    
    chatContainer.appendChild(loadingDiv);
    scrollToBottom();
    
    return loadingId;
}

// Remove Loading Indicator
function removeLoadingIndicator(loadingId) {
    const loadingDiv = document.getElementById(loadingId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Clear Chat
async function clearChat() {
    // Clear chat container, but keep the welcome message
    const welcomeMessage = chatContainer.querySelector('.welcome-message');
    chatContainer.innerHTML = '';
    if (welcomeMessage) {
        chatContainer.appendChild(welcomeMessage);
    }
    
    // Clear session on server
    if (sessionId) {
        try {
            await fetch(`/api/agent/session/${sessionId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }
    
    // Start new session
    await startSession();
}

// Scroll to Bottom of Chat
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format Tool Execution Info
function formatToolExecutions(toolExecutions) {
    if (!toolExecutions || toolExecutions.length === 0) {
        return '';
    }
    
    return toolExecutions.map(tool => {
        const args = Array.isArray(tool.arguments) ? tool.arguments.join(', ') : '';
        const label = args ? `${tool.toolName}(${args})` : tool.toolName;
        const status = tool.status ? ` status: ${tool.status}` : '';
        return `<span class="tool-badge" title="${escapeHtml(status)}">${escapeHtml(label)}</span>`;
    }).join('');
}
