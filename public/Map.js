// ============================================================================
// Map.js — World/Map data model for simpleMOBA
// ============================================================================
// Tile-based grid with terrain types, entity placements, and lane paths.
// Designed to be serialization-friendly for the upcoming map editor.
//
// Coordinate systems:
//   - World coordinates: pixel positions (e.g., player.x = 400)
//   - Grid coordinates: tile indices (e.g., tile [col=5, row=3])
//   - Conversions: worldToGrid / gridToWorld handle the mapping
//
// Usage:
//   const map = new Map(80, 60, 10);  // 80 cols x 60 rows, 10px tiles
//   map.setTerrain(5, 3, Terrain.WATER);
//   map.addEntity(EntityType.TOWER, 400, 300);
//   const json = map.toJSON();        // serialize
//   const m2 = Map.fromJSON(json);    // deserialize
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Terrain types — each tile in the grid holds one of these.
 * The `walkable` flag determines whether ground units can enter the tile.
 * The `color` is a default render color for the editor and debug views.
 */
const Terrain = {
    VOID:       { id: 0, name: 'void',       walkable: false, color: '#0a0a0a' },
    GRASS:     { id: 1, name: 'grass',      walkable: true,  color: '#3a5f3a' },
    DIRT:      { id: 2, name: 'dirt',       walkable: true,  color: '#6b5a3e' },
    WATER:     { id: 3, name: 'water',      walkable: false, color: '#1a4a7a' },
    BRUSH:     { id: 4, name: 'brush',      walkable: true,  color: '#2a3a1a' }, // slows / hides
    ROCK:      { id: 5, name: 'rock',       walkable: false, color: '#555555' },
    PATH:      { id: 6, name: 'path',       walkable: true,  color: '#8a7a5a' },
    BASE_FLOOR:{ id: 7, name: 'base_floor', walkable: true,  color: '#4a4a6a' },
};

/** Reverse lookup: id -> Terrain object */
const TerrainById = {};
for (const t of Object.values(Terrain)) {
    TerrainById[t.id] = t;
}

/**
 * Entity types — point objects placed on the map, not part of the tile grid.
 * These are the MOBA structural elements: bases, towers, spawn points, etc.
 */
const EntityType = {
    SPAWN_POINT:  'spawn_point',
    TOWER:        'tower',
    BASE:         'base',
    NEXUS:        'nexus',
    SHOP:         'shop',
    WAYPOINT:     'waypoint',   // nodes that define lane paths
    NEUTRAL_CAMP: 'neutral_camp',
};

/**
 * Team affiliation for entities that belong to a side.
 */
const Team = {
    NEUTRAL: 0,
    BLUE:    1,   // bottom-left side
    RED:     2,   // top-right side
};

// ---------------------------------------------------------------------------
// Entity — a placed object on the map (tower, spawn point, etc.)
// ---------------------------------------------------------------------------

class MapEntity {
    /**
     * @param {string} type   - EntityType value
     * @param {number} x      - world X (pixels)
     * @param {number} y      - world Y (pixels)
     * @param {object} props  - optional extra properties (team, radius, etc.)
     * @param {number} id     - optional explicit id (used by fromJSON / GameMap)
     */
    constructor(type, x, y, props = {}, id) {
        this.id = id != null ? id : -1;  // -1 = unassigned; GameMap assigns on add
        this.type = type;
        this.x = x;
        this.y = y;
        this.props = props;   // { team, radius, hp, label, ... }
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            props: this.props,
        };
    }

    static fromJSON(data) {
        const ent = new MapEntity(data.type, data.x, data.y, data.props || {}, data.id);
        return ent;
    }
}

// ---------------------------------------------------------------------------
// Lane — an ordered path of waypoints for minion wave traversal
// ---------------------------------------------------------------------------

class Lane {
    /**
     * @param {string} name    - human-readable lane name (e.g., "top", "mid", "bot")
     * @param {number} team    - Team enum: which team's minions travel this lane
     * @param {number[]} waypointIds - ordered list of waypoint entity IDs
     * @param {number} id     - optional explicit id (used by fromJSON / GameMap)
     */
    constructor(name, team = Team.NEUTRAL, waypointIds = [], id) {
        this.id = id != null ? id : -1;  // -1 = unassigned; GameMap assigns on add
        this.name = name;
        this.team = team;
        this.waypointIds = waypointIds;  // references to MapEntity IDs
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            team: this.team,
            waypointIds: [...this.waypointIds],
        };
    }

    static fromJSON(data) {
        const lane = new Lane(data.name, data.team, [...(data.waypointIds || [])], data.id);
        return lane;
    }
}

