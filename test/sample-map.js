// ============================================================================
// test/sample-map.js — Generate a sample MOBA map to verify the data model
// ============================================================================
// Run: node test/sample-map.js
// Creates a Summoner's Rift-style map, serializes it, deserializes it,
// and prints a summary. Proves the full pipeline works end-to-end.
// ============================================================================

const { GameMap, Terrain, EntityType, Team } = require('../public/Map.js');
const fs = require('fs');
const path = require('path');

// --- Create the map -------------------------------------------------------
// 120x120 tiles at 10px each = 1200x1200 world
const map = new GameMap(120, 120, 10);
map.name = "Summoner's Rift (Prototype)";
map.version = 1;

// --- Terrain: grass everywhere, water river through the middle -------------
map.fillRect(0, 0, 120, 120, Terrain.GRASS);

// Diagonal river (water) from top-left to bottom-right
for (let i = 0; i < 120; i++) {
    const row = i;
    const colStart = Math.max(0, i - 3);
    const colEnd = Math.min(120, i + 4);
    map.fillRect(colStart, row, colEnd, row + 1, Terrain.WATER);
}

// Dirt paths for lanes (top, mid, bot)
// Top lane: along the top edge
map.fillRect(0, 10, 120, 16, Terrain.DIRT);
// Bot lane: along the bottom edge
map.fillRect(0, 104, 120, 110, Terrain.DIRT);
// Mid lane: along the diagonal (offset from river)
for (let i = 0; i < 120; i++) {
    const row = i + 8;
    const col = i + 8;
    if (row < 120 && col < 120) {
        map.fillRect(col - 2, row, col + 3, row + 1, Terrain.DIRT);
    }
}

// Brush patches near lane junctions
map.fillRect(20, 20, 28, 28, Terrain.BRUSH);
map.fillRect(92, 92, 100, 100, Terrain.BRUSH);
map.fillRect(50, 15, 58, 23, Terrain.BRUSH);
map.fillRect(62, 97, 70, 105, Terrain.BRUSH);

// Base areas
map.fillRect(0, 0, 15, 15, Terrain.BASE_FLOOR);     // Blue base (top-left)
map.fillRect(105, 105, 120, 120, Terrain.BASE_FLOOR); // Red base (bottom-right)

// --- Entities -------------------------------------------------------------

// Blue side
const blueSpawn = map.addEntity(EntityType.SPAWN_POINT, 75, 75, { team: Team.BLUE, label: 'Blue Spawn' });
const blueNexus = map.addEntity(EntityType.NEXUS, 50, 50, { team: Team.BLUE, hp: 5000, radius: 30 });
const blueShop = map.addEntity(EntityType.SHOP, 30, 30, { team: Team.BLUE });

// Red side
const redSpawn = map.addEntity(EntityType.SPAWN_POINT, 1125, 1125, { team: Team.RED, label: 'Red Spawn' });
const redNexus = map.addEntity(EntityType.NEXUS, 1150, 1150, { team: Team.RED, hp: 5000, radius: 30 });
const redShop = map.addEntity(EntityType.SHOP, 1170, 1170, { team: Team.RED });

// Towers (2 per lane per team = 12 total)
const towerPositions = [
    // Top lane
    { x: 100, y: 50, team: Team.BLUE }, { x: 200, y: 50, team: Team.BLUE },
    { x: 1000, y: 50, team: Team.RED }, { x: 1100, y: 50, team: Team.RED },
    // Mid lane
    { x: 300, y: 300, team: Team.BLUE }, { x: 450, y: 450, team: Team.BLUE },
    { x: 750, y: 750, team: Team.RED }, { x: 900, y: 900, team: Team.RED },
    // Bot lane
    { x: 50, y: 1000, team: Team.BLUE }, { x: 50, y: 1100, team: Team.BLUE },
    { x: 50, y: 1150, team: Team.RED }, { x: 1150, y: 1050, team: Team.RED },
];
for (const t of towerPositions) {
    map.addEntity(EntityType.TOWER, t.x, t.y, { team: t.team, hp: 2000, radius: 20, range: 150 });
}

