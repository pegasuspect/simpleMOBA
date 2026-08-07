// ============================================================================
// test/Editor.test.js — Unit tests for the MapEditor
// ============================================================================
// Run: node test/Editor.test.js
// Tests terrain painting, fill, entity placement, selection, lane editing,
// zoom, coordinate conversions, and save/load wiring.
// ============================================================================

const assert = require('assert');
const { GameMap, Terrain, TerrainById, EntityType, Team, MapEntity, Lane } = require('../public/Map.js');

// Load src/ modules into a VM sandbox
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, '..', 'public', 'src');
const moduleFiles = ['Constants.js', 'Geometry.js', 'Camera.js', 'Player.js', 'Renderer.js', 'Controller.js', 'Game.js', 'MapEditor.js'];

let combinedSource = '';
for (const file of moduleFiles) {
    combinedSource += fs.readFileSync(path.join(srcDir, file), 'utf8') + '\n';
}

const exportCode = `
    this.MapEditor = MapEditor;
    this.Camera = Camera;
    this.GameMap = GameMap;
`;

const sandbox = {
    window: {}, performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    console: console, Math: Math, Date: Date,
    GameMap, Terrain, TerrainById, EntityType, Team, MapEntity, Lane,
    // Mock document for _updateInfo() calls
    document: {
        getElementById: () => null,
    },
};
vm.createContext(sandbox);
vm.runInContext(combinedSource + exportCode, sandbox);

const { MapEditor, Camera } = sandbox;

let passed = 0, let_failed = 0;

function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { let_failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

// Mock canvas context
function mockCtx() {
    return {
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: 'alphabetic', textAlign: 'left',
        setLineDash: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
        closePath: () => {}, stroke: () => {}, fill: () => {}, fillRect: () => {}, strokeRect: () => {},
        clearRect: () => {}, arc: () => {}, fillText: () => {}, save: () => {}, restore: () => {},
    };
}

function mockCanvas(w = 800, h = 600) {
    const ctx = mockCtx();
    return {
        width: w, height: h, getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
        addEventListener: () => {}, style: {},
    };
}

function makeEditor() {
    const canvas = mockCanvas();
    const mmCanvas = mockCanvas(180, 180);
    const editor = new MapEditor(canvas, mmCanvas);
    editor.map = new GameMap(50, 50, 10);
    return editor;
}

// ---------------------------------------------------------------------------
console.log('\n=== Construction ===');
// ---------------------------------------------------------------------------

test('MapEditor constructs with canvas and minimap', () => {
    const editor = makeEditor();
    assert.ok(editor.canvas);
    assert.ok(editor.minimapCanvas);
    assert.strictEqual(editor.zoom, 1);
    assert.strictEqual(editor.tool, 'brush');
});

// ---------------------------------------------------------------------------
console.log('\n=== Coordinate Conversions (with zoom) ===');
// ---------------------------------------------------------------------------

test('screenToWorld at zoom=1', () => {
    const e = makeEditor();
    e.cam.x = 100; e.cam.y = 200;
    const w = e.screenToWorld(50, 60);
    assert.strictEqual(w.x, 150);
    assert.strictEqual(w.y, 260);
});

test('screenToWorld at zoom=2', () => {
    const e = makeEditor();
    e.cam.x = 100; e.cam.y = 200;
    e.zoom = 2;
    const w = e.screenToWorld(50, 60);
    assert.strictEqual(w.x, 125);   // 100 + 50/2
    assert.strictEqual(w.y, 230);   // 200 + 60/2
});

test('worldToScreen at zoom=1', () => {
    const e = makeEditor();
    e.cam.x = 100; e.cam.y = 200;
    const s = e.worldToScreen(150, 260);
    assert.strictEqual(s.x, 50);
    assert.strictEqual(s.y, 60);
});

test('worldToScreen at zoom=2', () => {
    const e = makeEditor();
    e.cam.x = 100; e.cam.y = 200;
    e.zoom = 2;
    const s = e.worldToScreen(125, 230);
    assert.strictEqual(s.x, 50);    // (125-100)*2
    assert.strictEqual(s.y, 60);    // (230-200)*2
});

// ---------------------------------------------------------------------------
console.log('\n=== Terrain Painting ===');
// ---------------------------------------------------------------------------

test('Paint single tile with brush size 1', () => {
    const e = makeEditor();
    e.brushSize = 1;
    e.selectedTerrain = Terrain.WATER;
    e._paintAt(250, 250, Terrain.WATER);
    const { col, row } = e.map.worldToGrid(250, 250);
    assert.strictEqual(e.map.getTerrain(col, row), Terrain.WATER);
});

test('Paint 3x3 with brush size 3', () => {
    const e = makeEditor();
    e.brushSize = 3;
    e._paintAt(250, 250, Terrain.ROCK);
    const { col, row } = e.map.worldToGrid(250, 250);
    // Center + 8 neighbors
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            assert.strictEqual(e.map.getTerrain(col + dc, row + dr), Terrain.ROCK);
        }
    }
});

