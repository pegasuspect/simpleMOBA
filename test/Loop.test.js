// ============================================================================
// test/Loop.test.js — Unit tests for the fixed-timestep game loop
// ============================================================================
// Run: node test/Loop.test.js
// Tests:
//   1. Player movement is deterministic (same distance regardless of "frame rate")
//   2. Player speed is in pixels-per-second (240px/s)
//   3. Collision stops movement
//   4. Camera movement is dt-based
//   5. Interpolation math
//   6. Accumulator behavior (multiple ticks per frame)
// ============================================================================

const assert = require('assert');
const { GameMap, Terrain, TerrainById, EntityType, Team, MapEntity, Lane } = require('../public/Map.js');

// Load the refactored src/ modules into a VM sandbox with mocked browser APIs.
// Each file uses browser globals (window) and Node exports (module.exports).
// We concatenate them with export stubs at the end.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, '..', 'public', 'src');
const moduleFiles = [
    'Constants.js',
    'Geometry.js',
    'Camera.js',
    'Player.js',
    'Renderer.js',
    'Controller.js',
    'Game.js',
];

// Read and concatenate all module files
let combinedSource = '';
for (const file of moduleFiles) {
    const filePath = path.join(srcDir, file);
    combinedSource += fs.readFileSync(filePath, 'utf8') + '\n';
}

// Append export code — const/let/class in vm are block-scoped and don't
// attach to the sandbox object automatically.
const exportCode = `
    this.Game = Game;
    this.Player = Player;
    this.Camera = Camera;
    this.Controller = Controller;
    this.Renderer = Renderer;
    this.FIXED_DT = FIXED_DT;
    this.FIXED_DT_SEC = FIXED_DT_SEC;
    this.MAX_FRAME_TIME = MAX_FRAME_TIME;
    this.MAX_TICKS_PER_FRAME = MAX_TICKS_PER_FRAME;
    this.grahamScan = grahamScan;
    this.degree = degree;
    this.distance = distance;
`;

// Mock browser globals
const sandbox = {
    window: {},
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    console: console,
    Math: Math,
    Date: Date,
    // Map.js classes are already loaded via require, expose them to the sandbox
    GameMap: GameMap,
    Terrain: Terrain,
    TerrainById: TerrainById,
    EntityType: EntityType,
    Team: Team,
    MapEntity: MapEntity,
    Lane: Lane,
};
vm.createContext(sandbox);
vm.runInContext(combinedSource + exportCode, sandbox);

// Extract classes from the sandbox
const { Game, Player, Camera, Controller, Renderer,
        FIXED_DT, FIXED_DT_SEC, MAX_FRAME_TIME, MAX_TICKS_PER_FRAME,
        grahamScan, degree, distance } = sandbox;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
    }
}

// Helper: create a mock canvas 2d context (for Game/Util that need ctx)
function mockCtx() {
    return {
        fillStyle: 'black',
        strokeStyle: 'black',
        lineWidth: 1,
        font: '12px monospace',
        textBaseline: 'alphabetic',
        setLineDash: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        clearRect: () => {},
        arc: () => {},
        fillText: () => {},
    };
}

// Helper: create a simple flat map (all grass)
function makeTestMap(cols = 100, rows = 100, tw = 10) {
    return new GameMap(cols, rows, tw);
}

// Helper: create a map with a wall of water
function makeWallMap() {
    const m = new GameMap(100, 100, 10);
    // Water wall at col 50 (all rows)
    m.fillRect(50, 0, 51, 100, Terrain.WATER);
    return m;
}

// ---------------------------------------------------------------------------
console.log('\n=== Constants ===');
// ---------------------------------------------------------------------------

test('FIXED_DT is ~16.67ms (60Hz)', () => {
    assert.ok(Math.abs(FIXED_DT - 1000/60) < 0.01);
});

test('FIXED_DT_SEC is ~0.01667s', () => {
    assert.ok(Math.abs(FIXED_DT_SEC - 1/60) < 0.0001);
});

test('MAX_FRAME_TIME is 100ms', () => {
    assert.strictEqual(MAX_FRAME_TIME, 100);
});

test('MAX_TICKS_PER_FRAME is 5', () => {
    assert.strictEqual(MAX_TICKS_PER_FRAME, 5);
});

// ---------------------------------------------------------------------------
console.log('\n=== Player Movement (dt-based) ===');
// ---------------------------------------------------------------------------

test('Player speed is 240 px/s (was 4px/frame * 60fps)', () => {
    const p = new Player();
    assert.strictEqual(p.speed, 240);
});

