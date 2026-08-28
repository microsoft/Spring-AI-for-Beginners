// Tic-Tac-Toe with AI - Spring AI MCP Demo

let gameId = null;
let gameActive = false;
let scores = { player: 0, ai: 0, draws: 0 };

// Load saved scores from localStorage
const savedScores = localStorage.getItem('tictactoe-scores');
if (savedScores) {
    scores = JSON.parse(savedScores);
    updateScoreDisplay();
}

// Track which gameIds have already been scored so the same finished game can't
// be counted twice. This matters because:
//   1. The agent chat path also finishes games (see syncBoardFromAgent).
//   2. After a game ends, the agent re-fetches its state on every chat turn
//      and re-sends it as `data.gameState`, so the WON/DRAW status arrives
//      multiple times for the same gameId.
// Persisted to localStorage with a small cap so reloads stay idempotent too.
const SCORED_GAMES_KEY = 'tictactoe-scored-games';
const MAX_SCORED_GAMES = 50;
const scoredGameIds = loadScoredGameIds();

function loadScoredGameIds() {
    try {
        const arr = JSON.parse(localStorage.getItem(SCORED_GAMES_KEY) || '[]');
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
        return new Set();
    }
}

function persistScoredGameIds() {
    // Keep at most MAX_SCORED_GAMES, dropping oldest entries first.
    const arr = Array.from(scoredGameIds);
    const trimmed = arr.length > MAX_SCORED_GAMES ? arr.slice(-MAX_SCORED_GAMES) : arr;
    if (trimmed.length !== arr.length) {
        scoredGameIds.clear();
        trimmed.forEach(id => scoredGameIds.add(id));
    }
    localStorage.setItem(SCORED_GAMES_KEY, JSON.stringify(trimmed));
}

/**
 * Idempotently records the outcome of a finished game. Safe to call any number
 * of times for the same gameId — only the first WON/DRAW observation per game
 * increments the scoreboard. Called from both client paths:
 *   - handleGameEnd      (direct ToolCallback path, after a board click)
 *   - syncBoardFromAgent (LLM-orchestrated path, after an agent chat reply)
 */
function recordGameOutcome(state) {
    if (!state || !state.gameId) return;
    if (state.status !== 'WON' && state.status !== 'DRAW') return;
    if (scoredGameIds.has(state.gameId)) return;
    if (state.status === 'WON') {
        if (state.winner === 'X') {
            scores.player++;
        } else {
            scores.ai++;
        }
    } else { // DRAW
        scores.draws++;
    }
    scoredGameIds.add(state.gameId);
    persistScoredGameIds();
    saveScores();
    updateScoreDisplay();
}

// --- Game Actions ---

async function newGame() {
    const btn = document.getElementById('newGameBtn');
    btn.disabled = true;
    updateStatus('Starting new game...', '');

    try {
        const response = await fetch('/api/game/new', { method: 'POST' });
        const data = await response.json();

        if (data.error) {
            updateStatus('Error: ' + escapeHtml(data.error), '');
            return;
        }

        gameId = data.gameId;
        gameActive = true;
        renderBoard(data.board, []);
        updateStatus('Your turn! Place your <strong>X</strong>', '');
        enableBoard();
    } catch (error) {
        updateStatus('Failed to start game. Is the MCP server running on port 8085?', '');
    } finally {
        btn.disabled = false;
    }
}

async function makeMove(position) {
    if (!gameActive || !gameId) return;

    const cell = document.querySelector(`[data-pos="${position}"]`);
    if (cell.classList.contains('occupied')) return;

    // Optimistic update: show X immediately
    cell.textContent = 'X';
    cell.classList.add('x', 'occupied', 'new-move');
    gameActive = false;
    disableBoard();
    updateStatus('🤖 AI is thinking...', 'thinking');

    try {
        const response = await fetch('/api/game/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, position })
        });

        const data = await response.json();

        if (data.error) {
            updateStatus('Error: ' + escapeHtml(data.error), '');
            // Revert optimistic update
            cell.textContent = '';
            cell.classList.remove('x', 'occupied', 'new-move');
            gameActive = true;
            enableBoard();
            return;
        }

        renderBoard(data.board, data.winningCells || []);
        handleGameEnd(data);
    } catch (error) {
        updateStatus('Connection error: ' + escapeHtml(error.message), '');
        gameActive = true;
        enableBoard();
    }
}

