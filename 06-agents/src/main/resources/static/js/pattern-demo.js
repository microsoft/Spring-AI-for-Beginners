// --- SSE-based Advisor Log Streaming ---

let logEventSource = null;

function connectLogStream() {
    if (logEventSource) {
        logEventSource.close();
    }
    const logPanel = document.getElementById('advisor-logs');
    if (logPanel) {
        logPanel.innerHTML = '';
    }
    logEventSource = new EventSource('/api/agents/logs');
    logEventSource.addEventListener('advisor-log', function (event) {
        const data = JSON.parse(event.data);
        appendLogEntry(data);
    });
    logEventSource.onerror = function () {
        // reconnect silently if the connection drops
    };
}

function disconnectLogStream() {
    if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
    }
}

function appendLogEntry(entry) {
    const logPanel = document.getElementById('advisor-logs');
    if (!logPanel) return;

    const div = document.createElement('div');
    div.className = 'log-entry log-' + entry.direction.toLowerCase();

    const ts = new Date(entry.timestamp).toLocaleTimeString();
    const badge = entry.direction === 'REQUEST' ? '⬆ REQUEST' : '⬇ RESPONSE';

    div.innerHTML =
        '<span class="log-badge">' + badge + '</span>' +
        '<span class="log-time">' + ts + '</span>' +
        '<pre class="log-message">' + escapeHtml(entry.message) + '</pre>';

    logPanel.appendChild(div);
    logPanel.scrollTop = logPanel.scrollHeight;
}

// --- Pattern API Call ---

async function callPattern(endpoint, requestBody) {
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');

    try {
        loadingDiv.style.display = 'block';
        responseDiv.innerHTML = '';
        submitBtn.disabled = true;
        connectLogStream();

        const response = await fetch('/api/agents/' + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const data = await response.json();
        displayResponse(data.result || data.response || JSON.stringify(data));
    } catch (error) {
        displayError('Failed to get response: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
        submitBtn.disabled = false;
        // keep the log stream open so late events still arrive
    }
}

// Raw markdown stash so copy-to-clipboard returns the source, not the rendered HTML
let lastRawResponse = '';

function displayResponse(text) {
    lastRawResponse = text == null ? '' : String(text);
    const responseDiv = document.getElementById('response');
    responseDiv.innerHTML =
        '<div class="response-card">' +
            '<div class="response-header">' +
                '<span class="response-label">AI Response</span>' +
                '<button onclick="copyToClipboard()" class="btn-copy">📋 Copy</button>' +
            '</div>' +
            '<div class="response-body">' +
                '<div class="markdown-body">' + renderMarkdown(lastRawResponse) + '</div>' +
            '</div>' +
            '<div class="response-footer">' +
                '<small>Generated at ' + new Date().toLocaleTimeString() + '</small>' +
            '</div>' +
        '</div>';
}

function displayError(message) {
    const responseDiv = document.getElementById('response');
    responseDiv.innerHTML =
        '<div class="error-message">' +
            '<strong>Error:</strong> ' + escapeHtml(message) +
        '</div>';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyToClipboard() {
    const source = lastRawResponse || (document.querySelector('.response-body pre') || {}).textContent || '';
    if (source) {
        navigator.clipboard.writeText(source).then(function () {
            alert('Copied to clipboard!');
        });
    }
}

// --- Minimal block-level Markdown renderer (no external deps) ---
// Handles: ATX headings (# ... ######), fenced code blocks (```), horizontal
// rules (---/***/___), bullet lists (-/*/+), ordered lists (N.), blockquotes
// (>), GFM tables, paragraphs, and inline: `code`, **bold**, *italic*,
// __bold__, _italic_, [text](url). Indentation is flattened (no nested lists),
// which is fine for the LLM-shaped output our agent patterns emit.
function renderMarkdown(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    // Allowlist rather than blocking javascript:, so odd encodings fall through to plain text.
    function safeUrl(u) {
        const t = String(u).trim();
        if (/^(?:https?:\/\/|mailto:)[^\s]+$/i.test(t)) return t;  // absolute, non-executable
        if (/^[#\/][^\s]*$/.test(t)) return t;                     // anchor or root-relative
        if (/^[\w.-]+(?:\/[^\s]*)?$/.test(t)) return t;            // plain relative path
        return null;                                               // anything else: render as text
    }

    function htmlEscape(s) {
        // Quotes matter too: the fence language is interpolated into a class="" attribute.
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function inline(s) {
        s = htmlEscape(s);
        // Lock inline code spans BEFORE other inline rules touch them
        const codeStash = [];
        s = s.replace(/`([^`\n]+)`/g, function (_m, c) {
            codeStash.push(c);
            return '\u0000C' + (codeStash.length - 1) + '\u0000';
        });
        // Bold (do before italic — order matters)
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
        // Italic — require non-word boundary so "snake_case" / "2*3" don't trigger
        s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>');
        s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?![_\w])/g, '$1<em>$2</em>');
        // Links [text](url)
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, text, url) {
            const safe = safeUrl(url);
            return safe === null
                ? text
                : '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        });
        // Restore code spans
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
        // Lines that terminate a paragraph or list-item continuation.
        // Needs the index, not the line, so a table start can be spotted via its separator row.
        const l = lines[idx];
        return isBlank(l) || isHeading(l) || isHr(l) || isFence(l) ||
               isUlItem(l) || isOlItem(l) || isQuote(l) || isTableStart(idx);
    }

    while (i < lines.length) {
        const line = lines[i];

        if (isBlank(line)) { i++; continue; }

        // Fenced code block
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

        // GFM table
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

        // Paragraph — accumulate until a blank line or another block starts
        const para = [line];
        i++;
        while (i < lines.length && !blockBoundary(i)) {
            para.push(lines[i]); i++;
        }
        out.push('<p>' + inline(para.join(' ')) + '</p>');
    }

    return out.join('\n');
}

function setExample(text) {
    const input = document.getElementById('input') ||
                  document.getElementById('task') ||
                  document.getElementById('problem') ||
                  document.querySelector('textarea');
    if (input) {
        input.value = text;
        input.focus();
    }
}
