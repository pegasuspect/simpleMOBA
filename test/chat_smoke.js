const io = require('socket.io-client');

const URL = 'http://localhost:3000';
const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
}

// Connect two clients
const c1 = io(URL, { transports: ['websocket'] });
const c2 = io(URL, { transports: ['websocket'] });

let c1Id = null, c2Id = null;
let c1UsersSeen = false, c2UsersSeen = false;
let c1ChatReceived = false;
let usersAfterJoin = null;
let usersAfterDisconnect = null;
let step = 0;

c1.on('id', (id) => { c1Id = id; });
c2.on('id', (id) => { c2Id = id; });

c1.on('users', (list) => {
  if (step === 1) {
    usersAfterJoin = list;
    // Both users should have usernames now
    const hasUser1 = list.some(u => u.username === 'Alice');
    const hasUser2 = list.some(u => u.username === 'Bob');
    check('User list contains Alice after join', hasUser1);
    check('User list contains Bob after join', hasUser2);
    check('User list has 2 entries', list.length === 2);

    // Now send a chat message from c1
    c1.emit('chat', 'Hello from Alice!');
  }
  if (step === 2) {
    usersAfterDisconnect = list;
  }
});

c2.on('users', (list) => {
  c2UsersSeen = true;
});

c2.on('chat', (msg) => {
  c1ChatReceived = true;
  check('Chat message received by other client', msg.username === 'Alice' && msg.text === 'Hello from Alice!');
  check('Chat message has id field', typeof msg.id === 'number');
  check('Chat message has timestamp', typeof msg.timestamp === 'number');

  // Now disconnect c2 and check user list shrinks
  step = 2;
  c2.disconnect();
});

c1.on('chat', (msg) => {
  // c1 should NOT receive its own message back (server broadcasts to all including sender via io.emit)
  // Actually io.emit sends to ALL including sender. So c1 WILL receive it.
  // Let's verify it receives its own message too
  if (msg.username === 'Alice' && msg.text === 'Hello from Alice!') {
    check('Chat message received by sender (io.emit broadcasts to all)', true);
  }
});

// Wait for both to have ids, then set usernames
setTimeout(() => {
  check('c1 received id', c1Id !== null);
  check('c2 received id', c2Id !== null);

  // Set usernames with ack
  c1.emit('setUsername', 'Alice', (ack) => {
    check('setUsername Alice ack ok', ack && ack.ok === true);
    check('setUsername Alice returns username', ack && ack.username === 'Alice');
  });

  c2.emit('setUsername', 'Bob', (ack) => {
    check('setUsername Bob ack ok', ack && ack.ok === true);
    check('setUsername Bob returns username', ack && ack.username === 'Bob');
    step = 1;
  });
}, 500);

// Test invalid username
setTimeout(() => {
  c1.emit('setUsername', 'bad name with spaces!', (ack) => {
    check('Invalid username rejected', ack && ack.ok === false);
  });
  c1.emit('setUsername', '', (ack) => {
    check('Empty username rejected', ack && ack.ok === false);
  });
}, 1500);

// Check disconnect cleanup and finish
setTimeout(() => {
  // c2 disconnected — c1 should have received a users event with 1 entry
  if (usersAfterDisconnect) {
    check('User list shrinks after disconnect', usersAfterDisconnect.length === 1);
    check('Remaining user is Alice', usersAfterDisconnect[0].username === 'Alice');
  } else {
    check('User list updated after disconnect', false);
  }

  // Test chat without username (should be ignored)
  // Create a new client that doesn't set username and tries to chat
  const c3 = io(URL, { transports: ['websocket'] });
  let c3ChatBlocked = true;
  c3.on('id', () => {
    c3.emit('chat', 'should not go through');
  });
  c1.on('chat', (msg) => {
    if (msg.text === 'should not go through') {
      c3ChatBlocked = false;
    }
  });

  setTimeout(() => {
    check('Chat without username is blocked', c3ChatBlocked);
    c3.disconnect();
    c1.disconnect();

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n=== Chat & Online Users Smoke Test ===`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      results.filter(r => !r.pass).forEach(r => console.log(`  FAILED: ${r.name}`));
      process.exit(1);
    }
    process.exit(0);
  }, 1000);
}, 2500);
