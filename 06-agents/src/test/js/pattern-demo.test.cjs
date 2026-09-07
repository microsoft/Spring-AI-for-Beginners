const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness() {
    const elements = new Map(['response', 'loading', 'submit-btn', 'advisor-logs'].map(id => [id, { style: {}, innerHTML: '', disabled: false }]));
    const calls = [];
    const errors = [];
    let timeoutCallback;
    let stream;
    class FakeEventSource {
        constructor() {
            this.listeners = new Map();
            stream = this;
        }
        addEventListener(name, listener) { this.listeners.set(name, listener); }
        close() { this.closed = true; }
    }
    const context = vm.createContext({
        document: { getElementById: id => elements.get(id) },
        EventSource: FakeEventSource,
        setTimeout: callback => { timeoutCallback = callback; return 1; },
        clearTimeout: () => { timeoutCallback = null; },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ result: 'completed' }) };
        },
        captureError: message => errors.push(message)
    });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../main/resources/static/js/pattern-demo.js'), 'utf8'), context);
    vm.runInContext('displayResponse = () => {}; displayError = captureError;', context);
    return {
        start: () => vm.runInContext('callPattern("chain", { input: "example" })', context),
        ready: () => stream.listeners.get('ready')(),
        fail: () => stream.onerror(),
        timeout: () => timeoutCallback(),
        calls, errors, elements,
        get closed() { return stream.closed; }
    };
}

test('workflow POST waits for the server subscription acknowledgement', async () => {
    const state = harness();
    const pending = state.start();
    assert.equal(state.calls.length, 0);
    assert.equal(state.elements.get('submit-btn').disabled, true);
    state.ready();
    await pending;
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].url, '/api/agents/chain');
    assert.equal(state.elements.get('submit-btn').disabled, false);
    assert.deepEqual(state.errors, []);
});

test('connection failure reports the error without starting the workflow', async () => {
    const state = harness();
    const pending = state.start();
    state.fail();
    await pending;
    assert.equal(state.calls.length, 0);
    assert.equal(state.closed, true);
    assert.match(state.errors[0], /Unable to connect/);
    assert.equal(state.elements.get('submit-btn').disabled, false);
});

test('connection timeout closes the stream and restores the controls', async () => {
    const state = harness();
    const pending = state.start();
    state.timeout();
    await pending;
    assert.equal(state.calls.length, 0);
    assert.equal(state.closed, true);
    assert.match(state.errors[0], /timed out/);
    assert.equal(state.elements.get('loading').style.display, 'none');
    assert.equal(state.elements.get('submit-btn').disabled, false);
});