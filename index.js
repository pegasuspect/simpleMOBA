const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
let id = 0;  // numeric player id counter

app.use(express.static('public'));
app.use(express.json());  // for POST body parsing

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/editor', (req, res) => {
  res.sendFile(__dirname + '/editor.html');
});

// --- Map serving endpoint --------------------------------------------------
// GET /maps/:name  →  serves JSON map files from /maps/ directory
// Example: /maps/summoners-rift.json
// -------------------------------------------------------------------------
const MAPS_DIR = path.join(__dirname, 'maps');

app.get('/maps/:name', (req, res) => {
  const fileName = path.basename(req.params.name);
  const filePath = path.join(MAPS_DIR, fileName);

  // Prevent path traversal — resolve and check it's still under MAPS_DIR
  if (!filePath.startsWith(MAPS_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Map not found: ${fileName}` });
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);  // validate it's valid JSON
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: `Failed to load map: ${err.message}` });
  }
});

// List available maps
app.get('/maps', (req, res) => {
  if (!fs.existsSync(MAPS_DIR)) {
    return res.json([]);
  }
  try {
    const files = fs.readdirSync(MAPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: `Failed to list maps: ${err.message}` });
  }
});

// Save a map to disk
// POST /maps/:name  body = full map JSON
app.post('/maps/:name', (req, res) => {
  const fileName = path.basename(req.params.name);
  if (!fileName.endsWith('.json')) {
    return res.status(400).json({ error: 'Map name must end with .json' });
  }

  const filePath = path.join(MAPS_DIR, fileName);

  // Prevent path traversal
  if (!filePath.startsWith(MAPS_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Basic validation — must have cols and rows
  const data = req.body;
  if (!data || typeof data.cols !== 'number' || typeof data.rows !== 'number') {
    return res.status(400).json({ error: 'Invalid map data: missing cols/rows' });
  }

  // Ensure maps directory exists
  if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR, { recursive: true });
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Map saved: ${fileName} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
    res.json({ success: true, name: fileName.replace(/\.json$/, '') });
  } catch (err) {
    res.status(500).json({ error: `Failed to save map: ${err.message}` });
  }
});

// Delete a map
app.delete('/maps/:name', (req, res) => {
  const fileName = path.basename(req.params.name);
  const filePath = path.join(MAPS_DIR, fileName);

  if (!filePath.startsWith(MAPS_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Map not found: ${fileName}` });
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`Map deleted: ${fileName}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete map: ${err.message}` });
  }
});

// --- Online users & chat ---------------------------------------------------
// users maps socket.id → { id, username, x, y }
// Players are keyed by socket.id so disconnect cleanup is O(1).
// The numeric `id` is still assigned for game-entity rendering.
const users = new Map();

// --- Chat history persistence ---
// Messages are kept in memory and flushed to chat-history.json periodically.
// Capped at MAX_HISTORY to avoid unbounded growth.
const CHAT_FILE = path.join(__dirname, 'chat-history.json');
const MAX_HISTORY = 200;
let chatHistory = [];
let chatDirty = false;

function loadChatHistory() {
  try {
    if (fs.existsSync(CHAT_FILE)) {
      const data = fs.readFileSync(CHAT_FILE, 'utf8');
      const arr = JSON.parse(data);
      if (Array.isArray(arr)) {
        chatHistory = arr.slice(-MAX_HISTORY);
        console.log(`Chat history loaded: ${chatHistory.length} message(s)`);
      }
    }
  } catch (err) {
    console.error(`Failed to load chat history: ${err.message}`);
  }
}

function saveChatHistory() {
  if (!chatDirty) return;
  try {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory, null, 2));
    chatDirty = false;
  } catch (err) {
    console.error(`Failed to save chat history: ${err.message}`);
  }
}

loadChatHistory();

// Flush chat history to disk every 5 seconds (debounced)
setInterval(saveChatHistory, 5000);

// Sanitize usernames: trim, max 20 chars, alphanumeric + underscore/dash
function sanitizeUsername(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().slice(0, 20);
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) return null;
  return cleaned;
}

// Broadcast the current online user list (id + username only, no positions)
function broadcastUserList() {
  const list = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
  }));
  io.emit('users', list);
}

io.on('connection', (socket) => {
  const playerId = id++;
  users.set(socket.id, { id: playerId, username: null, x: 0, y: 0 });

  // Send the player their numeric id (used for game entity rendering)
  socket.emit('id', playerId);

  // Send chat history so new/reconnecting clients see previous messages
  socket.emit('chatHistory', chatHistory);

  socket.on('setUsername', (name, ack) => {
    const user = users.get(socket.id);
    if (!user) return;
    const clean = sanitizeUsername(name);
    if (!clean) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid username. Use letters, numbers, _ or - (max 20 chars).' });
      return;
    }
    user.username = clean;
    if (typeof ack === 'function') ack({ ok: true, username: clean });
    console.log(`User joined: ${clean} (id=${user.id}, socket=${socket.id})`);
    broadcastUserList();
  });

  socket.on('chat', (msg) => {
    const user = users.get(socket.id);
    if (!user || !user.username) return;
    if (typeof msg !== 'string') return;
    const text = msg.trim().slice(0, 500);
    if (!text) return;
    const entry = {
      id: user.id,
      username: user.username,
      text: text,
      timestamp: Date.now(),
    };
    chatHistory.push(entry);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    chatDirty = true;
    io.emit('chat', entry);
  });

  socket.on('position', (player) => {
    const user = users.get(socket.id);
    if (!user) return;
    // Trust only the coordinates from the client; use server-side id
    user.x = player.x;
    user.y = player.y;
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user && user.username) {
      console.log(`User left: ${user.username} (id=${user.id})`);
    }
    users.delete(socket.id);
    broadcastUserList();
  });
});

// Broadcast positions every 100ms (10 tick rate)
setInterval(() => {
  if (users.size) {
    const positions = Array.from(users.values()).map(u => ({
      id: u.id, x: u.x, y: u.y,
    }));
    io.emit('position', positions);
  }
}, 100);

http.listen(port, () => {
  console.log(`Socket.IO server running at http://127.0.0.1:${port}/`);
});
