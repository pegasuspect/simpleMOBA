const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const port = process.env.PORT || 3000;
let id = 0;
let players = [];
let mapData = null;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- Map Editor routes ---

// Ensure maps directory exists
try {
  fs.accessSync(__dirname + '/maps');
} catch (e) {
  fs.mkdirSync(__dirname + '/maps', { recursive: true });
}

// Serve editor page
app.get('/editor', (req, res) => {
  res.sendFile(__dirname + '/public/editor.html');
});

// GET /editor-data — serve saved map (or create default)
app.get('/editor-data', (req, res) => {
  var mapPath = __dirname + '/maps/default.json';
  if (!fs.existsSync(mapPath)) {
    var blank = {
      width: 64,
      height: 48,
      tileSize: 16,
      tiles: []
    };
    for (var r = 0; r < 48; r++) {
      blank.tiles.push(new Array(64).fill(0));
    }
    fs.writeFileSync(mapPath, JSON.stringify(blank, null, 2));
  }
  var data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  res.json(data);
});

// POST /editor-data — save map and broadcast
app.post('/editor-data', express.json({ limit: '1mb' }), function (req, res) {
  var mapPath = __dirname + '/maps/default.json';
  try {
    var data = req.body;
    // Validate structure
    if (!data || !Array.isArray(data.tiles)) {
      return res.status(400).json({ error: 'Map data must include a tiles array' });
    }
    // Ensure tiles is 2D array of numbers 0-4
    for (var r = 0; r < data.tiles.length; r++) {
      for (var c = 0; c < data.tiles[r].length; c++) {
        var val = data.tiles[r][c];
        if (typeof val !== 'number' || val < 0 || val > 4) {
          return res.status(400).json({ error: 'Tile values must be integers 0-4' });
        }
      }
    }
    if (typeof data.width !== 'number' || typeof data.height !== 'number' || typeof data.tileSize !== 'number') {
      return res.status(400).json({ error: 'Map data must include width, height, and tileSize' });
    }
    // Write to disk
    fs.writeFileSync(mapPath, JSON.stringify(data, null, 2));
    mapData = data;
    // Broadcast to all connected sockets
    io.emit('mapUpdate', data);
    res.json({ saved: true });
  } catch (err) {
    res.status(400).json({ error: 'Invalid JSON: ' + err.message });
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
  console.log(`Socket.IO server running at http://localhost:${port}/`);
  console.log(`Map editor available at http://localhost:${port}/editor`);
});