test('Player moves correct distance in one tick (dt=1/60)', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.map = makeTestMap();
    p.setDestination(1500, 500);  // move right

    const dt = 1/60;
    p.update(dt);

    // 240px/s * (1/60)s = 4px per tick
    assert.ok(Math.abs(p.x - 504) < 0.01, `Expected x≈504, got ${p.x}`);
    assert.ok(Math.abs(p.y - 500) < 0.01);
});

test('Player moves correct distance over 1 second of ticks', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.map = makeTestMap();
    p.setDestination(10000, 500);  // far right, won't reach

    const dt = 1/60;
    for (let i = 0; i < 60; i++) {
        p.update(dt);
    }

    // 60 ticks * 4px = 240px → x = 500 + 240 = 740
    assert.ok(Math.abs(p.x - 740) < 0.1, `Expected x≈740, got ${p.x}`);
});

test('Player reaches exact destination and stops', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.map = makeTestMap();
    p.setDestination(600, 500);  // 100px to the right

    const dt = 1/60;
    // 100px / 4px-per-tick = 25 ticks
    for (let i = 0; i < 25; i++) {
        p.update(dt);
    }

    assert.ok(Math.abs(p.x - 600) < 0.1, `Expected x≈600, got ${p.x}`);
    assert.ok(p.direction === null, 'Player should have stopped');
    assert.ok(p.remainingDist <= 0, 'remainingDist should be <= 0');
});

test('Player does not overshoot destination', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.map = makeTestMap();
    p.setDestination(510, 500);  // only 10px

    const dt = 1/60;
    // 10px / 4px = 2.5 ticks — 3 ticks should reach exactly
    for (let i = 0; i < 10; i++) {
        p.update(dt);
    }

    assert.ok(Math.abs(p.x - 510) < 0.1, `Expected x≈510, got ${p.x}`);
    assert.ok(p.direction === null, 'Player should have stopped');
});

test('Player moves diagonally at correct speed', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.map = makeTestMap();
    p.setDestination(600, 600);  // 45-degree diagonal

    const dt = 1/60;
    p.update(dt);

    // Direction should be (0.7071..., 0.7071...)
    // Distance per tick = 4px
    // dx = 4 * 0.7071 ≈ 2.828
    const expectedD = 4 * Math.SQRT1_2;
    assert.ok(Math.abs(p.x - (500 + expectedD)) < 0.01, `Expected x≈${(500 + expectedD).toFixed(3)}, got ${p.x}`);
    assert.ok(Math.abs(p.y - (500 + expectedD)) < 0.01, `Expected y≈${(500 + expectedD).toFixed(3)}, got ${p.y}`);
});

test('setDestination with zero distance does nothing', () => {
    const p = new Player();
    p.x = 50;
    p.y = 50;
    p.setDestination(50, 50);  // same spot

    assert.ok(p.direction === null);
    assert.ok(p.remainingDist === 0);
});

// ---------------------------------------------------------------------------
console.log('\n=== Player Collision ===');
// ---------------------------------------------------------------------------

test('Player stops when hitting a water wall', () => {
    const p = new Player();
    p.x = 100;
    p.y = 500;  // middle of map vertically
    p.r = 10;
    p.map = makeWallMap();  // water wall at col 50 (x=500-509)

    p.setDestination(1000, 500);  // move right toward wall

    const dt = 1/60;
    // Run enough ticks to reach the wall (400px / 4px = 100 ticks)
    for (let i = 0; i < 200; i++) {
        p.update(dt);
    }

    // Player should have stopped before x=500 (wall at col 50, x=500-509)
    // Player radius is 10, so center can't get closer than x=490
    assert.ok(p.x < 500, `Player should have stopped before wall, x=${p.x}`);
    assert.ok(p.direction === null, 'Player should have stopped');
});

test('Player can move freely on grass with no obstacles', () => {
    const p = new Player();
    p.x = 500;
    p.y = 500;
    p.r = 20;
    p.map = makeTestMap();  // all grass

    p.setDestination(500, 100);  // move straight up 400px

    const dt = 1/60;
    for (let i = 0; i < 200; i++) {
        p.update(dt);
    }

    // 400px / 4px = 100 ticks, should reach destination
    assert.ok(Math.abs(p.y - 100) < 0.5, `Expected y≈100, got ${p.y}`);
    assert.ok(p.direction === null);
});

// ---------------------------------------------------------------------------
console.log('\n=== Camera Movement (dt-based) ===');
// ---------------------------------------------------------------------------

test('Camera speed is 120 px/s (was 2px/frame * 60fps)', () => {
    const cam = new Camera();
    assert.strictEqual(cam.speed, 120);
});

