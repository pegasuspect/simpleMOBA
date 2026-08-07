// ============================================================================
// test/Map.test.js — Unit tests for the Map data model
// ============================================================================
// Run: node test/Map.test.js
// Uses Node's built-in assert — no test framework dependency needed.
// ============================================================================

const assert = require('assert');
const {
    Terrain, TerrainById, EntityType, Team,
    MapEntity, Lane, GameMap,
} = require('../public/Map.js');

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

function approxEqual(a, b, eps = 0.001) {
    return Math.abs(a - b) < eps;
}

// ---------------------------------------------------------------------------
console.log('\n=== Terrain Enum ===');
// ---------------------------------------------------------------------------

test('Terrain has expected types with ids, names, walkable flags, and colors', () => {
    assert.strictEqual(Terrain.GRASS.id, 1);
    assert.strictEqual(Terrain.GRASS.name, 'grass');
    assert.strictEqual(Terrain.GRASS.walkable, true);
    assert.ok(Terrain.GRASS.color.startsWith('#'));

    assert.strictEqual(Terrain.WATER.walkable, false);
    assert.strictEqual(Terrain.ROCK.walkable, false);
    assert.strictEqual(Terrain.BRUSH.walkable, true);
});

test('TerrainById reverse lookup works for all terrain types', () => {
    for (const t of Object.values(Terrain)) {
        assert.strictEqual(TerrainById[t.id], t);
    }
});

// ---------------------------------------------------------------------------
console.log('\n=== GameMap Construction ===');
// ---------------------------------------------------------------------------

test('Constructor sets dimensions correctly', () => {
    const m = new GameMap(80, 60, 10);
    assert.strictEqual(m.cols, 80);
    assert.strictEqual(m.rows, 60);
    assert.strictEqual(m.tileWidth, 10);
    assert.strictEqual(m.tileHeight, 10);
    assert.strictEqual(m.worldWidth, 800);
    assert.strictEqual(m.worldHeight, 600);
});

test('Constructor defaults tileHeight to tileWidth', () => {
    const m = new GameMap(10, 10, 16);
    assert.strictEqual(m.tileHeight, 16);
});

test('Constructor fills terrain with GRASS by default', () => {
    const m = new GameMap(5, 5, 10);
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            assert.strictEqual(m.getTerrain(col, row), Terrain.GRASS);
        }
    }
});

test('Constructor rejects invalid dimensions', () => {
    assert.throws(() => new GameMap(0, 10, 10), RangeError);
    assert.throws(() => new GameMap(10, -1, 10), RangeError);
    assert.throws(() => new GameMap(10, 10, 0), RangeError);
    assert.throws(() => new GameMap(10, 10, -5), RangeError);
    assert.throws(() => new GameMap(3.5, 10, 10), RangeError);
});

// ---------------------------------------------------------------------------
console.log('\n=== Coordinate Conversions ===');
// ---------------------------------------------------------------------------

test('worldToGrid converts pixel coords to tile indices', () => {
    const m = new GameMap(80, 60, 10);
    const { col, row } = m.worldToGrid(35, 42);
    assert.strictEqual(col, 3);
    assert.strictEqual(row, 4);
});

test('worldToGrid handles edge cases (0,0 and max)', () => {
    const m = new GameMap(80, 60, 10);
    assert.deepStrictEqual(m.worldToGrid(0, 0), { col: 0, row: 0 });
    assert.deepStrictEqual(m.worldToGrid(799, 599), { col: 79, row: 59 });
});

test('gridToWorld returns top-left corner of tile', () => {
    const m = new GameMap(80, 60, 10);
    assert.deepStrictEqual(m.gridToWorld(3, 4), { x: 30, y: 40 });
});

test('gridToWorldCenter returns center of tile', () => {
    const m = new GameMap(80, 60, 10);
    assert.deepStrictEqual(m.gridToWorldCenter(3, 4), { x: 35, y: 45 });
});

test('Non-square tiles: worldToGrid and gridToWorld are consistent', () => {
    const m = new GameMap(10, 10, 20, 8);
    const { col, row } = m.worldToGrid(55, 25);
    assert.strictEqual(col, 2);   // 55/20 = 2.75 -> floor 2
    assert.strictEqual(row, 3);   // 25/8 = 3.125 -> floor 3
    assert.deepStrictEqual(m.gridToWorld(2, 3), { x: 40, y: 24 });
    assert.deepStrictEqual(m.gridToWorldCenter(2, 3), { x: 50, y: 28 });
});

// ---------------------------------------------------------------------------
console.log('\n=== Bounds Checking ===');
// ---------------------------------------------------------------------------

