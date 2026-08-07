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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
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
