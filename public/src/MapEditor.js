// ============================================================================
// MapEditor.js — Tile-based map editor for simpleMOBA
// ============================================================================
// Depends on (load order):
//   Map.js, Constants.js, Geometry.js, Camera.js, Renderer.js
//
// Features:
//   - Terrain painting (brush + fill tools, adjustable brush size)
//   - Entity placement (click to place, drag to move, delete key)
//   - Lane waypoint editing (place waypoints, assign to lanes)
//   - Grid overlay toggle
//   - Minimap with click-to-navigate
//   - Save/load via REST API (GET/POST /maps/:name)
//   - Camera pan (WASD/arrows) and zoom (scroll wheel)
// ============================================================================

class MapEditor {

    constructor(canvas, minimapCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.minimapCanvas = minimapCanvas;
        this.minimapCtx = minimapCanvas.getContext('2d');

        // Viewport
        this.viewWidth = canvas.width;
        this.viewHeight = canvas.height;

        // Camera (reuses Camera class for pan, adds zoom)
        this.cam = new Camera();
        this.cam.speed = 300;  // faster pan in editor
        this.zoom = 1;         // 1 = normal, >1 = zoomed in

        // State
        this.map = null;
        this.tool = 'brush';
        this.selectedTerrain = Terrain.GRASS;
        this.selectedEntityType = EntityType.TOWER;
        this.selectedTeam = Team.BLUE;
        this.brushSize = 1;
        this.autoRadius = true;

        // View toggles
        this.showGrid = true;
        this.showEntities = true;
        this.showLanes = true;
        this.showWaypoints = false;

        // Selection / drag state
        this.selectedEntity = null;
        this.draggingEntity = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Mouse state
        this.mouseX = 0;  // screen coords
        this.mouseY = 0;
        this.mouseWorldX = 0;
        this.mouseWorldY = 0;
        this.isMouseDown = false;
        this.isRightDown = false;
        this.shiftHeld = false;

        // Lane editing state
        this.laneWaypoints = [];  // waypoint entity ids being collected for a new lane

        // Keys
        this.keys = {};

        // Status callback
        this.onStatus = (msg) => console.log('[Editor]', msg);

        // Bind loop
        this._frameLoop = this._frameLoop.bind(this);
    }

    // -------------------------------------------------------------------------
    // Map management
    // -------------------------------------------------------------------------

    /**
     * Create a new empty map.
     */
    newMap(cols, rows, tileWidth, name) {
        this.map = new GameMap(cols, rows, tileWidth);
        this.map.name = name || 'Untitled Map';
        this.selectedEntity = null;
        this.laneWaypoints = [];
        this._centerCamera();
        this._updateInfo();
        this.onStatus(`New map: ${cols}x${rows}`);
    }

    /**
     * Load a map from a JSON object.
     */
    loadMap(map) {
        this.map = map;
        this.selectedEntity = null;
        this.laneWaypoints = [];
        this._centerCamera();
        this._updateInfo();
        this.onStatus(`Loaded: ${map.name}`);
    }