test('inBounds returns true for valid grid coords, false for out-of-range', () => {
    const m = new GameMap(5, 5, 10);
    assert.ok(m.inBounds(0, 0));
    assert.ok(m.inBounds(4, 4));
    assert.ok(!m.inBounds(5, 0));
    assert.ok(!m.inBounds(0, 5));
    assert.ok(!m.inBounds(-1, 0));
    assert.ok(!m.inBounds(0, -1));
});

test('inWorldBounds checks pixel range', () => {
    const m = new GameMap(5, 5, 10);
    assert.ok(m.inWorldBounds(0, 0));
    assert.ok(m.inWorldBounds(49, 49));
    assert.ok(!m.inWorldBounds(50, 0));
    assert.ok(!m.inWorldBounds(0, 50));
    assert.ok(!m.inWorldBounds(-1, 0));
});

// ---------------------------------------------------------------------------
console.log('\n=== Terrain Access ===');
// ---------------------------------------------------------------------------

test('setTerrain / getTerrain round-trip', () => {
    const m = new GameMap(5, 5, 10);
    m.setTerrain(2, 3, Terrain.WATER);
    assert.strictEqual(m.getTerrain(2, 3), Terrain.WATER);
    assert.strictEqual(m.getTerrain(0, 0), Terrain.GRASS); // untouched
});

test('getTerrainId returns raw id without object lookup', () => {
    const m = new GameMap(5, 5, 10);
    m.setTerrain(1, 1, Terrain.ROCK);
    assert.strictEqual(m.getTerrainId(1, 1), Terrain.ROCK.id);
});

test('setTerrainAtWorld converts and sets correctly', () => {
    const m = new GameMap(80, 60, 10);
    m.setTerrainAtWorld(35, 42, Terrain.WATER);
    assert.strictEqual(m.getTerrain(3, 4), Terrain.WATER);
});

test('setTerrainAtWorld ignores out-of-bounds silently', () => {
    const m = new GameMap(5, 5, 10);
    m.setTerrainAtWorld(999, 999, Terrain.WATER);
    // Should not throw, should not change anything
    assert.strictEqual(m.getTerrain(0, 0), Terrain.GRASS);
});

test('setTerrain throws on out-of-bounds grid coords', () => {
    const m = new GameMap(5, 5, 10);
    assert.throws(() => m.setTerrain(10, 10, Terrain.WATER), RangeError);
    assert.throws(() => m.getTerrain(10, 10), RangeError);
});

test('setTerrain rejects invalid terrain object', () => {
    const m = new GameMap(5, 5, 10);
    assert.throws(() => m.setTerrain(0, 0, null), TypeError);
    assert.throws(() => m.setTerrain(0, 0, { name: 'bad' }), TypeError);
});

test('fillRect fills a rectangular region', () => {
    const m = new GameMap(10, 10, 10);
    m.fillRect(2, 2, 5, 5, Terrain.WATER);
    // Inside the rect: WATER
    assert.strictEqual(m.getTerrain(2, 2), Terrain.WATER);
    assert.strictEqual(m.getTerrain(4, 4), Terrain.WATER);
    // Outside: still GRASS
    assert.strictEqual(m.getTerrain(1, 1), Terrain.GRASS);
    assert.strictEqual(m.getTerrain(5, 5), Terrain.GRASS); // exclusive end
});

test('fillRect clamps to map bounds', () => {
    const m = new GameMap(5, 5, 10);
    // Should not throw even though rect extends beyond map
    m.fillRect(-5, -5, 10, 10, Terrain.ROCK);
    assert.strictEqual(m.getTerrain(0, 0), Terrain.ROCK);
    assert.strictEqual(m.getTerrain(4, 4), Terrain.ROCK);
});

test('fillRect handles inverted coordinates (col0 > col1)', () => {
    const m = new GameMap(10, 10, 10);
    m.fillRect(5, 5, 2, 2, Terrain.WATER);
    assert.strictEqual(m.getTerrain(3, 3), Terrain.WATER);
    assert.strictEqual(m.getTerrain(1, 1), Terrain.GRASS);
});

// ---------------------------------------------------------------------------
console.log('\n=== Collision / Walkability ===');
// ---------------------------------------------------------------------------

test('isWalkable returns true for GRASS, false for WATER', () => {
    const m = new GameMap(5, 5, 10);
    assert.ok(m.isWalkable(0, 0));  // GRASS
    m.setTerrain(2, 2, Terrain.WATER);
    assert.ok(!m.isWalkable(2, 2));
    assert.ok(m.isWalkable(1, 1));  // still GRASS
});

