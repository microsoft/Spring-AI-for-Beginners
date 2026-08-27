async function callPattern(endpoint, requestBody) {
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');

    try {
        // Show loading state
        loadingDiv.style.display = 'block';
        responseDiv.innerHTML = '';
        submitBtn.disabled = true;

        // Call API
        const response = await fetch(`/api/gpt5/${endpoint}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Display response
        displayResponse(data.result || data.response || JSON.stringify(data));

    } catch (error) {
        displayError('Failed to get response: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Stash of the last raw markdown response so the Copy button can grab it
// without round-tripping through escaped HTML.
let lastRawResponse = '';

function displayResponse(text) {
    const responseDiv = document.getElementById('response');
    lastRawResponse = text == null ? '' : String(text);
    responseDiv.innerHTML = `
        <div class="response-card">
            <div class="response-header">
                <span class="response-label">AI Response</span>
                <button onclick="copyLastResponse()" class="btn-copy">📋 Copy</button>
            </div>
            <div class="response-body">
                <div class="markdown-body">${renderMarkdown(lastRawResponse)}</div>
            </div>
            <div class="response-footer">
                <small>Generated at ${new Date().toLocaleTimeString()}</small>
            </div>
        </div>
    `;
}

function displayError(message) {
    const responseDiv = document.getElementById('response');
    responseDiv.innerHTML = `
        <div class="error-message">
            <strong>Error:</strong> ${escapeHtml(message)}
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function copyLastResponse() {
    if (!lastRawResponse) return;
    navigator.clipboard.writeText(lastRawResponse).then(() => {
        alert('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Legacy entry point kept for any inline handlers that still pass a string.
function copyToClipboard(text) {
    const source = (typeof text === 'string' && text.length > 0) ? text : lastRawResponse;
    if (!source) return;
    navigator.clipboard.writeText(source).then(() => {
        alert('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function setExample(text) {
    // Try to find the main input field by common IDs first
    const input = document.getElementById('code') || 
                  document.getElementById('task') || 
                  document.getElementById('problem') ||
                  document.getElementById('requirement') ||
                  document.getElementById('question') ||
                  document.getElementById('topic') ||
                  document.querySelector('textarea:not([readonly]), input[type="text"]:not([readonly])');
    
    if (input) {
        input.value = text;
        input.focus();
    }
}

/**
 * Generic streaming function for all patterns.
 * Calls POST /api/gpt5/{endpoint}/stream with SSE and renders tokens in real-time.
 *
 * Tokens from the AI model may arrive in rapid bursts (the model thinks first,
 * then outputs fast). A render queue drains tokens at a visible pace so the user
 * sees a smooth typing animation instead of the entire answer appearing at once.
 */
function callPatternStreaming(endpoint, requestBody) {
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');

    loadingDiv.style.display = 'block';
    submitBtn.disabled = true;
    lastRawResponse = '';
    responseDiv.innerHTML = `
        <div class="response-card">
            <div class="response-header">
                <span class="response-label">\u{1F534} Streaming AI Response</span>
                <span id="token-counter" style="font-size:12px; color:#888;">0 tokens</span>
                <button onclick="copyLastResponse()" class="btn-copy">📋 Copy</button>
            </div>
            <div class="response-body">
                <div id="stream-output" class="markdown-body"></div>
            </div>
            <div class="response-footer">
                <small id="stream-status">Connecting...</small>
            </div>
        </div>
    `;

    const outputEl = document.getElementById('stream-output');
    const statusEl = document.getElementById('stream-status');
    const counterEl = document.getElementById('token-counter');

    // ---- Token render queue ----
    const tokenQueue = [];
    let tokenCount = 0;
    let accumulated = '';
    let streamDone = false;
    let rendering = false;
    const MIN_TOKEN_INTERVAL_MS = 15; // minimum ms between rendered tokens

    function rerender() {
        outputEl.innerHTML = renderMarkdown(accumulated);
    }

    function startRendering() {
        if (rendering) return;
        rendering = true;
        let lastRender = 0;

        function renderLoop(ts) {
            // Drain tokens at a visible pace
            if (tokenQueue.length > 0 && ts - lastRender >= MIN_TOKEN_INTERVAL_MS) {
                const batch = tokenQueue.length > 50 ? Math.ceil(tokenQueue.length / 30) : 1;
                for (let i = 0; i < batch && tokenQueue.length > 0; i++) {
                    const tok = tokenQueue.shift();
                    accumulated += tok;
                    tokenCount++;
                }
                rerender();
                counterEl.textContent = tokenCount + ' tokens';
                lastRender = ts;
            }

            if (tokenQueue.length > 0 || !streamDone) {
                requestAnimationFrame(renderLoop);
            } else {
                rendering = false;
                lastRawResponse = accumulated;
                rerender(); // final pass in case any tokens slipped in just before done
                statusEl.textContent = `Complete at ${new Date().toLocaleTimeString()} \u2014 ${tokenCount} tokens`;
                submitBtn.disabled = false;
            }
        }
        requestAnimationFrame(renderLoop);
    }

    // ---- SSE parser ----
    let sseBuffer = '';

    function processSSEEvents(text) {
        sseBuffer += text;
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const event of events) {
            if (!event.trim()) continue;
            // Per SSE spec, multi-line payloads are split across consecutive
            // `data:` lines with the line breaks stripped. Re-join with \n
            // so newlines emitted by the model are preserved.
            const dataLines = [];
            for (const line of event.split('\n')) {
                if (line.startsWith('data:')) {
                    // Spring writes "data:<value>" with no leading space, so
                    // do NOT strip a leading space — many tokens legitimately
                    // begin with a space (e.g. " the", " and").
                    dataLines.push(line.substring(5));
                }
            }
            if (dataLines.length === 0) continue;
            let token = dataLines.join('\n');
            if (token.startsWith('"') && token.endsWith('"')) {
                try { token = JSON.parse(token); } catch(e) { /* use raw */ }
            }
            tokenQueue.push(token);
        }
        startRendering();
    }

    // ---- Fetch + ReadableStream ----
    fetch(`/api/gpt5/${endpoint}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        loadingDiv.style.display = 'none';
        statusEl.textContent = 'Streaming...';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    if (sseBuffer.trim()) processSSEEvents('\n\n');
                    streamDone = true;
                    // If no tokens queued, mark complete now
                    if (tokenQueue.length === 0 && !rendering) {
                        lastRawResponse = accumulated;
                        rerender();
                        statusEl.textContent = `Complete at ${new Date().toLocaleTimeString()} \u2014 ${tokenCount} tokens`;
                        submitBtn.disabled = false;
                    }
                    return;
                }
                processSSEEvents(decoder.decode(value, { stream: true }));
                read();
            }).catch(err => {
                streamDone = true;
                statusEl.textContent = 'Error: ' + err.message;
                submitBtn.disabled = false;
            });
        }
        read();
    }).catch(err => {
        loadingDiv.style.display = 'none';
        responseDiv.innerHTML = `<div class="error-message"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
        submitBtn.disabled = false;
    });
}

// --- Minimal block-level Markdown renderer (no external deps) ---
// Handles: ATX headings (# ... ######), fenced code blocks (```), horizontal
// rules (---/***/___), bullet lists (-/*/+), ordered lists (N.), blockquotes
// (>), GFM tables, paragraphs, and inline: `code`, **bold**, *italic*,
// __bold__, _italic_, [text](url). Indentation is flattened (no nested lists).
function renderMarkdown(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    function htmlEscape(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function inline(s) {
        s = htmlEscape(s);
        const codeStash = [];
        s = s.replace(/`([^`\n]+)`/g, function (_m, c) {
            codeStash.push(c);
            return '\u0000C' + (codeStash.length - 1) + '\u0000';
        });
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>');
        s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?![_\w])/g, '$1<em>$2</em>');
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        s = s.replace(/\u0000C(\d+)\u0000/g, function (_m, idx) {
            return '<code>' + codeStash[parseInt(idx, 10)] + '</code>';
        });
        return s;
    }

    function isBlank(l)   { return /^\s*$/.test(l); }
    function isHeading(l) { return /^\s{0,3}#{1,6}\s+/.test(l); }
    function isHr(l)      { return /^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(l); }
    function isFence(l)   { return /^\s*```/.test(l); }
    function isUlItem(l)  { return /^\s*[-*+]\s+/.test(l); }
    function isOlItem(l)  { return /^\s*\d+\.\s+/.test(l); }
    function isQuote(l)   { return /^\s*>\s?/.test(l); }
    function isTableSep(l){ return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l); }

    function splitRow(l) {
        return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    }

    function isTableStart(idx) {
        return idx + 1 < lines.length && lines[idx].indexOf('|') >= 0 && isTableSep(lines[idx + 1]);
    }

    function blockBoundary(idx) {
        // Needs the index, not the line, so a table start can be spotted via its separator row.
        const l = lines[idx];
        return isBlank(l) || isHeading(l) || isHr(l) || isFence(l) ||
               isUlItem(l) || isOlItem(l) || isQuote(l) || isTableStart(idx);
    }

    while (i < lines.length) {
        const line = lines[i];

        if (isBlank(line)) { i++; continue; }

        if (isFence(line)) {
            const lang = line.replace(/^\s*```/, '').trim();
            const buf = [];
            i++;
            while (i < lines.length && !isFence(lines[i])) { buf.push(lines[i]); i++; }
            if (i < lines.length) i++; // consume closing fence
            out.push(
                '<pre><code' + (lang ? ' class="lang-' + htmlEscape(lang) + '"' : '') + '>' +
                htmlEscape(buf.join('\n')) +
                '</code></pre>'
            );
            continue;
        }

        if (isHr(line)) { out.push('<hr>'); i++; continue; }

        const hMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (hMatch) {
            const lvl = hMatch[1].length;
            out.push('<h' + lvl + '>' + inline(hMatch[2]) + '</h' + lvl + '>');
            i++; continue;
        }

        if (isTableStart(i)) {
            const header = splitRow(line);
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].indexOf('|') >= 0 && !isBlank(lines[i])) {
                rows.push(splitRow(lines[i])); i++;
            }
            out.push(
                '<table><thead><tr>' +
                header.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
                '</tr></thead><tbody>' +
                rows.map(function (r) {
                    return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
                }).join('') +
                '</tbody></table>'
            );
            continue;
        }

        if (isUlItem(line)) {
            const items = [];
            while (i < lines.length && isUlItem(lines[i])) {
                let item = lines[i].replace(/^\s*[-*+]\s+/, '');
                i++;
                while (i < lines.length && !blockBoundary(i)) {
                    item += ' ' + lines[i].trim(); i++;
                }
                items.push('<li>' + inline(item) + '</li>');
            }
            out.push('<ul>' + items.join('') + '</ul>');
            continue;
        }

        if (isOlItem(line)) {
            const items = [];
            while (i < lines.length && isOlItem(lines[i])) {
                let item = lines[i].replace(/^\s*\d+\.\s+/, '');
                i++;
                while (i < lines.length && !blockBoundary(i)) {
                    item += ' ' + lines[i].trim(); i++;
                }
                items.push('<li>' + inline(item) + '</li>');
            }
            out.push('<ol>' + items.join('') + '</ol>');
            continue;
        }

        if (isQuote(line)) {
            const buf = [];
            while (i < lines.length && isQuote(lines[i])) {
                buf.push(lines[i].replace(/^\s*>\s?/, '')); i++;
            }
            out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
            continue;
        }

        const para = [line];
        i++;
        while (i < lines.length && !blockBoundary(i)) {
            para.push(lines[i]); i++;
        }
        out.push('<p>' + inline(para.join(' ')) + '</p>');
    }

    return out.join('\n');
}