// --- Board Rendering ---

function renderBoard(board, winningCells) {
    for (let i = 0; i < 9; i++) {
        const cell = document.querySelector(`[data-pos="${i}"]`);
        const prevContent = cell.textContent;
        cell.textContent = board[i] || '';
        cell.className = 'cell';

        if (board[i] === 'X') {
            cell.classList.add('x', 'occupied');
        } else if (board[i] === 'O') {
            cell.classList.add('o', 'occupied');
            // Animate new AI move
            if (prevContent !== 'O') {
                cell.classList.add('new-move');
            }
        }

        if (winningCells && winningCells.includes(i)) {
            cell.classList.add('winner-cell');
        }
    }
}

// --- Game State Handling ---

function handleGameEnd(data) {
    if (data.status === 'WON') {
        if (data.winner === 'X') {
            updateStatus('🎉 You win! Great move!', 'win');
        } else {
            updateStatus('🤖 AI wins! Better luck next time.', 'lose');
        }
        recordGameOutcome(data);
        gameActive = false;
    } else if (data.status === 'DRAW') {
        updateStatus('🤝 It\'s a draw! Well played.', 'draw');
        // Add draw styling to all cells
        for (let i = 0; i < 9; i++) {
            const cell = document.querySelector(`[data-pos="${i}"]`);
            if (!cell.classList.contains('winner-cell')) {
                cell.classList.add('draw-cell');
            }
        }
        recordGameOutcome(data);
        gameActive = false;
    } else {
        // Game continues — player's turn
        gameActive = true;
        enableBoard();
        updateStatus('Your turn! Place your <strong>X</strong>', '');
    }
}

// --- UI Updates ---

// Callers pass small trusted HTML fragments; escape any dynamic text before calling.
function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function updateStatus(message, statusClass) {
    const statusEl = document.getElementById('gameStatus');
    statusEl.innerHTML = message;
    statusEl.className = 'game-status';
    if (statusClass) {
        statusEl.classList.add(statusClass);
    }
}

function updateScoreDisplay() {
    document.getElementById('playerScore').textContent = scores.player;
    document.getElementById('aiScore').textContent = scores.ai;
    document.getElementById('drawScore').textContent = scores.draws;
}

function enableBoard() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('disabled');
    });
}

function disableBoard() {
    document.querySelectorAll('.cell').forEach(cell => {
        if (!cell.classList.contains('occupied')) {
            cell.classList.add('disabled');
        }
    });
}

function resetScores() {
    scores = { player: 0, ai: 0, draws: 0 };
    saveScores();
    updateScoreDisplay();
}

function saveScores() {
    localStorage.setItem('tictactoe-scores', JSON.stringify(scores));
}

// --- Agent Chat (LLM-orchestrated MCP tool calls) ---

// Stable conversation ID per browser so the chat-memory advisor on the server
// can recall prior turns (notably the active gameId) across reloads. Cleared
// by the "Reset Chat" button.
function getAgentConversationId() {
    let id = localStorage.getItem('agent-conversation-id');
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'conv-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem('agent-conversation-id', id);
    }
    return id;
}