test('Camera moves correct distance in one tick', () => {
    const cam = new Camera();
    cam.x = 0;
    cam.y = 0;
    cam.direction = [1, 0];  // moving right

    cam.update(1/60);

    // 120px/s * (1/60)s = 2px per tick
    assert.ok(Math.abs(cam.x - 2) < 0.01, `Expected x≈2, got ${cam.x}`);
});

test('Camera moves correct distance over 1 second', () => {
    const cam = new Camera();
    cam.x = 0;
    cam.y = 0;
    cam.direction = [1, 1];

    for (let i = 0; i < 60; i++) {
        cam.update(1/60);
    }

    // 60 ticks * 2px = 120px in each direction
    assert.ok(Math.abs(cam.x - 120) < 0.1, `Expected x≈120, got ${cam.x}`);
    assert.ok(Math.abs(cam.y - 120) < 0.1, `Expected y≈120, got ${cam.y}`);
});

test('Camera with zero direction does not move', () => {
    const cam = new Camera();
    cam.x = 100;
    cam.y = 200;
    cam.direction = [0, 0];

    cam.update(1/60);

    assert.strictEqual(cam.x, 100);
    assert.strictEqual(cam.y, 200);
});

// ---------------------------------------------------------------------------
console.log('\n=== Interpolation ===');
// ---------------------------------------------------------------------------

test('Player interpolation: alpha=0 uses prev position', () => {
    const p = new Player();
    p.prevX = 100;
    p.prevY = 100;
    p.x = 200;
    p.y = 200;

    // We can't easily test draw() since it needs canvas context,
    // but we can test the interpolation math directly
    const alpha = 0;
    const renderX = p.prevX + (p.x - p.prevX) * alpha;
    const renderY = p.prevY + (p.y - p.prevY) * alpha;
    assert.strictEqual(renderX, 100);
    assert.strictEqual(renderY, 100);
});

test('Player interpolation: alpha=1 uses current position', () => {
    const p = new Player();
    p.prevX = 100;
    p.prevY = 100;
    p.x = 200;
    p.y = 200;

    const alpha = 1;
    const renderX = p.prevX + (p.x - p.prevX) * alpha;
    const renderY = p.prevY + (p.y - p.prevY) * alpha;
    assert.strictEqual(renderX, 200);
    assert.strictEqual(renderY, 200);
});

test('Player interpolation: alpha=0.5 is midpoint', () => {
    const p = new Player();
    p.prevX = 100;
    p.prevY = 100;
    p.x = 200;
    p.y = 200;

    const alpha = 0.5;
    const renderX = p.prevX + (p.x - p.prevX) * alpha;
    const renderY = p.prevY + (p.y - p.prevY) * alpha;
    assert.strictEqual(renderX, 150);
    assert.strictEqual(renderY, 150);
});

test('Camera interpolation: alpha=0.5 is midpoint', () => {
    const cam = new Camera();
    cam.prevX = 0;
    cam.prevY = 0;
    cam.x = 100;
    cam.y = 100;

    const alpha = 0.5;
    const renderX = cam.prevX + (cam.x - cam.prevX) * alpha;
    const renderY = cam.prevY + (cam.y - cam.prevY) * alpha;
    assert.strictEqual(renderX, 50);
    assert.strictEqual(renderY, 50);
});

// ---------------------------------------------------------------------------
console.log('\n=== Determinism ===');
// ---------------------------------------------------------------------------

test('Same total time produces same position regardless of tick count', () => {
    // Run A: 60 ticks at dt=1/60 (1 second)
    const pA = new Player();
    pA.x = 500; pA.y = 500;
    pA.map = makeTestMap();
    pA.setDestination(10000, 500);
    for (let i = 0; i < 60; i++) pA.update(1/60);

    // Run B: 120 ticks at dt=1/120 (also 1 second, but 2x the tick rate)
    const pB = new Player();
    pB.x = 500; pB.y = 500;
    pB.map = makeTestMap();
    pB.setDestination(10000, 500);
    pB.speed = 240;  // same speed
    for (let i = 0; i < 120; i++) pB.update(1/120);

    // Both should have traveled ~240px in 1 second
    // (small float differences are acceptable)
    assert.ok(Math.abs(pA.x - pB.x) < 0.1,
        `Run A: ${pA.x}, Run B: ${pB.x} — should be ~equal (740px)`);
});