    /**
     * Save the current map to the server.
     */
    async save(name) {
        if (!this.map) return;
        this.map.name = name;
        const json = this.map.toJSON();
        try {
            const res = await fetch(`/maps/${name}.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(json),
            });
            const data = await res.json();
            if (data.success) {
                this.onStatus(`Saved: ${name}`);
            } else {
                this.onStatus(`Save failed: ${data.error}`);
            }
        } catch (err) {
            this.onStatus(`Save error: ${err.message}`);
        }
    }

    /**
     * Fetch a map from the server by name.
     */
    async fetchMap(name) {
        try {
            const res = await fetch(`/maps/${name}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.loadMap(GameMap.fromJSON(data));
        } catch (err) {
            this.onStatus(`Load error: ${err.message}`);
        }
    }

    /**
     * Get the list of available maps from the server.
     */
    async fetchMapList() {
        try {
            const res = await fetch('/maps');
            return await res.json();
        } catch (err) {
            this.onStatus(`Map list error: ${err.message}`);
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // Camera
    // -------------------------------------------------------------------------

    _centerCamera() {
        if (!this.map) return;
        this.cam.x = this.map.worldWidth / 2 - this.viewWidth / 2;
        this.cam.y = this.map.worldHeight / 2 - this.viewHeight / 2;
    }

    _updateCamera(dt) {
        let dx = 0, dy = 0;
        if (this.keys['arrowright'] || this.keys['d']) dx++;
        if (this.keys['arrowleft'] || this.keys['a']) dx--;
        if (this.keys['arrowdown'] || this.keys['s']) dy++;
        if (this.keys['arrowup'] || this.keys['w']) dy--;
        this.cam.x += dx * this.cam.speed * dt;
        this.cam.y += dy * this.cam.speed * dt;

        // Right-drag panning
        if (this.isRightDown && this._panLastX != null) {
            this.cam.x -= this.mouseX - this._panLastX;
            this.cam.y -= this.mouseY - this._panLastY;
        }
        this._panLastX = this.mouseX;
        this._panLastY = this.mouseY;
    }

    zoomAt(factor, screenX, screenY) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(0.2, Math.min(8, this.zoom * factor));

        // Zoom toward cursor: keep the world point under the cursor stationary
        const ratio = this.zoom / oldZoom;
        const worldX = this.cam.x + screenX / oldZoom;
        const worldY = this.cam.y + screenY / oldZoom;
        this.cam.x = worldX - screenX / this.zoom;
        this.cam.y = worldY - screenY / this.zoom;
    }

    // -------------------------------------------------------------------------
    // Coordinate conversions (with zoom)
    // -------------------------------------------------------------------------

    screenToWorld(sx, sy) {
        return {
            x: this.cam.x + sx / this.zoom,
            y: this.cam.y + sy / this.zoom,
        };
    }

    worldToScreen(wx, wy) {
        return {
            x: (wx - this.cam.x) * this.zoom,
            y: (wy - this.cam.y) * this.zoom,
        };
    }

    // -------------------------------------------------------------------------
    // Terrain editing
    // -------------------------------------------------------------------------

    _paintAt(worldX, worldY, terrain) {
        if (!this.map) return;
        const { col, row } = this.map.worldToGrid(worldX, worldY);
        const size = this.brushSize;
        const half = Math.floor(size / 2);

        for (let dr = -half; dr < size - half; dr++) {
            for (let dc = -half; dc < size - half; dc++) {
                const c = col + dc;
                const r = row + dr;
                if (this.map.inBounds(c, r)) {
                    this.map.terrain[r * this.map.cols + c] = terrain.id;
                }
            }
        }
    }

    _eraseAt(worldX, worldY) {
        this._paintAt(worldX, worldY, Terrain.GRASS);
    }

    _floodFill(col, row, terrainId) {
        if (!this.map || !this.map.inBounds(col, row)) return;
        const target = this.map.terrain[row * this.map.cols + col];
        if (target === terrainId) return;  // already same

        const queue = [[col, row]];
        const visited = new Set();

        while (queue.length > 0) {
            const [c, r] = queue.shift();
            const idx = r * this.map.cols + c;
            if (visited.has(idx)) continue;
            if (!this.map.inBounds(c, r)) continue;
            if (this.map.terrain[idx] !== target) continue;

            visited.add(idx);
            this.map.terrain[idx] = terrainId;

            queue.push([c + 1, r]);
            queue.push([c - 1, r]);
            queue.push([c, r + 1]);
            queue.push([c, r - 1]);
        }
    }

    // -------------------------------------------------------------------------
    // Entity editing
    // -------------------------------------------------------------------------

    _placeEntity(worldX, worldY) {
        if (!this.map) return;
        const props = { team: this.selectedTeam };
        if (this.autoRadius) props.radius = 15;
        if (this.selectedEntityType === EntityType.WAYPOINT) {
            props.label = `wp_${this.map.entities.length}`;
        }
        const ent = this.map.addEntity(this.selectedEntityType, worldX, worldY, props);
        this.selectedEntity = ent;
        this.onStatus(`Placed ${this.selectedEntityType} #${ent.id} at (${Math.round(worldX)}, ${Math.round(worldY)})`);

        // Waypoints auto-add to the pending lane buffer
        if (this.selectedEntityType === EntityType.WAYPOINT) {
            this._addWaypointToLane(ent.id);
        }

        this._updateInfo();
    }

    _findEntityAt(worldX, worldY) {
        if (!this.map) return null;
        // Search in reverse so topmost (last drawn) is selected first
        for (let i = this.map.entities.length - 1; i >= 0; i--) {
            const ent = this.map.entities[i];
            const r = ent.props.radius || 15;
            const dx = ent.x - worldX;
            const dy = ent.y - worldY;
            if (dx * dx + dy * dy <= r * r) return ent;
        }
        return null;
    }

    _deleteSelected() {
        if (this.selectedEntity) {
            this.map.removeEntity(this.selectedEntity.id);
            this.onStatus(`Deleted entity #${this.selectedEntity.id}`);
            this.selectedEntity = null;
            this._updateInfo();
        }
    }

    // -------------------------------------------------------------------------
    // Lane editing
    // -------------------------------------------------------------------------

    _addWaypointToLane(entId) {
        this.laneWaypoints.push(entId);
        this.onStatus(`Waypoint ${entId} added to lane (total: ${this.laneWaypoints.length})`);
    }

    _finalizeLane() {
        if (this.laneWaypoints.length < 2) {
            this.onStatus('Need at least 2 waypoints for a lane');
            return;
        }
        const laneName = `lane_${this.map.lanes.length}`;
        this.map.addLane(laneName, this.selectedTeam, [...this.laneWaypoints]);
        this.onStatus(`Lane created: ${laneName} with ${this.laneWaypoints.length} waypoints`);
        this.laneWaypoints = [];
        this._updateInfo();
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    draw() {
        this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);

        if (!this.map) {
            this.ctx.fillStyle = '#333';
            this.ctx.font = '16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No map loaded. Click "New" or load an existing map.',
                this.viewWidth / 2, this.viewHeight / 2);
            return;
        }

        this._drawTerrain();
        if (this.showLanes) this._drawLanes();
        if (this.showEntities) this._drawEntities();
        if (this.showWaypoints) this._drawWaypoints();
        if (this.showGrid) this._drawGrid();
        this._drawBrushPreview();
        this._drawSelection();

        this._drawMinimap();
    }

    _drawTerrain() {
        const map = this.map;
        const tw = map.tileWidth * this.zoom;
        const th = map.tileHeight * this.zoom;

        const startCol = Math.max(0, Math.floor(this.cam.x / map.tileWidth) - 1);
        const endCol = Math.min(map.cols, Math.ceil((this.cam.x + this.viewWidth / this.zoom) / map.tileWidth) + 1);
        const startRow = Math.max(0, Math.floor(this.cam.y / map.tileHeight) - 1);
        const endRow = Math.min(map.rows, Math.ceil((this.cam.y + this.viewHeight / this.zoom) / map.tileHeight) + 1);

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                const terrainId = map.terrain[row * map.cols + col];
                const terrain = TerrainById[terrainId];
                if (!terrain) continue;

                const sx = Math.floor((col * map.tileWidth - this.cam.x) * this.zoom);
                const sy = Math.floor((row * map.tileHeight - this.cam.y) * this.zoom);

                this.ctx.fillStyle = terrain.color;
                this.ctx.fillRect(sx, sy, Math.ceil(tw) + 1, Math.ceil(th) + 1);
            }
        }
    }

    _drawGrid() {
        const map = this.map;
        const tw = map.tileWidth * this.zoom;
        const th = map.tileHeight * this.zoom;

        // Only draw grid if tiles are large enough to see it
        if (tw < 4 || th < 4) return;

        const startCol = Math.max(0, Math.floor(this.cam.x / map.tileWidth));
        const endCol = Math.min(map.cols, Math.ceil((this.cam.x + this.viewWidth / this.zoom) / map.tileWidth) + 1);
        const startRow = Math.max(0, Math.floor(this.cam.y / map.tileHeight));
        const endRow = Math.min(map.rows, Math.ceil((this.cam.y + this.viewHeight / this.zoom) / map.tileHeight) + 1);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();

        for (let col = startCol; col <= endCol; col++) {
            const sx = Math.floor((col * map.tileWidth - this.cam.x) * this.zoom);
            this.ctx.moveTo(sx, 0);
            this.ctx.lineTo(sx, this.viewHeight);
        }
        for (let row = startRow; row <= endRow; row++) {
            const sy = Math.floor((row * map.tileHeight - this.cam.y) * this.zoom);
            this.ctx.moveTo(0, sy);
            this.ctx.lineTo(this.viewWidth, sy);
        }

        this.ctx.stroke();
    }

    _drawEntities() {
        for (const ent of this.map.entities) {
            if (ent.type === EntityType.WAYPOINT && !this.showWaypoints) continue;

            const sx = (ent.x - this.cam.x) * this.zoom;
            const sy = (ent.y - this.cam.y) * this.zoom;
            if (sx < -50 || sx > this.viewWidth + 50 || sy < -50 || sy > this.viewHeight + 50) continue;

            const r = (ent.props.radius || 15) * this.zoom;
            const team = ent.props.team;
            let color;

            switch (ent.type) {
                case EntityType.TOWER:     color = team === Team.BLUE ? '#4444ff' : '#ff4444'; break;
                case EntityType.NEXUS:     color = team === Team.BLUE ? '#6666ff' : '#ff6666'; break;
                case EntityType.BASE:      color = team === Team.BLUE ? '#3333aa' : '#aa3333'; break;
                case EntityType.SPAWN_POINT: color = team === Team.BLUE ? '#66aaff' : '#ffaa66'; break;
                case EntityType.SHOP:      color = '#cccccc'; break;
                case EntityType.WAYPOINT:  color = '#ffff00'; break;
                case EntityType.NEUTRAL_CAMP: color = '#cc88cc'; break;
                default: color = '#888888';
            }

            this.ctx.fillStyle = color;
            this.ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            this.ctx.lineWidth = 1;

            if (ent.type === EntityType.WAYPOINT) {
                // Small dot for waypoints
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, Math.max(3, r * 0.4), 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, r, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
            }
        }
    }

    _drawWaypoints() {
        // Draw waypoint numbers and connections for pending lane
        for (let i = 0; i < this.laneWaypoints.length; i++) {
            const ent = this.map.getEntity(this.laneWaypoints[i]);
            if (!ent) continue;
            const sx = (ent.x - this.cam.x) * this.zoom;
            const sy = (ent.y - this.cam.y) * this.zoom;

            // Number label
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 14px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${i}`, sx, sy - 12);
        }

        // Draw connections between pending waypoints
        if (this.laneWaypoints.length >= 2) {
            this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            const first = this.map.getEntity(this.laneWaypoints[0]);
            this.ctx.moveTo((first.x - this.cam.x) * this.zoom, (first.y - this.cam.y) * this.zoom);
            for (let i = 1; i < this.laneWaypoints.length; i++) {
                const ent = this.map.getEntity(this.laneWaypoints[i]);
                this.ctx.lineTo((ent.x - this.cam.x) * this.zoom, (ent.y - this.cam.y) * this.zoom);
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    _drawLanes() {
        this.ctx.strokeStyle = 'rgba(255, 255, 100, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 4]);

        for (const lane of this.map.lanes) {
            const path = this.map.getLanePath(lane.id);
            if (path.length < 2) continue;
            this.ctx.beginPath();
            this.ctx.moveTo((path[0].x - this.cam.x) * this.zoom, (path[0].y - this.cam.y) * this.zoom);
            for (let i = 1; i < path.length; i++) {
                this.ctx.lineTo((path[i].x - this.cam.x) * this.zoom, (path[i].y - this.cam.y) * this.zoom);
            }
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);
        this.ctx.lineWidth = 1;
    }

    _drawBrushPreview() {
        if (this.tool !== 'brush' || !this.map) return;
        const { col, row } = this.map.worldToGrid(this.mouseWorldX, this.mouseWorldY);
        const size = this.brushSize;
        const half = Math.floor(size / 2);
        const tw = this.map.tileWidth * this.zoom;
        const th = this.map.tileHeight * this.zoom;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2;
        for (let dr = -half; dr < size - half; dr++) {
            for (let dc = -half; dc < size - half; dc++) {
                const c = col + dc;
                const r = row + dr;
                if (this.map.inBounds(c, r)) {
                    const sx = Math.floor((c * this.map.tileWidth - this.cam.x) * this.zoom);
                    const sy = Math.floor((r * this.map.tileHeight - this.cam.y) * this.zoom);
                    this.ctx.strokeRect(sx, sy, Math.ceil(tw), Math.ceil(th));
                }
            }
        }
    }

    _drawSelection() {
        if (!this.selectedEntity) return;
        const ent = this.selectedEntity;
        const sx = (ent.x - this.cam.x) * this.zoom;
        const sy = (ent.y - this.cam.y) * this.zoom;
        const r = (ent.props.radius || 15) * this.zoom + 4;

        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, r, 0, 2 * Math.PI);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.lineWidth = 1;
    }

    _drawMinimap() {
        const mmCtx = this.minimapCtx;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        mmCtx.clearRect(0, 0, mw, mh);

        if (!this.map) return;

        // Scale to fit
        const scaleX = mw / this.map.cols;
        const scaleY = mh / this.map.rows;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (mw - this.map.cols * scale) / 2;
        const offsetY = (mh - this.map.rows * scale) / 2;

        // Draw terrain
        for (let row = 0; row < this.map.rows; row++) {
            for (let col = 0; col < this.map.cols; col++) {
                const t = TerrainById[this.map.terrain[row * this.map.cols + col]];
                if (!t) continue;
                mmCtx.fillStyle = t.color;
                mmCtx.fillRect(offsetX + col * scale, offsetY + row * scale, Math.ceil(scale), Math.ceil(scale));
            }
        }

        // Draw entities as dots
        for (const ent of this.map.entities) {
            if (ent.type === EntityType.WAYPOINT) continue;
            const ex = offsetX + (ent.x / this.map.tileWidth) * scale;
            const ey = offsetY + (ent.y / this.map.tileHeight) * scale;
            mmCtx.fillStyle = ent.props.team === Team.BLUE ? '#66aaff' :
                               ent.props.team === Team.RED ? '#ffaa66' : '#ccc';
            mmCtx.beginPath();
            mmCtx.arc(ex, ey, 2, 0, 2 * Math.PI);
            mmCtx.fill();
        }

        // Draw viewport rectangle
        const vx = offsetX + (this.cam.x / this.map.tileWidth) * scale;
        const vy = offsetY + (this.cam.y / this.map.tileHeight) * scale;
        const vw = (this.viewWidth / this.zoom / this.map.tileWidth) * scale;
        const vh = (this.viewHeight / this.zoom / this.map.tileHeight) * scale;
        mmCtx.strokeStyle = '#00ff00';
        mmCtx.lineWidth = 1;
        mmCtx.strokeRect(vx, vy, vw, vh);
    }

    // -------------------------------------------------------------------------
    // Info panel
    // -------------------------------------------------------------------------

    _updateInfo() {
        if (!this.map) return;
        const el = (id) => document.getElementById(id);
        if (el('infoSize')) el('infoSize').textContent = `${this.map.cols}x${this.map.rows}`;
        if (el('infoTiles')) el('infoTiles').textContent = `${this.map.cols * this.map.rows}`;
        if (el('infoEntities')) el('infoEntities').textContent = `${this.map.entities.length}`;
        if (el('infoLanes')) el('infoLanes').textContent = `${this.map.lanes.length}`;
    }

    // -------------------------------------------------------------------------
    // Game loop
    // -------------------------------------------------------------------------

    start() {
        this._running = true;
        this._lastTime = performance.now();
        this._frameLoop();
    }

    stop() {
        this._running = false;
    }

    _frameLoop() {
        if (!this._running) return;
        const now = performance.now();
        const dt = Math.min(0.1, (now - this._lastTime) / 1000);
        this._lastTime = now;

        this._updateCamera(dt);
        this.draw();

        // Update cursor info
        const el = document.getElementById('infoCursor');
        if (el && this.map) {
            const { col, row } = this.map.worldToGrid(this.mouseWorldX, this.mouseWorldY);
            el.textContent = `[${col}, ${row}]`;
        }

        requestAnimationFrame(this._frameLoop);
    }

    // -------------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------------

    handleMouseDown(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        const world = this.screenToWorld(this.mouseX, this.mouseY);
        this.mouseWorldX = world.x;
        this.mouseWorldY = world.y;

        if (e.button === 2) {
            // Right-click: pan or delete entity (if in select mode)
            this.isRightDown = true;
            this._panLastX = this.mouseX;
            this._panLastY = this.mouseY;
            return;
        }

        if (e.button !== 0) return;  // left-click only for tools
        this.isMouseDown = true;

        if (this.tool === 'brush') {
            if (this.shiftHeld) this._eraseAt(world.x, world.y);
            else this._paintAt(world.x, world.y, this.selectedTerrain);
        } else if (this.tool === 'fill') {
            const { col, row } = this.map.worldToGrid(world.x, world.y);
            if (this.shiftHeld) this._floodFill(col, row, Terrain.GRASS.id);
            else this._floodFill(col, row, this.selectedTerrain.id);
        } else if (this.tool === 'entity') {
            this._placeEntity(world.x, world.y);
        } else if (this.tool === 'select') {
            const ent = this._findEntityAt(world.x, world.y);
            if (ent) {
                this.selectedEntity = ent;
                this.draggingEntity = ent;
                this.dragOffsetX = ent.x - world.x;
                this.dragOffsetY = ent.y - world.y;
            } else {
                this.selectedEntity = null;
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        const world = this.screenToWorld(this.mouseX, this.mouseY);
        this.mouseWorldX = world.x;
        this.mouseWorldY = world.y;

        // Continuous painting
        if (this.isMouseDown && this.tool === 'brush' && this.map) {
            if (this.shiftHeld) this._eraseAt(world.x, world.y);
            else this._paintAt(world.x, world.y, this.selectedTerrain);
        }

        // Drag entity
        if (this.isMouseDown && this.draggingEntity) {
            this.draggingEntity.x = world.x + this.dragOffsetX;
            this.draggingEntity.y = world.y + this.dragOffsetY;
        }
    }

    handleMouseUp(e) {
        this.isMouseDown = false;
        this.isRightDown = false;
        this.draggingEntity = null;
        this._panLastX = null;
    }

    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.zoomAt(factor, sx, sy);
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        this.keys[key] = true;

        if (key === 'shift') this.shiftHeld = true;

        // Delete selected entity
        if (key === 'delete' || key === 'backspace') {
            if (this.selectedEntity && this.tool === 'select') {
                e.preventDefault();
                this._deleteSelected();
            }
        }

        // Toggle grid
        if (key === 'g') {
            this.showGrid = !this.showGrid;
            const cb = document.getElementById('showGrid');
            if (cb) cb.checked = this.showGrid;
        }

        // Finalize lane (Enter)
        if (key === 'enter' && this.tool === 'entity' && this.laneWaypoints.length > 0) {
            this._finalizeLane();
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        this.keys[key] = false;
        if (key === 'shift') this.shiftHeld = false;
    }

    handleMinimapClick(e) {
        if (!this.map) return;
        const rect = this.minimapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;

        const scaleX = mw / this.map.cols;
        const scaleY = mh / this.map.rows;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (mw - this.map.cols * scale) / 2;
        const offsetY = (mh - this.map.rows * scale) / 2;

        const col = (mx - offsetX) / scale;
        const row = (my - offsetY) / scale;
        this.cam.x = col * this.map.tileWidth - this.viewWidth / (2 * this.zoom);
        this.cam.y = row * this.map.tileHeight - this.viewHeight / (2 * this.zoom);
    }

    handleContextMenu(e) {
        e.preventDefault();
    }
}

// Browser global
if (typeof window !== 'undefined') {
    window.MapEditor = MapEditor;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MapEditor };
}