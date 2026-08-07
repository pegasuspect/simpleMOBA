// Smoke test: chat + online users functionality
// Requires server running on port 3000.
const io = require('socket.io-client');

const URL = 'http://localhost:3000';
const results = [];

function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
}

function connectClient() {
  return new Promise((resolve) => {
    const sock = io(URL, { transports: ['websocket'] });
    sock.on('id', (id) => resolve({ sock, id }));
  });
}

function setUsername(sock, name) {
  return new Promise((resolve) => {
    sock.emit('setUsername', name, (ack) => resolve(ack));
  });
}

// Track the latest user list seen by a socket
function trackUsers(sock) {
  let latest = null;
  sock.on('users', (list) => { latest = list; });
  return {
    get: () => latest,
    waitNext: () => new Promise((resolve) => {
      sock.once('users', (list) => resolve(list));
    }),
  };
}

async function main() {
  // 1. Connect two clients
  const { sock: c1, id: c1Id } = await connectClient();
  const { sock: c2, id: c2Id } = await connectClient();

  check('c1 received id', c1Id !== null);
  check('c2 received id', c2Id !== null);

  // Set up user list trackers BEFORE setting usernames
  const c1Users = trackUsers(c1);

  // 2. Set usernames sequentially
  const ack1 = await setUsername(c1, 'Alice');
  check('setUsername Alice ack ok', ack1 && ack1.ok === true);
  check('setUsername Alice returns username', ack1 && ack1.username === 'Alice');

  const ack2 = await setUsername(c2, 'Bob');
  check('setUsername Bob ack ok', ack2 && ack2.ok === true);
  check('setUsername Bob returns username', ack2 && ack2.username === 'Bob');

  // Wait a tick for the broadcast to arrive
  await new Promise(r => setTimeout(r, 200));

  // 3. Verify user list
  const userList = c1Users.get();
  check('User list received after joins', userList !== null);
  if (userList) {
    const hasAlice = userList.some(u => u.username === 'Alice');
    const hasBob = userList.some(u => u.username === 'Bob');
    check('User list contains Alice after join', hasAlice);
    check('User list contains Bob after join', hasBob);
    check('User list has 2 entries', userList.length === 2);
  }

  // 4. Send a chat message from c1, verify c2 receives it
  const chatReceived = new Promise((resolve) => {
    c2.once('chat', (msg) => resolve(msg));
  });
  c1.emit('chat', 'Hello from Alice!');

  const msg = await chatReceived;
  check('Chat message received by other client', msg.username === 'Alice' && msg.text === 'Hello from Alice!');
  check('Chat message has id field', typeof msg.id === 'number');
  check('Chat message has timestamp', typeof msg.timestamp === 'number');

  // 5. Disconnect c2, verify c1 sees updated user list
  const disconnectPromise = c1Users.waitNext();
  c2.disconnect();
  const afterDisconnect = await disconnectPromise;
  check('User list updated after disconnect', afterDisconnect !== null);
  check('User list shrinks after disconnect', afterDisconnect.length === 1);
  check('Remaining user is Alice', afterDisconnect[0] && afterDisconnect[0].username === 'Alice');

  // 6. Test invalid username
  const badAck = await setUsername(c1, 'bad name with spaces!');
  check('Invalid username rejected', badAck && badAck.ok === false);

  const emptyAck = await setUsername(c1, '');
  check('Empty username rejected', emptyAck && emptyAck.ok === false);

  // 7. Test chat without username (should be blocked)
  const { sock: c3 } = await connectClient();
  let c3ChatBlocked = true;
  c1.once('chat', (m) => {
    if (m.text === 'should not go through') c3ChatBlocked = false;
  });
  c3.emit('chat', 'should not go through');
  await new Promise(r => setTimeout(r, 500));
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
}

main().catch(err => {
  console.error('Chat smoke test failed:', err);
  process.exit(1);
});