test('isWalkable returns false for out-of-bounds', () => {
    const m = new GameMap(5, 5, 10);
    assert.ok(!m.isWalkable(-1, 0));
    assert.ok(!m.isWalkable(5, 5));
});

test('isWalkableAtWorld converts and checks', () => {
    const m = new GameMap(80, 60, 10);
    m.setTerrainAtWorld(35, 42, Terrain.ROCK);
    assert.ok(!m.isWalkableAtWorld(35, 42));
    assert.ok(m.isWalkableAtWorld(0, 0));
});

test('canCircleFit returns true when all tiles under circle are walkable', () => {
    const m = new GameMap(10, 10, 10);
    // Center at (50, 50), radius 5 — only tile (5,5) is affected
    assert.ok(m.canCircleFit(50, 50, 5));
});

test('canCircleFit returns false when circle overlaps unwalkable tile', () => {
    const m = new GameMap(10, 10, 10);
    m.setTerrain(5, 5, Terrain.WATER);
    // Center at (50, 50), radius 5 — overlaps tile (5,5) which is WATER
    assert.ok(!m.canCircleFit(50, 50, 5));
    // Move away — should be fine
    assert.ok(m.canCircleFit(15, 15, 5));
});

test('canCircleFit handles edge tiles and out-of-bounds', () => {
    const m = new GameMap(10, 10, 10);
    // Circle near edge — partially out of bounds tiles are not walkable
    assert.ok(!m.canCircleFit(2, 2, 5));  // overlaps tile (-1,-1) -> OOB
    assert.ok(m.canCircleFit(15, 15, 5));
});

// ---------------------------------------------------------------------------
console.log('\n=== Entity Management ===');
// ---------------------------------------------------------------------------

test('addEntity assigns sequential ids from map-local counter', () => {
    const m = new GameMap(10, 10, 10);
    const e1 = m.addEntity(EntityType.TOWER, 50, 50, { team: Team.BLUE });
    const e2 = m.addEntity(EntityType.TOWER, 60, 60, { team: Team.RED });
    assert.strictEqual(e1.id, 0);
    assert.strictEqual(e2.id, 1);
    assert.strictEqual(e1.type, EntityType.TOWER);
    assert.strictEqual(e1.x, 50);
    assert.strictEqual(e1.props.team, Team.BLUE);
});

test('addEntity ids are per-map, not global', () => {
    const m1 = new GameMap(10, 10, 10);
    const m2 = new GameMap(10, 10, 10);
    const e1 = m1.addEntity(EntityType.TOWER, 50, 50);
    const e2 = m2.addEntity(EntityType.TOWER, 60, 60);
    // Both should start at 0 — independent counters
    assert.strictEqual(e1.id, 0);
    assert.strictEqual(e2.id, 0);
});

test('removeEntity removes by id and returns true', () => {
    const m = new GameMap(10, 10, 10);
    const e = m.addEntity(EntityType.TOWER, 50, 50);
    assert.ok(m.removeEntity(e.id));
    assert.strictEqual(m.entities.length, 0);
});

test('removeEntity returns false for non-existent id', () => {
    const m = new GameMap(10, 10, 10);
    assert.ok(!m.removeEntity(999));
});

test('getEntitiesByType filters correctly', () => {
    const m = new GameMap(10, 10, 10);
    m.addEntity(EntityType.TOWER, 10, 10);
    m.addEntity(EntityType.SPAWN_POINT, 20, 20);
    m.addEntity(EntityType.TOWER, 30, 30);
    assert.strictEqual(m.getEntitiesByType(EntityType.TOWER).length, 2);
    assert.strictEqual(m.getEntitiesByType(EntityType.SPAWN_POINT).length, 1);
    assert.strictEqual(m.getEntitiesByType(EntityType.BASE).length, 0);
});

test('getEntitiesByTeam filters correctly', () => {
    const m = new GameMap(10, 10, 10);
    m.addEntity(EntityType.TOWER, 10, 10, { team: Team.BLUE });
    m.addEntity(EntityType.TOWER, 20, 20, { team: Team.RED });
    m.addEntity(EntityType.TOWER, 30, 30, { team: Team.BLUE });
    assert.strictEqual(m.getEntitiesByTeam(Team.BLUE).length, 2);
    assert.strictEqual(m.getEntitiesByTeam(Team.RED).length, 1);
    assert.strictEqual(m.getEntitiesByTeam(Team.NEUTRAL).length, 0);
});

test('getEntity returns entity by id or undefined', () => {
    const m = new GameMap(10, 10, 10);
    const e = m.addEntity(EntityType.TOWER, 50, 50);
    assert.strictEqual(m.getEntity(e.id), e);
    assert.strictEqual(m.getEntity(999), undefined);
});

