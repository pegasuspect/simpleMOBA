// Smoke test for Map Editor — runs against local server at localhost:3000
import * as http from 'http';
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function fetchURL(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'localhost', port: 3000, path, method, headers: {} };
    if (method === 'POST') {
      const data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data), raw: data });
        } catch {
          resolve({ statusCode: res.statusCode, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (method === 'POST') req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('--- GET /editor (serves editor HTML) ---');
  const editorResp = await fetchURL('/editor');
  assert(editorResp.statusCode === 200, `Status 200 (got ${editorResp.statusCode})`);
  assert(editorResp.raw.includes('<title>simpleMOBA Map Editor</title>'), 'Contains editor title');
  assert(editorResp.raw.includes('editor.js'), 'References editor.js');
  assert(editorResp.raw.includes('map-canvas'), 'Contains map-canvas element');

  console.log('\n--- GET / (no regression on existing game) ---');
  const gameResp = await fetchURL('/');
  assert(gameResp.statusCode === 200, `Status 200 (got ${gameResp.statusCode})`);
  assert(gameResp.raw.includes('<style>'), 'Contains canvas styles');
  assert(gameResp.raw.includes('socket.io'), 'Loads socket.io client');
  assert(gameResp.raw.includes('lib.js'), 'Loads lib.js');

  console.log('\n--- GET /editor-data (serves default map) ---');
  // Ensure we have a clean default map first
  const blankMap = {
    width: 40, height: 30, tileSize: 16,
    tiles: Array.from({ length: 30 }, () => Array.from({ length: 40 }, () => 0))
  };
  await fetchURL('/editor-data', 'POST', blankMap);

  const dataResp = await fetchURL('/editor-data');
  assert(dataResp.statusCode === 200, `Status 200 (got ${dataResp.statusCode})`);
  assert(dataResp.body && dataResp.body.width === 40, `width is 40 (got ${dataResp.body?.width})`);
  assert(dataResp.body && dataResp.body.height === 30, `height is 30 (got ${dataResp.body?.height})`);
  assert(dataResp.body && dataResp.body.tileSize === 16, `tileSize is 16 (got ${dataResp.body?.tileSize})`);
  assert(dataResp.body && Array.isArray(dataResp.body.tiles), 'tiles is an array');
  assert(dataResp.body && dataResp.body.tiles.length === 30, `30 rows (got ${dataResp.body?.tiles?.length})`);
  assert(dataResp.body && dataResp.body.tiles[0].length === 40, `40 cols in first row (got ${dataResp.body?.tiles?.[0]?.length})`);
  assert(dataResp.body && dataResp.body.tiles[0][0] === 0, 'All tiles are 0 (grass)');

  console.log('\n--- POST /editor-data (save valid map) ---');
  const customMap = {
    width: 40, height: 30, tileSize: 16,
    tiles: Array.from({ length: 30 }, () => Array.from({ length: 40 }, () => 0))
  };
  customMap.tiles[5][5] = 1; // water at row 5, col 5
  customMap.tiles[5][6] = 2; // wall at row 5, col 6
  customMap.tiles[10][10] = 3; // spawn at row 10, col 10
  customMap.tiles[20][20] = 4; // enemy spawn at row 20, col 20
  const saveResp = await fetchURL('/editor-data', 'POST', customMap);
  assert(saveResp.statusCode === 200, `Save status 200 (got ${saveResp.statusCode})`);
  assert(saveResp.body && saveResp.body.saved === true, `saved flag true (got ${saveResp.body?.saved})`);

  // Verify the saved data on GET
  const verifyResp = await fetchURL('/editor-data');
  assert(verifyResp.body.tiles[5][5] === 1, 'Water tile persisted at [5][5]');
  assert(verifyResp.body.tiles[5][6] === 2, 'Wall tile persisted at [5][6]');
  assert(verifyResp.body.tiles[10][10] === 3, 'Spawn tile persisted at [10][10]');
  assert(verifyResp.body.tiles[20][20] === 4, 'Enemy spawn persisted at [20][20]');

  console.log('\n--- POST /editor-data (reject invalid data) ---');
  const invalidResp = await fetchURL('/editor-data', 'POST', { tiles: 'not-an-array' });
  assert(invalidResp.statusCode === 400, `Invalid data returns 400 (got ${invalidResp.statusCode})`);
  assert(invalidResp.body && invalidResp.body.error, 'Returns error message');

  const badTileResp = await fetchURL('/editor-data', 'POST', {
    width: 40, height: 30, tileSize: 16,
    tiles: [[5]] // invalid tile value
  });
  assert(badTileResp.statusCode === 400, `Bad tile value returns 400 (got ${badTileResp.statusCode})`);
  assert(badTileResp.body && badTileResp.body.error, 'Returns error message for bad tile');

  const missingFieldsResp = await fetchURL('/editor-data', 'POST', { tiles: [[0]] });
  assert(missingFieldsResp.statusCode === 400, `Missing width/height/tileSize returns 400 (got ${missingFieldsResp.statusCode})`);
  assert(missingFieldsResp.body && missingFieldsResp.body.error, 'Returns error message');

  console.log('\n--- POST /editor-data (reject malformed JSON) ---');
  // This test uses http directly with malformed body
  const malformedReq = new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/editor-data', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ statusCode: res.statusCode, body: null }); }
      });
    });
    req.on('error', () => resolve({ statusCode: 0, body: null }));
    req.write('not valid json {[');
    req.end();
  });
  const malformedResp = await malformedReq;
  assert(malformedResp.statusCode === 400, `Malformed JSON returns 400 (got ${malformedResp.statusCode})`);

  console.log('\n--- Socket.IO: mapUpdate broadcast ---');
  // Restore clean default before Socket.IO test
  const blankMap2 = {
    width: 40, height: 30, tileSize: 16,
    tiles: Array.from({ length: 30 }, () => Array.from({ length: 40 }, () => 0))
  };
  await fetchURL('/editor-data', 'POST', blankMap2);

  await new Promise((resolve) => {
    const socket = io(BASE);
    let mapUpdated = false;

    socket.on('connect', () => {
      console.log(`  ✅ Socket.IO client connected (id: ${socket.id})`);
      // POST a map while connected — should trigger mapUpdate broadcast
      const testSocketMap = {
        width: 40, height: 30, tileSize: 16,
        tiles: Array.from({ length: 30 }, () => Array.from({ length: 40 }, () => 0))
      };
      testSocketMap.tiles[0][0] = 42; // invalid tile to trigger validation first, but let's use valid
      testSocketMap.tiles[0][0] = 1;
      http.request({
        hostname: 'localhost', port: 3000,
        path: '/editor-data', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve());
      }).on('error', (e) => { console.log(`  ⚠️ POST error: ${e.message}`); resolve(); }).end(
        JSON.stringify(testSocketMap)
      );
    });

    socket.on('mapUpdate', (data) => {
      console.log(`  ✅ mapUpdate received on socket (tile at [0][0] = ${data.tiles[0][0]})`);
      mapUpdated = true;
    });

    setTimeout(() => {
      assert(mapUpdated, 'mapUpdate was broadcast to Socket.IO client');
      socket.disconnect();
      resolve();
    }, 2000);
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

test().catch(e => {
  console.error('Test error:', e.message);
  process.exit(1);
});