test('Paint respects map bounds', () => {
    const e = makeEditor();
    e.brushSize = 3;
    // Paint at edge corner
    e._paintAt(0, 0, Terrain.WATER);
    // Should not throw, tiles at negative coords are skipped
    assert.strictEqual(e.map.getTerrain(0, 0), Terrain.WATER);
});

test('Erase paints grass', () => {
    const e = makeEditor();
    e.map.fillRect(0, 0, 50, 50, Terrain.WATER);
    e._eraseAt(250, 250);
    const { col, row } = e.map.worldToGrid(250, 250);
    assert.strictEqual(e.map.getTerrain(col, row), Terrain.GRASS);
});

// ---------------------------------------------------------------------------
console.log('\n=== Flood Fill ===');
// ---------------------------------------------------------------------------

test('Flood fill replaces connected region', () => {
    const e = makeEditor();
    // All grass. Fill center with water
    e._floodFill(25, 25, Terrain.WATER.id);
    assert.strictEqual(e.map.getTerrain(25, 25), Terrain.WATER);
    assert.strictEqual(e.map.getTerrain(0, 0), Terrain.WATER); // all connected
});

test('Flood fill stops at different terrain', () => {
    const e = makeEditor();
    // Create a wall
    e.map.fillRect(25, 0, 26, 50, Terrain.ROCK);
    // Fill left half with water
    e._floodFill(10, 25, Terrain.WATER.id);
    assert.strictEqual(e.map.getTerrain(10, 25), Terrain.WATER);
    assert.strictEqual(e.map.getTerrain(30, 25), Terrain.GRASS); // right side untouched
});

test('Flood fill same terrain does nothing', () => {
    const e = makeEditor();
    // All grass — fill with grass
    e._floodFill(25, 25, Terrain.GRASS.id);
    // Should be no change
    assert.strictEqual(e.map.getTerrain(25, 25), Terrain.GRASS);
});

// ---------------------------------------------------------------------------
console.log('\n=== Entity Placement ===');
// ---------------------------------------------------------------------------

test('Place entity at world position', () => {
    const e = makeEditor();
    e.selectedEntityType = EntityType.TOWER;
    e.selectedTeam = Team.BLUE;
    e._placeEntity(250, 300);
    assert.strictEqual(e.map.entities.length, 1);
    assert.strictEqual(e.map.entities[0].type, EntityType.TOWER);
    assert.strictEqual(e.map.entities[0].x, 250);
    assert.strictEqual(e.map.entities[0].y, 300);
    assert.strictEqual(e.map.entities[0].props.team, Team.BLUE);
});

test('Place entity selects it', () => {
    const e = makeEditor();
    e._placeEntity(250, 300);
    assert.strictEqual(e.selectedEntity, e.map.entities[0]);
});

test('Place waypoint auto-adds to lane buffer', () => {
    const e = makeEditor();
    e.selectedEntityType = EntityType.WAYPOINT;
    e._placeEntity(100, 100);
    assert.strictEqual(e.laneWaypoints.length, 1);
    assert.strictEqual(e.laneWaypoints[0], e.map.entities[0].id);
});

// ---------------------------------------------------------------------------
console.log('\n=== Entity Selection ===')
// ---------------------------------------------------------------------------

test('Find entity at position', () => {
    const e = makeEditor();
    e.map.addEntity(EntityType.TOWER, 250, 300, { radius: 15 });
    const found = e._findEntityAt(255, 305);  // within radius
    assert.ok(found);
    assert.strictEqual(found.type, EntityType.TOWER);
});

test('Find entity returns null for empty area', () => {
    const e = makeEditor();
    e.map.addEntity(EntityType.TOWER, 250, 300, { radius: 15 });
    const found = e._findEntityAt(400, 400);
    assert.strictEqual(found, null);
});