// ---------------------------------------------------------------------------
console.log('\n=== Lane Management ===');
// ---------------------------------------------------------------------------

test('addLane creates lane with auto-id', () => {
    const m = new GameMap(10, 10, 10);
    const l1 = m.addLane('top', Team.BLUE);
    const l2 = m.addLane('mid', Team.BLUE);
    assert.strictEqual(l1.id, 0);
    assert.strictEqual(l2.id, 1);
    assert.strictEqual(l1.name, 'top');
    assert.strictEqual(m.lanes.length, 2);
});

test('getLanePath returns ordered world positions from waypoint entity ids', () => {
    const m = new GameMap(80, 60, 10);
    const wp1 = m.addEntity(EntityType.WAYPOINT, 10, 10);
    const wp2 = m.addEntity(EntityType.WAYPOINT, 400, 10);
    const wp3 = m.addEntity(EntityType.WAYPOINT, 400, 300);
    const lane = m.addLane('top', Team.BLUE, [wp1.id, wp2.id, wp3.id]);

    const path = m.getLanePath(lane.id);
    assert.strictEqual(path.length, 3);
    assert.deepStrictEqual(path[0], { x: 10, y: 10 });
    assert.deepStrictEqual(path[1], { x: 400, y: 10 });
    assert.deepStrictEqual(path[2], { x: 400, y: 300 });
});

test('getLanePath returns empty array for missing lane', () => {
    const m = new GameMap(10, 10, 10);
    assert.deepStrictEqual(m.getLanePath(999), []);
});

test('getLanePath skips waypoints that were deleted', () => {
    const m = new GameMap(80, 60, 10);
    const wp1 = m.addEntity(EntityType.WAYPOINT, 10, 10);
    const wp2 = m.addEntity(EntityType.WAYPOINT, 50, 50);
    const wp3 = m.addEntity(EntityType.WAYPOINT, 90, 90);
    const lane = m.addLane('mid', Team.BLUE, [wp1.id, wp2.id, wp3.id]);
    m.removeEntity(wp2.id);

    const path = m.getLanePath(lane.id);
    assert.strictEqual(path.length, 2);
    assert.deepStrictEqual(path[0], { x: 10, y: 10 });
    assert.deepStrictEqual(path[1], { x: 90, y: 90 });
});

// ---------------------------------------------------------------------------
console.log('\n=== Serialization ===');
// ---------------------------------------------------------------------------

test('toJSON produces a plain object with all fields', () => {
    const m = new GameMap(5, 3, 10);
    m.name = 'Test Map';
    m.setTerrain(2, 1, Terrain.WATER);
    m.addEntity(EntityType.TOWER, 25, 15, { team: Team.BLUE });
    m.addLane('mid', Team.BLUE, [0]);

    const json = m.toJSON();
    assert.strictEqual(json.name, 'Test Map');
    assert.strictEqual(json.cols, 5);
    assert.strictEqual(json.rows, 3);
    assert.strictEqual(json.tileWidth, 10);
    assert.strictEqual(json.tileHeight, 10);
    assert.strictEqual(json.terrain.length, 15);
    assert.strictEqual(json.terrain[7], Terrain.WATER.id);  // row=1, col=2 -> 1*5+2=7
    assert.strictEqual(json.entities.length, 1);
    assert.strictEqual(json.lanes.length, 1);
});

test('fromJSON reconstructs an identical map', () => {
    const m1 = new GameMap(5, 3, 10);
    m1.name = 'Round Trip';
    m1.setTerrain(0, 0, Terrain.ROCK);
    m1.setTerrain(4, 2, Terrain.WATER);
    m1.addEntity(EntityType.TOWER, 25, 15, { team: Team.RED, radius: 30 });
    m1.addEntity(EntityType.SPAWN_POINT, 10, 10, { team: Team.BLUE });
    m1.addLane('top', Team.BLUE, [0, 1]);

    const json = m1.toJSON();
    const m2 = GameMap.fromJSON(json);

    assert.strictEqual(m2.name, 'Round Trip');
    assert.strictEqual(m2.cols, 5);
    assert.strictEqual(m2.rows, 3);
    assert.strictEqual(m2.tileWidth, 10);
    assert.strictEqual(m2.getTerrain(0, 0), Terrain.ROCK);
    assert.strictEqual(m2.getTerrain(4, 2), Terrain.WATER);
    assert.strictEqual(m2.getTerrain(1, 1), Terrain.GRASS);
    assert.strictEqual(m2.entities.length, 2);
    assert.strictEqual(m2.entities[0].type, EntityType.TOWER);
    assert.strictEqual(m2.entities[0].props.team, Team.RED);
    assert.strictEqual(m2.entities[0].props.radius, 30);
    assert.strictEqual(m2.entities[1].type, EntityType.SPAWN_POINT);
    assert.strictEqual(m2.lanes.length, 1);
    assert.deepStrictEqual(m2.lanes[0].waypointIds, [0, 1]);
});

