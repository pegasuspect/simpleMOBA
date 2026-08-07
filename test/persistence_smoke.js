// Smoke test: chat message persistence across server restart
// Requires server running on port 3000.
// Verifies: messages saved to chat-history.json, reloaded on restart,
// and sent to new clients via chatHistory event.
const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL = 'http://localhost:3000';
const CHAT_FILE = path.join(__dirname, '..', 'chat-history.json');
const results = [];

function check(name, cond) {
    results.push({ name, pass: !!cond });
    console.log(`  ${cond ? '✓' : '✗'} ${name}`);
}

function connectAndSetUsername(name) {
    return new Promise((resolve) => {
        const sock = io(URL, { transports: ['websocket'] });
        sock.on('id', () => {
            sock.emit('setUsername', name, () => resolve(sock));
        });
    });
}

async function main() {
    // 1. Connect a client, send a chat message
    const c1 = await connectAndSetUsername('PersistTester');
    const testMsg = 'Persistence test ' + Date.now();
    c1.emit('chat', testMsg);

    // Wait for the message to be received back (confirms server processed it)
    await new Promise((resolve) => {
        c1.on('chat', (msg) => {
            if (msg.text === testMsg) resolve();
        });
    });
    check('Chat message sent and received', true);

    // 2. Wait for the debounced save (5s interval)
    console.log('  Waiting 6s for debounced file save...');
    await new Promise(r => setTimeout(r, 6000));

    // 3. Verify chat-history.json exists and contains the message
    check('chat-history.json exists', fs.existsSync(CHAT_FILE));
    if (fs.existsSync(CHAT_FILE)) {
        const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
        const found = data.some(m => m.text === testMsg);
        check('Message persisted to file', found);
    }

    // 4. Restart the server — kill only the LISTENER, not our client connection
    c1.disconnect();
    console.log('  Restarting server...');
    try {
        execSync('lsof -ti:3000 -sTCP:LISTEN | xargs kill -9 2>/dev/null; sleep 1', { stdio: 'ignore' });
    } catch (e) { /* ignore */ }
    execSync('nohup node index.js > /dev/null 2>&1 &', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000));

    // 5. Connect a new client and verify it receives chatHistory with the message
    const c2 = io(URL, { transports: ['websocket'] });
    const historyReceived = await new Promise((resolve) => {
        c2.on('chatHistory', (history) => {
            const found = history.some(m => m.text === testMsg);
            resolve(found);
        });
        // Timeout fallback
        setTimeout(() => resolve(false), 3000);
    });
    check('New client receives persisted history after restart', historyReceived);

    c2.disconnect();

    // Clean up: kill server
    try { execSync('lsof -ti:3000 -sTCP:LISTEN | xargs kill -9 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n=== Chat Persistence Smoke Test ===`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        results.filter(r => !r.pass).forEach(r => console.log(`  FAILED: ${r.name}`));
        process.exit(1);
    }
    process.exit(0);
}

main().catch(err => {
    console.error('Persistence test failed:', err);
    process.exit(1);
});