// ---------------------------------------------------------------------------
// Map — the core world data model
// ---------------------------------------------------------------------------

class GameMap {
    /**
     * @param {number} cols       - grid width in tiles
     * @param {number} rows       - grid height in tiles
     * @param {number} tileWidth  - tile width in pixels
     * @param {number} tileHeight  - tile height in pixels (default = tileWidth)
     */
    constructor(cols, rows, tileWidth, tileHeight) {
        if (!Number.isInteger(cols) || cols <= 0) {
            throw new RangeError(`Map cols must be a positive integer, got ${cols}`);
        }
        if (!Number.isInteger(rows) || rows <= 0) {
            throw new RangeError(`Map rows must be a positive integer, got ${rows}`);
        }
        if (tileWidth <= 0 || tileHeight <= 0) {
            throw new RangeError(`Tile dimensions must be positive, got ${tileWidth}x${tileHeight}`);
        }

        this.cols = cols;
        this.rows = rows;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight != null ? tileHeight : tileWidth;

        // World dimensions in pixels
        this.worldWidth = cols * this.tileWidth;
        this.worldHeight = rows * this.tileHeight;

        // Terrain grid — flat Uint8Array of Terrain.id values
        // Default: all GRASS
        this.terrain = new Uint8Array(cols * rows);
        this.terrain.fill(Terrain.GRASS.id);

        // Entities — array of MapEntity
        this.entities = [];

        // Lanes — array of Lane
        this.lanes = [];

        // Per-map ID counters (avoids cross-instance collision)
        this._nextEntityId = 0;
        this._nextLaneId = 0;

        // Metadata
        this.name = 'Untitled Map';
        this.version = 1;
    }

    // -------------------------------------------------------------------------
    // Coordinate conversions
    // -------------------------------------------------------------------------

    /**
     * Convert world pixel coordinates to grid indices.
     * @param {number} x - world X
     * @param {number} y - world Y
     * @returns {{ col: number, row: number }} grid indices (may be out of bounds)
     */
    worldToGrid(x, y) {
        return {
            col: Math.floor(x / this.tileWidth),
            row: Math.floor(y / this.tileHeight),
        };
    }

    /**
     * Convert grid indices to world pixel coordinates (top-left corner of tile).
     * @param {number} col
     * @param {number} row
     * @returns {{ x: number, y: number }}
     */
    gridToWorld(col, row) {
        return {
            x: col * this.tileWidth,
            y: row * this.tileHeight,
        };
    }

    /**
     * Convert grid indices to the center of the tile in world coordinates.
     * @param {number} col
     * @param {number} row
     * @returns {{ x: number, y: number }}
     */
    gridToWorldCenter(col, row) {
        return {
            x: col * this.tileWidth + this.tileWidth / 2,
            y: row * this.tileHeight + this.tileHeight / 2,
        };
    }

    // -------------------------------------------------------------------------
    // Bounds checking
    // -------------------------------------------------------------------------

    /**
     * Check if grid indices are within the map bounds.
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    inBounds(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    /**
     * Check if world coordinates are within the map bounds.
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    inWorldBounds(x, y) {
        return x >= 0 && x < this.worldWidth && y >= 0 && y < this.worldHeight;
    }

    // -------------------------------------------------------------------------
    // Terrain access
    // -------------------------------------------------------------------------

    /**
     * Flatten (col, row) into a 1D array index.
     * @param {number} col
     * @param {number} row
     * @returns {number} array index
     * @throws {RangeError} if out of bounds
     */
    _index(col, row) {
        if (!this.inBounds(col, row)) {
            throw new RangeError(`Grid index out of bounds: [${col}, ${row}] in ${this.cols}x${this.rows} map`);
        }
        return row * this.cols + col;
    }

    /**
     * Get the Terrain object at a grid position.
     * @param {number} col
     * @param {number} row
     * @returns {object} Terrain enum value
     */
    getTerrain(col, row) {
        const id = this.terrain[this._index(col, row)];
        return TerrainById[id] || Terrain.VOID;
    }

