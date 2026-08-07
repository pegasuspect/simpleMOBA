// End-to-end integration test: verifies the server serves the map JSON
// and the client-side code can load it into a GameMap.
// Run: node test/integration.js

const http = require('http');
const { GameMap, Terrain, EntityType, Team } = require('../public/Map.js');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    const BASE = 'http://localhost:3000';
    let passed = 0, failed = 0;

    function check(name, cond) {
        if (cond) { passed++; console.log(`  ✓ ${name}`); }
        else { failed++; console.log(`  ✗ ${name}`); }
    }

    console.log('\n=== Integration: Map Endpoint ===');

    // 1. Map list
    const maps = await fetchJSON(`${BASE}/maps`);
    check('Map list returns array with summoners-rift', Array.isArray(maps) && maps.includes('summoners-rift'));

    // 2. Fetch the map JSON
    const mapData = await fetchJSON(`${BASE}/maps/summoners-rift.json`);
    check('Map JSON has name field', mapData.name === "Summoner's Rift (Prototype)");
    check('Map JSON has correct dimensions', mapData.cols === 120 && mapData.rows === 120);
    check('Map JSON has terrain array', Array.isArray(mapData.terrain) && mapData.terrain.length === 14400);
    check('Map JSON has entities', Array.isArray(mapData.entities) && mapData.entities.length === 27);
    check('Map JSON has lanes', Array.isArray(mapData.lanes) && mapData.lanes.length === 3);

    // 3. Deserialize into GameMap (same as the browser does)
    const map = GameMap.fromJSON(mapData);
    check('GameMap deserialized with correct name', map.name === "Summoner's Rift (Prototype)");
    check('GameMap has correct world dimensions', map.worldWidth === 1200 && map.worldHeight === 1200);
    check('GameMap has 27 entities', map.entities.length === 27);
    check('GameMap has 3 lanes', map.lanes.length === 3);

    // 4. Verify entities are accessible
    const towers = map.getEntitiesByType(EntityType.TOWER);
    check('Map has 12 towers', towers.length === 12);

    const nexuses = map.getEntitiesByType(EntityType.NEXUS);
    check('Map has 2 nexuses', nexuses.length === 2);

    const blueSpawns = map.getEntitiesByType(EntityType.SPAWN_POINT)
        .filter(e => e.props.team === Team.BLUE);
    check('Map has 1 blue spawn point', blueSpawns.length === 1);

    // 5. Verify lane paths
    const topLane = map.lanes.find(l => l.name === 'top');
    const topPath = map.getLanePath(topLane.id);
    check('Top lane has 3 waypoints', topPath.length === 3);
    check('Top lane starts at blue spawn area', topPath[0].x < 200 && topPath[0].y < 200);
    check('Top lane ends at red base area', topPath[2].x > 1000 && topPath[2].y < 200);

    // 6. Verify collision (river is unwalkable)
    check('River tile at (270,300) is unwalkable', !map.isWalkableAtWorld(270, 300));
    check('Grass tile at (300,200) is walkable', map.isWalkableAtWorld(300, 200));
    check('Base floor at (50,50) is walkable', map.isWalkableAtWorld(50, 50));

    // 7. Verify player circle collision
    check('Player (r=20) can fit at grass (300,200)', map.canCircleFit(300, 200, 20));
    check('Player (r=20) cannot fit at river (270,300)', !map.canCircleFit(270, 300, 20));

    // 8. Verify spawn point is on walkable terrain
    const spawn = blueSpawns[0];
    check('Blue spawn is on walkable terrain', map.isWalkableAtWorld(spawn.x, spawn.y));

    console.log(`\n========================================`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});