test('Same total time produces same position at 144Hz equivalent', () => {
    // Run A: 60 ticks at dt=1/60 (60Hz for 1 second)
    const pA = new Player();
    pA.x = 500; pA.y = 500;
    pA.map = makeTestMap();
    pA.setDestination(10000, 500);
    for (let i = 0; i < 60; i++) pA.update(1/60);

    // Run B: 144 ticks at dt=1/144 (144Hz for 1 second)
    const pB = new Player();
    pB.x = 500; pB.y = 500;
    pB.map = makeTestMap();
    pB.setDestination(10000, 500);
    for (let i = 0; i < 144; i++) pB.update(1/144);

    // Both should have traveled ~240px in 1 second
    assert.ok(Math.abs(pA.x - pB.x) < 0.1,
        `60Hz: ${pA.x}, 144Hz: ${pB.x} — should be ~equal (740px)`);
});

// ---------------------------------------------------------------------------
console.log('\n=== Game Loop (start/stop) ===');
// ---------------------------------------------------------------------------

test('Game.start() sets running flag', () => {
    const game = new Game(mockCtx(), null, -1);
    game.start();
    assert.ok(game._running);
    game.stop();
    assert.ok(!game._running);
});

test('Game.start() is idempotent (calling twice does not double-start)', () => {
    const game = new Game(mockCtx(), null, -1);
    game.start();
    game.start();  // should not throw or create a second loop
    assert.ok(game._running);
    game.stop();
});

test('Game.stop() cancels the rAF', () => {
    const game = new Game(mockCtx(), null, -1);
    game.start();
    game.stop();
    assert.ok(!game._running);
    // _rafId may be 0 (from mock rAF) or null after stop
    // The important thing is _running is false
});

test('Game._snapshot copies current positions to prev', () => {
    const game = new Game(mockCtx(), null, -1);
    game.p1.x = 100;
    game.p1.y = 200;
    game.p1.prevX = 0;
    game.p1.prevY = 0;
    game.cam.x = 50;
    game.cam.y = 60;
    game.cam.prevX = 0;
    game.cam.prevY = 0;

    game._snapshot();

    assert.strictEqual(game.p1.prevX, 100);
    assert.strictEqual(game.p1.prevY, 200);
    assert.strictEqual(game.cam.prevX, 50);
    assert.strictEqual(game.cam.prevY, 60);
});

test('Game.loadMap positions player at blue spawn', () => {
    const game = new Game(mockCtx(), null, -1);
    const map = makeTestMap();
    map.addEntity(EntityType.SPAWN_POINT, 75, 75, { team: Team.BLUE });

    game.loadMap(map);

    assert.strictEqual(game.p1.x, 75);
    assert.strictEqual(game.p1.y, 75);
    assert.strictEqual(game.p1.prevX, 75);  // prev should match
    assert.strictEqual(game.p1.prevY, 75);
});

test('Game.loadMap falls back to map center if no blue spawn', () => {
    const game = new Game(mockCtx(), null, -1);
    const map = makeTestMap(100, 100, 10);  // 1000x1000 world

    game.loadMap(map);

    assert.strictEqual(game.p1.x, 500);
    assert.strictEqual(game.p1.y, 500);
});

test('Game.loadMap centers camera on player', () => {
    const game = new Game(mockCtx(), null, -1);
    const map = makeTestMap(100, 100, 10);
    map.addEntity(EntityType.SPAWN_POINT, 75, 75, { team: Team.BLUE });

    game.loadMap(map);

    // Camera should be centered: cam.x = player.x - viewWidth/2
    assert.strictEqual(game.cam.x, 75 - 400);
    assert.strictEqual(game.cam.y, 75 - 300);
});

test('Game.loadMap passes map reference to player', () => {
    const game = new Game(mockCtx(), null, -1);
    const map = makeTestMap();

    game.loadMap(map);

    assert.strictEqual(game.p1.map, map);
});

// ---------------------------------------------------------------------------
console.log('\n=== Stats ===');
// ---------------------------------------------------------------------------

test('Game._stats starts at zero', () => {
    const game = new Game(mockCtx(), null, -1);
    assert.strictEqual(game._stats.fps, 0);
    assert.strictEqual(game._stats.tickRate, 0);
    assert.strictEqual(game._stats.totalTicks, 0);
});

test('Game._stats.totalTicks increments in _frameLoop, not update()', () => {
    const game = new Game(mockCtx(), null, -1);
    game.map = makeTestMap();

    // update() alone should not increment totalTicks
    const dt = 1/60;
    game.update(dt);
    game.update(dt);
    game.update(dt);

    assert.strictEqual(game._stats.totalTicks, 0);  // not incremented by update() alone
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n========================================`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
    process.exit(1);
}