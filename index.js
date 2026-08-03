const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
let id = 0;
let players = [];

const MAP_STATE_FILE = path.join(__dirname, 'map-state.json');

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/editor', (req, res) => {
  res.sendFile(__dirname + '/editor.html');
});

app.get('/map-state', (req, res) => {
  fs.readFile(MAP_STATE_FILE, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json({});
      return res.status(500).json({ error: err.message });
    }
    res.type('json').send(data);
  });
});

app.post('/save-map', (req, res) => {
  fs.writeFile(MAP_STATE_FILE, JSON.stringify(req.body, null, 2), err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
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
});