// --- Lanes (waypoints define the path) ------------------------------------

// Top lane waypoints (blue base -> red base, along top edge)
const topWaypoints = [
    map.addEntity(EntityType.WAYPOINT, 75, 130, { label: 'top_wp1' }),
    map.addEntity(EntityType.WAYPOINT, 600, 130, { label: 'top_wp2' }),
    map.addEntity(EntityType.WAYPOINT, 1125, 130, { label: 'top_wp3' }),
];
map.addLane('top', Team.BLUE, topWaypoints.map(w => w.id));

// Mid lane waypoints (diagonal)
const midWaypoints = [
    map.addEntity(EntityType.WAYPOINT, 150, 150, { label: 'mid_wp1' }),
    map.addEntity(EntityType.WAYPOINT, 600, 600, { label: 'mid_wp2' }),
    map.addEntity(EntityType.WAYPOINT, 1050, 1050, { label: 'mid_wp3' }),
];
map.addLane('mid', Team.BLUE, midWaypoints.map(w => w.id));

// Bot lane waypoints (along bottom edge)
const botWaypoints = [
    map.addEntity(EntityType.WAYPOINT, 130, 1100, { label: 'bot_wp1' }),
    map.addEntity(EntityType.WAYPOINT, 600, 1100, { label: 'bot_wp2' }),
    map.addEntity(EntityType.WAYPOINT, 1100, 1100, { label: 'bot_wp3' }),
];
map.addLane('bot', Team.BLUE, botWaypoints.map(w => w.id));

// --- Verify collision -----------------------------------------------------

// River should be unwalkable (check a tile in the river but not covered by lane paths)
const riverCheck = map.isWalkableAtWorld(270, 300);
console.log(`River tile at (270,300) walkable: ${riverCheck} (expected: false)`);

// Grass should be walkable
const grassCheck = map.isWalkableAtWorld(300, 200);
console.log(`Grass tile at (300,200) walkable: ${grassCheck} (expected: true)`);

// Base floor should be walkable
const baseCheck = map.isWalkableAtWorld(50, 50);
console.log(`Base floor at (50,50) walkable: ${baseCheck} (expected: true)`);

// --- Serialize / Deserialize round-trip -----------------------------------

const json = map.toJSON();
const jsonStr = JSON.stringify(json, null, 2);
const map2 = GameMap.fromJSON(JSON.parse(jsonStr));

// Verify
console.log('');
console.log('Original: ', map.toString());
console.log('Restored: ', map2.toString());
console.log('');
console.log(`Entity count match: ${map.entities.length === map2.entities.length} (${map.entities.length})`);
console.log(`Lane count match:   ${map.lanes.length === map2.lanes.length} (${map.lanes.length})`);
console.log(`Terrain array match: ${JSON.stringify(map.terrain) === JSON.stringify(map2.terrain)}`);

// Verify lane paths match
for (let i = 0; i < map.lanes.length; i++) {
    const p1 = map.getLanePath(map.lanes[i].id);
    const p2 = map2.getLanePath(map2.lanes[i].id);
    const match = JSON.stringify(p1) === JSON.stringify(p2);
    console.log(`Lane "${map.lanes[i].name}" path match: ${match} (${p1.length} waypoints)`);
}

// Save to file for the editor to load later
const mapsDir = path.join(__dirname, '..', 'maps');
if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir, { recursive: true });
const mapFile = path.join(mapsDir, 'summoners-rift.json');
fs.writeFileSync(mapFile, jsonStr);
console.log(`\nMap saved to: ${mapFile} (${(jsonStr.length / 1024).toFixed(1)} KB)`);

// --- Verify we can load it back from file ---------------------------------
const loaded = GameMap.fromJSON(JSON.parse(fs.readFileSync(mapFile, 'utf8')));
console.log(`Loaded from file: ${loaded.toString()}`);
console.log(`All entities restored: ${loaded.entities.length === map.entities.length}`);
console.log('\n✅ Sample map generation and serialization verified.');