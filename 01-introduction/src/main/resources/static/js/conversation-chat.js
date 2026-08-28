const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const startBtn = document.getElementById('start-btn');
const clearBtn = document.getElementById('clear-btn');
const statusText = document.getElementById('status');

let conversationId = null;

// Load saved conversation ID from localStorage
const savedConversationId = localStorage.getItem('conversationId');
if (savedConversationId) {
    conversationId = savedConversationId;
    enableChat();
    loadHistory();
}

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
        const response = await fetch('/api/conversation/start', {
            method: 'POST'
        });

        const data = await response.json();
        
        if (response.ok) {
            conversationId = data.conversationId;
            localStorage.setItem('conversationId', conversationId);
            enableChat();
        } else {
            alert('Failed to start conversation: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Failed to connect to server');
    } finally {
        startBtn.disabled = false;
    }
});

clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear conversation history?')) return;
    
    clearBtn.disabled = true;
    try {
        await fetch(`/api/conversation/${conversationId}`, {
            method: 'DELETE'
        });

        conversationId = null;
        localStorage.removeItem('conversationId');
        messagesDiv.innerHTML = '';
        disableChat();
    } catch (error) {
        alert('Failed to clear conversation');
    } finally {
        clearBtn.disabled = false;
    }
});

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message || !conversationId) return;

    addMessage('user', message);
    messageInput.value = '';
    sendBtn.disabled = true;

    const loadingId = addLoadingMessage();

    try {
        const response = await fetch('/api/conversation/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                conversationId,
                message 
            })
        });

        const data = await response.json();
        removeLoadingMessage(loadingId);

        if (response.ok) {
            addMessage('ai', data.answer);
        } else {
            addMessage('error', data.error || 'An error occurred');
        }
    } catch (error) {
        removeLoadingMessage(loadingId);
        addMessage('error', 'Failed to connect to server');
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
});

async function loadHistory() {
    try {
        const response = await fetch(`/api/conversation/${conversationId}/history`);
        const data = await response.json();

        if (response.ok && data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                const messageType = msg.messageType || msg.type;
                if (messageType === 'USER') {
                    const text = msg.text || (msg.contents && msg.contents[0] ? msg.contents[0].text : '');
                    if (text) addMessage('user', text);
                } else if (messageType === 'ASSISTANT' || messageType === 'AI') {
                    if (msg.text) addMessage('ai', msg.text);
                }
            });
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

function enableChat() {
    chatForm.style.display = 'flex';
    startBtn.style.display = 'none';
    clearBtn.style.display = 'inline-block';
    statusText.textContent = `Active conversation: ${conversationId.substring(0, 8)}...`;
    messageInput.focus();
}

function disableChat() {
    chatForm.style.display = 'none';
    startBtn.style.display = 'inline-block';
    clearBtn.style.display = 'none';
    statusText.textContent = 'Click "Start Conversation" to begin';
}

function addMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = type === 'user' ? 'You' : type === 'error' ? 'Error' : 'AI';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    
    messageDiv.appendChild(label);
    messageDiv.appendChild(bubble);
    messagesDiv.appendChild(messageDiv);
    
    scrollToBottom();
}

function addLoadingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    messageDiv.id = 'loading-message';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble loading';
    bubble.textContent = 'AI is thinking';
    
    messageDiv.appendChild(bubble);
    messagesDiv.appendChild(messageDiv);
    
    scrollToBottom();
    return 'loading-message';
}

function removeLoadingMessage(id) {
    const loadingMsg = document.getElementById(id);
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
