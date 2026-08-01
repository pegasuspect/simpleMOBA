const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const mapStatePath = path.join(__dirname, 'map-state.json');
let id = 0;
let players = [];

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get(['/editor', '/editor/'], (req, res) => {
  res.sendFile(__dirname + '/editor.html');
});

app.get('/map-state', async (req, res) => {
  try {
    const mapState = await fs.readFile(mapStatePath, 'utf8');
    res.type('json').send(mapState);
  } catch (error) {
    console.error('Unable to read map state:', error);
    res.status(500).json({ error: 'Unable to read map state.' });
  }
});

app.post('/save-map', async (req, res) => {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Map state must be a JSON object.' });
  }

  try {
    await fs.writeFile(mapStatePath, `${JSON.stringify(req.body, null, 2)}\n`, 'utf8');
    res.json({ saved: true, mapState: req.body });
  } catch (error) {
    console.error('Unable to save map state:', error);
    res.status(500).json({ error: 'Unable to save map state.' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  next(error);
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
