const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
let id = 0;
let players = [];

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

io.on('connection', (socket) => {
  socket.on('position', player => {
    let p = players.find(x => x.id === player.id);
    if (p) {
      p.x = player.x
      p.y = player.y
    } else {
      console.error(`Player with ${player.id} not found! Recieved: `, typeof player, player);
    }
  });

  players.push({ x: 0, y: 0, id });
  io.emit('id', id);

  id++;
});

setInterval(() => {
  if (players.length) {
    io.emit('position', players);
  }
}, 100);

setInterval(()=> {
  players.forEach(x=> console.log(x.x + " " + x.y + ", " + x.id))
},1000)

http.listen(port, () => {
  console.log(`Socket.IO server running at http://127.0.0.1:${port}/`);
});
