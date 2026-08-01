const express = require('express');
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

// Map Editor route
app.get('/map-editor', (req, res) => {
  res.sendFile(__dirname + '/map-editor.html');
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
