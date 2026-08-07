// Smoke test: connect a socket client, verify position broadcast still works
// alongside the new map serving endpoints.
const io = require('socket.io-client');
const http = require('http');
const { GameMap } = require('../public/Map.js');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    // 1. Load the map (simulating what the browser does)
    const mapData = await fetchJSON('http://localhost:3000/maps/summoners-rift.json');
    const map = GameMap.fromJSON(mapData);
    console.log(`Map loaded: ${map.toString()}`);

    // 2. Connect a socket client
    const socket = io('http://localhost:3000');
    let connected = false;
    let gotId = false;
    let gotPositions = false;

    await new Promise((resolve) => {
        socket.on('connect', () => {
            connected = true;
            console.log(`✓ Socket connected: ${socket.id}`);
        });

        socket.on('id', (id) => {
            gotId = true;
            console.log(`✓ Received player id: ${id}`);

            // Simulate a position update (player at blue spawn)
            const spawn = map.getEntitiesByType('spawn_point')[0];
            socket.emit('position', { x: spawn.x, y: spawn.y, id });
            console.log(`✓ Sent position: (${spawn.x}, ${spawn.y})`);
        });

        socket.on('position', (players) => {
            gotPositions = true;
            console.log(`✓ Received position broadcast: ${players.length} player(s)`);
            console.log(`  Players: ${JSON.stringify(players)}`);
            resolve();
        });

        setTimeout(() => {
            console.log('Timeout waiting for position broadcast');
            resolve();
        }, 3000);
    });

    socket.disconnect();

    console.log('\n=== Smoke Test Results ===');
    console.log(`  Connected:     ${connected ? '✓' : '✗'}`);
    console.log(`  Got player ID: ${gotId ? '✓' : '✗'}`);
    console.log(`  Got positions:  ${gotPositions ? '✓' : '✗'}`);

    if (connected && gotId && gotPositions) {
        console.log('\n✅ All systems operational: map loading + multiplayer');
        process.exit(0);
    } else {
        console.log('\n❌ Smoke test failed');
        process.exit(1);
    }
}

main().catch(err => { console.error(err); process.exit(1); });