test('fromJSON validates terrain array length', () => {
    const bad = { cols: 5, rows: 3, tileWidth: 10, terrain: [1, 2, 3] };
    assert.throws(() => GameMap.fromJSON(bad), RangeError);
});

test('fromJSON handles missing optional fields gracefully', () => {
    const minimal = { cols: 3, rows: 3, tileWidth: 10 };
    const m = GameMap.fromJSON(minimal);
    assert.strictEqual(m.name, 'Untitled Map');
    assert.strictEqual(m.entities.length, 0);
    assert.strictEqual(m.lanes.length, 0);
});

test('fromJSON rejects missing cols/rows', () => {
    assert.throws(() => GameMap.fromJSON({}), TypeError);
    assert.throws(() => GameMap.fromJSON({ cols: 5 }), TypeError);
});

test('Entity id counter persists across serialize/deserialize', () => {
    const m1 = new GameMap(5, 5, 10);
    const e1 = m1.addEntity(EntityType.TOWER, 10, 10); // id=0
    const e2 = m1.addEntity(EntityType.TOWER, 20, 20); // id=1

    const json = m1.toJSON();
    const m2 = GameMap.fromJSON(json);

    // New entities added to the deserialized map should not collide
    const e3 = m2.addEntity(EntityType.TOWER, 30, 30);
    assert.ok(e3.id > 1, `Expected id > 1, got ${e3.id}`);
});

// ---------------------------------------------------------------------------
console.log('\n=== Clone ===');
// ---------------------------------------------------------------------------

test('clone produces a deep copy', () => {
    const m1 = new GameMap(5, 5, 10);
    m1.setTerrain(2, 2, Terrain.WATER);
    m1.addEntity(EntityType.TOWER, 25, 25);

    const m2 = m1.clone();
    // Modify clone — original should be unaffected
    m2.setTerrain(2, 2, Terrain.GRASS);
    m2.entities[0].x = 999;

    assert.strictEqual(m1.getTerrain(2, 2), Terrain.WATER);
    assert.strictEqual(m1.entities[0].x, 25);
});

// ---------------------------------------------------------------------------
console.log('\n=== toString ===');
// ---------------------------------------------------------------------------

test('toString produces a readable summary', () => {
    const m = new GameMap(80, 60, 10);
    m.name = 'Summoner\'s Rift';
    m.addEntity(EntityType.TOWER, 10, 10);
    m.addEntity(EntityType.TOWER, 20, 20);
    m.addEntity(EntityType.BASE, 30, 30);
    m.addLane('mid', Team.BLUE);

    const s = m.toString();
    assert.ok(s.includes("Summoner's Rift"));
    assert.ok(s.includes('80x60'));
    assert.ok(s.includes('tower:2'));
    assert.ok(s.includes('base:1'));
    assert.ok(s.includes('lanes: 1'));
});

// ---------------------------------------------------------------------------
console.log('\n=== MapEntity serialization ===');
// ---------------------------------------------------------------------------

test('MapEntity.toJSON / fromJSON round-trip preserves all fields', () => {
    const e1 = new MapEntity(EntityType.NEXUS, 400, 300, { team: Team.BLUE, hp: 5000 });
    const json = e1.toJSON();
    const e2 = MapEntity.fromJSON(json);

    assert.strictEqual(e2.type, EntityType.NEXUS);
    assert.strictEqual(e2.x, 400);
    assert.strictEqual(e2.y, 300);
    assert.strictEqual(e2.props.team, Team.BLUE);
    assert.strictEqual(e2.props.hp, 5000);
    assert.strictEqual(e2.id, e1.id);
});

// ---------------------------------------------------------------------------
console.log('\n=== Lane serialization ===');
// ---------------------------------------------------------------------------

test('Lane.toJSON / fromJSON round-trip preserves all fields', () => {
    const l1 = new Lane('bottom', Team.RED, [0, 1, 2]);
    const json = l1.toJSON();
    const l2 = Lane.fromJSON(json);

    assert.strictEqual(l2.name, 'bottom');
    assert.strictEqual(l2.team, Team.RED);
    assert.deepStrictEqual(l2.waypointIds, [0, 1, 2]);
    assert.strictEqual(l2.id, l1.id);
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