test('Find entity picks topmost (last drawn)', () => {
    const e = makeEditor();
    const e1 = e.map.addEntity(EntityType.TOWER, 250, 300, { radius: 15 });
    const e2 = e.map.addEntity(EntityType.NEXUS, 250, 300, { radius: 15 });
    const found = e._findEntityAt(250, 300);
    assert.strictEqual(found.id, e2.id);  // last one
});

test('Delete selected entity removes it', () => {
    const e = makeEditor();
    const ent = e.map.addEntity(EntityType.TOWER, 250, 300, { radius: 15 });
    e.selectedEntity = ent;
    e._deleteSelected();
    assert.strictEqual(e.map.entities.length, 0);
    assert.strictEqual(e.selectedEntity, null);
});

// ---------------------------------------------------------------------------
console.log('\n=== Lane Editing ===')
// ---------------------------------------------------------------------------

test('Finalize lane creates lane from waypoints', () => {
    const e = makeEditor();
    e.selectedEntityType = EntityType.WAYPOINT;
    e._placeEntity(100, 100);
    e._placeEntity(200, 200);
    e._placeEntity(300, 100);
    assert.strictEqual(e.laneWaypoints.length, 3);
    e._finalizeLane();
    assert.strictEqual(e.map.lanes.length, 1);
    assert.strictEqual(e.map.lanes[0].waypointIds.length, 3);
    assert.strictEqual(e.laneWaypoints.length, 0); // cleared
});

test('Finalize lane with < 2 waypoints does nothing', () => {
    const e = makeEditor();
    e.selectedEntityType = EntityType.WAYPOINT;
    e._placeEntity(100, 100);
    e._finalizeLane();
    assert.strictEqual(e.map.lanes.length, 0);
    assert.strictEqual(e.laneWaypoints.length, 1); // not cleared
});

// ---------------------------------------------------------------------------
console.log('\n=== Zoom ===')
// ---------------------------------------------------------------------------

test('Zoom in increases zoom factor', () => {
    const e = makeEditor();
    e.zoomAt(2, 400, 300);
    assert.strictEqual(e.zoom, 2);
});

test('Zoom out decreases zoom factor', () => {
    const e = makeEditor();
    e.zoom = 2;
    e.zoomAt(0.5, 400, 300);
    assert.strictEqual(e.zoom, 1);
});

test('Zoom clamped to minimum 0.2', () => {
    const e = makeEditor();
    e.zoomAt(0.01, 400, 300);
    assert.strictEqual(e.zoom, 0.2);
});

test('Zoom clamped to maximum 8', () => {
    const e = makeEditor();
    e.zoomAt(100, 400, 300);
    assert.strictEqual(e.zoom, 8);
});

test('Zoom toward cursor keeps world point under cursor', () => {
    const e = makeEditor();
    e.cam.x = 100; e.cam.y = 200;
    const worldBefore = e.screenToWorld(400, 300);
    e.zoomAt(2, 400, 300);
    const worldAfter = e.screenToWorld(400, 300);
    assert.ok(Math.abs(worldBefore.x - worldAfter.x) < 0.01);
    assert.ok(Math.abs(worldBefore.y - worldAfter.y) < 0.01);
});

// ---------------------------------------------------------------------------
console.log('\n=== New Map / Load Map ===')
// ---------------------------------------------------------------------------

test('newMap creates a GameMap with correct dimensions', () => {
    const e = makeEditor();
    e.newMap(100, 80, 12, 'TestMap');
    assert.strictEqual(e.map.cols, 100);
    assert.strictEqual(e.map.rows, 80);
    assert.strictEqual(e.map.tileWidth, 12);
    assert.strictEqual(e.map.name, 'TestMap');
});

test('loadMap sets map and centers camera', () => {
    const e = makeEditor();
    const map = new GameMap(50, 50, 10);
    e.loadMap(map);
    assert.strictEqual(e.map, map);
    // Camera should be centered
    assert.ok(Math.abs(e.cam.x - (map.worldWidth / 2 - e.viewWidth / 2)) < 1);
    assert.ok(Math.abs(e.cam.y - (map.worldHeight / 2 - e.viewHeight / 2)) < 1);
});

// ---------------------------------------------------------------------------
console.log(`\n========================================`);
console.log(`  Results: ${passed} passed, ${let_failed} failed`);
console.log(`========================================\n`);

if (let_failed > 0) process.exit(1);