async function sendAgentMessage(event) {
    event.preventDefault();
    const input = document.getElementById('agentInput');
    const btn = document.getElementById('agentSendBtn');
    const log = document.getElementById('agentLog');
    const message = input.value.trim();
    if (!message) return;

    appendAgentMessage(log, 'agent-user', message);
    input.value = '';
    input.disabled = true;
    btn.disabled = true;

    const pending = appendAgentMessage(log, 'agent-pending', '🤖 thinking…');

    try {
        // Send the visual board's current gameId (if any) so the agent can
        // pick up a game the user started by clicking "New Game" instead of
        // asking via chat. Without this, the agent's conversation memory has
        // no gameId and it responds "we don't have an active game".
        const payload = {
            message,
            conversationId: getAgentConversationId()
        };
        if (gameId) {
            payload.gameId = gameId;
        }
        const response = await fetch('/api/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        pending.remove();
        if (data.error) {
            appendAgentMessage(log, 'agent-error', 'Error: ' + data.error);
        } else {
            appendAgentMessage(log, 'agent-reply', data.reply || '(empty reply)', true);
            // Sync the visual board so the human sees what the agent just did
            // on the server — keeps the two client paths (direct + agent) in sync.
            if (data.gameId) {
                syncBoardFromAgent(data.gameId, data.gameState);
            }
        }
    } catch (err) {
        pending.remove();
        appendAgentMessage(log, 'agent-error', 'Connection error: ' + err.message);
    } finally {
        input.disabled = false;
        btn.disabled = false;
        input.focus();
    }
}

/**
 * Render the current server-side state of the agent's game on the visual board.
 * Called after every agent reply so the X's and O's the LLM placed via MCP tools
 * actually show up to the user. Also rewires the board's `gameId` so subsequent
 * direct-click moves operate on the same game the agent is working with.
 */
function syncBoardFromAgent(agentGameId, state) {
    if (!state || state.error) return;
    gameId = agentGameId;
    const board = state.board || [];
    const winningCells = state.winningCells || [];
    renderBoard(board, winningCells);

    // Belt-and-braces: the controller already includes gameId in gameState, but
    // ensure recordGameOutcome can always identify the game even if it doesn't.
    const outcomeState = { ...state, gameId: state.gameId || agentGameId };

    const status = state.status;
    if (status === 'WON') {
        if (state.winner === 'X') {
            updateStatus('🎉 You win! (the agent placed your move)', 'win');
        } else {
            updateStatus('🤖 AI wins! (the agent ran the turn)', 'lose');
        }
        recordGameOutcome(outcomeState);
        gameActive = false;
        disableBoard();
    } else if (status === 'DRAW') {
        updateStatus('🤝 It\'s a draw!', 'draw');
        recordGameOutcome(outcomeState);
        gameActive = false;
        disableBoard();
    } else if (state.currentPlayer === 'X') {
        // IN_PROGRESS and it is the human's turn - let the user keep playing on this same game by clicking.
        gameActive = true;
        enableBoard();
        updateStatus('Your turn! Place your <strong>X</strong> (or keep chatting)', '');
    } else {
        gameActive = false;
        disableBoard();
        updateStatus('AI turn. Ask the agent to let the server AI move, or keep chatting.', 'thinking');
    }
}

async function resetAgentConversation() {
    const log = document.getElementById('agentLog');
    const conversationId = getAgentConversationId();
    try {
        await fetch('/api/agent/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId })
        });
    } catch (err) {
        // Best-effort: even if the server call fails, rotate the ID locally so
        // the next message starts a brand-new conversation.
        console.warn('Agent reset failed, rotating conversation ID locally', err);
    }
    localStorage.removeItem('agent-conversation-id');
    // Pre-warm a fresh ID so the next message uses it.
    getAgentConversationId();
    // Clear the visible log and restore the seed message.
    log.innerHTML = '';
    const seed = document.createElement('div');
    seed.className = 'agent-message agent-system';
    seed.textContent = 'Conversation reset. Discovered MCP tools are still available.';
    log.appendChild(seed);
}

function appendAgentMessage(log, cls, text, renderMarkdown = false) {
    const el = document.createElement('div');
    el.className = 'agent-message ' + cls;
    if (renderMarkdown) {
        el.innerHTML = formatAgentMarkdown(text);
    } else {
        el.textContent = text;
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
}

// Minimal markdown -> HTML for agent replies.
// Escapes HTML first, then renders fenced code blocks, **bold**, *italic*,
// inline `code`, and newlines.
function formatAgentMarkdown(text) {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    return escaped
        // Fenced code blocks ```lang\n...\n``` -> <pre><code>...</code></pre>
        .replace(/```(?:[a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, code) =>
            '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        // Preserve newlines outside <pre> blocks. <pre> already preserves its own newlines.
        .replace(/\n/g, (match, offset, full) => {
            // Skip newlines inside <pre>...</pre>
            const before = full.lastIndexOf('<pre>', offset);
            const closed = full.lastIndexOf('</pre>', offset);
            return before > closed ? '\n' : '<br>';
        });
}