    /**
     * Get terrain id directly (avoids object lookup in hot paths).
     * @param {number} col
     * @param {number} row
     * @returns {number} Terrain.id
     */
    getTerrainId(col, row) {
        return this.terrain[this._index(col, row)];
    }

    /**
     * Set terrain at a grid position.
     * @param {number} col
     * @param {number} row
     * @param {object} terrain - a Terrain enum value
     */
    setTerrain(col, row, terrain) {
        if (!terrain || typeof terrain.id !== 'number') {
            throw new TypeError(`Invalid terrain: ${terrain}`);
        }
        this.terrain[this._index(col, row)] = terrain.id;
    }

    /**
     * Set terrain from world coordinates.
     * @param {number} x - world X
     * @param {number} y - world Y
     * @param {object} terrain
     */
    setTerrainAtWorld(x, y, terrain) {
        const { col, row } = this.worldToGrid(x, y);
        if (this.inBounds(col, row)) {
            this.setTerrain(col, row, terrain);
        }
    }

    /**
     * Fill a rectangular region with a terrain type.
     * @param {number} col0 - start col (inclusive)
     * @param {number} row0 - start row (inclusive)
     * @param {number} col1 - end col (exclusive)
     * @param {number} row1 - end row (exclusive)
     * @param {object} terrain
     */
    fillRect(col0, row0, col1, row1, terrain) {
        if (!terrain || typeof terrain.id !== 'number') {
            throw new TypeError(`Invalid terrain: ${terrain}`);
        }
        // Clamp to bounds
        const c0 = Math.max(0, Math.min(col0, col1));
        const c1 = Math.min(this.cols, Math.max(col0, col1));
        const r0 = Math.max(0, Math.min(row0, row1));
        const r1 = Math.min(this.rows, Math.max(row0, row1));

        for (let row = r0; row < r1; row++) {
            for (let col = c0; col < c1; col++) {
                this.terrain[row * this.cols + col] = terrain.id;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Collision / walkability
    // -------------------------------------------------------------------------

    /**
     * Check if a tile is walkable (ground units can enter).
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    isWalkable(col, row) {
        if (!this.inBounds(col, row)) return false;
        const t = TerrainById[this.terrain[row * this.cols + col]];
        return t ? t.walkable : false;
    }

    /**
     * Check if a world position is walkable.
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    isWalkableAtWorld(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return this.isWalkable(col, row);
    }

    /**
     * Check if a circle at a world position can occupy that space
     * (all tiles under the circle's bounding box must be walkable).
     * @param {number} x - center X
     * @param {number} y - center Y
     * @param {number} r - radius
     * @returns {boolean}
     */
    canCircleFit(x, y, r) {
        const minCol = Math.floor((x - r) / this.tileWidth);
        const maxCol = Math.floor((x + r) / this.tileWidth);
        const minRow = Math.floor((y - r) / this.tileHeight);
        const maxRow = Math.floor((y + r) / this.tileHeight);

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (!this.isWalkable(col, row)) return false;
            }
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Entity management
    // -------------------------------------------------------------------------

    /**
     * Add an entity to the map.
     * @param {string} type   - EntityType value
     * @param {number} x       - world X
     * @param {number} y       - world Y
     * @param {object} props   - optional properties
     * @returns {MapEntity} the created entity
     */
    addEntity(type, x, y, props = {}) {
        const id = this._nextEntityId++;
        const ent = new MapEntity(type, x, y, props, id);
        this.entities.push(ent);
        return ent;
    }

    /**
     * Remove an entity by its id.
     * @param {number} id
     * @returns {boolean} true if an entity was removed
     */
    removeEntity(id) {
        const idx = this.entities.findIndex(e => e.id === id);
        if (idx === -1) return false;
        this.entities.splice(idx, 1);
        return true;
    }

    /**
     * Get all entities of a given type.
     * @param {string} type - EntityType value
     * @returns {MapEntity[]}
     */
    getEntitiesByType(type) {
        return this.entities.filter(e => e.type === type);
    }

    /**
     * Get all entities belonging to a team.
     * @param {number} team - Team enum value
     * @returns {MapEntity[]}
     */
    getEntitiesByTeam(team) {
        return this.entities.filter(e => e.props && e.props.team === team);
    }

    /**
     * Get an entity by id.
     * @param {number} id
     * @returns {MapEntity|undefined}
     */
    getEntity(id) {
        return this.entities.find(e => e.id === id);
    }

    // -------------------------------------------------------------------------
    // Lane management
    // -------------------------------------------------------------------------

    /**
     * Add a lane to the map.
     * @param {string} name
     * @param {number} team
     * @param {number[]} waypointIds
     * @returns {Lane}
     */
    addLane(name, team = Team.NEUTRAL, waypointIds = []) {
        const id = this._nextLaneId++;
        const lane = new Lane(name, team, waypointIds, id);
        this.lanes.push(lane);
        return lane;
    }

    /**
     * Get the ordered world positions for a lane's waypoints.
     * @param {number} laneId
     * @returns {{ x: number, y: number }[]} array of waypoint positions
     */
    getLanePath(laneId) {
        const lane = this.lanes.find(l => l.id === laneId);
        if (!lane) return [];

        const path = [];
        for (const wpId of lane.waypointIds) {
            const ent = this.getEntity(wpId);
            if (ent) {
                path.push({ x: ent.x, y: ent.y });
            }
        }
        return path;
    }

    // -------------------------------------------------------------------------
    // Serialization
    // -------------------------------------------------------------------------

    /**
     * Serialize the map to a plain JSON-compatible object.
     * @returns {object}
     */
    toJSON() {
        return {
            name: this.name,
            version: this.version,
            cols: this.cols,
            rows: this.rows,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            // Terrain as 2D array of ids for readability
            terrain: Array.from(this.terrain),
            entities: this.entities.map(e => e.toJSON()),
            lanes: this.lanes.map(l => l.toJSON()),
        };
    }

    /**
     * Deserialize a map from a JSON-compatible object.
     * @param {object} data
     * @returns {GameMap}
     */
    static fromJSON(data) {
        if (!data || typeof data !== 'object') {
            throw new TypeError('fromJSON requires a plain object');
        }
        if (typeof data.cols !== 'number' || typeof data.rows !== 'number') {
            throw new TypeError('Map JSON missing cols/rows');
        }

        const map = new GameMap(
            data.cols,
            data.rows,
            data.tileWidth || 10,
            data.tileHeight || data.tileWidth || 10
        );

        map.name = data.name || 'Untitled Map';
        map.version = data.version || 1;

        // Restore terrain
        if (Array.isArray(data.terrain)) {
            if (data.terrain.length !== data.cols * data.rows) {
                throw new RangeError(
                    `Terrain array length ${data.terrain.length} does not match ` +
                    `grid size ${data.cols * data.rows}`
                );
            }
            for (let i = 0; i < data.terrain.length; i++) {
                map.terrain[i] = data.terrain[i];
            }
        }

        // Restore entities
        if (Array.isArray(data.entities)) {
            map.entities = data.entities.map(e => MapEntity.fromJSON(e));
            // Restore ID counter to max+1
            map._nextEntityId = map.entities.reduce((max, e) => Math.max(max, e.id + 1), 0);
        }

        // Restore lanes
        if (Array.isArray(data.lanes)) {
            map.lanes = data.lanes.map(l => Lane.fromJSON(l));
            // Restore ID counter to max+1
            map._nextLaneId = map.lanes.reduce((max, l) => Math.max(max, l.id + 1), 0);
        }

        return map;
    }

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    /**
     * Create a deep clone of this map.
     * @returns {GameMap}
     */
    clone() {
        return GameMap.fromJSON(this.toJSON());
    }

    /**
     * Get a debug string summarizing the map.
     * @returns {string}
     */
    toString() {
        const counts = {};
        for (const e of this.entities) {
            counts[e.type] = (counts[e.type] || 0) + 1;
        }
        const entSummary = Object.entries(counts)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ') || 'none';
        return `GameMap("${this.name}" ${this.cols}x${this.rows} @ ${this.tileWidth}x${this.tileHeight}px, ` +
               `entities: ${entSummary}, lanes: ${this.lanes.length})`;
    }
}

// ---------------------------------------------------------------------------
// Exports — global for now (matches existing lib.js pattern)
// ---------------------------------------------------------------------------

// For browser <script> tag loading:
if (typeof window !== 'undefined') {
    window.Terrain = Terrain;
    window.TerrainById = TerrainById;
    window.EntityType = EntityType;
    window.Team = Team;
    window.MapEntity = MapEntity;
    window.Lane = Lane;
    window.GameMap = GameMap;
}

// For Node.js require():
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Terrain, TerrainById, EntityType, Team, MapEntity, Lane, GameMap };
}