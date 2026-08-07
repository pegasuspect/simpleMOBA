// ============================================================================
// lib.js — Client game engine for simpleMOBA
// ============================================================================
// Classes: Util (renderer), Game (state + fixed-timestep loop), Player,
//          Camera, Controller
// 
// Integrates GameMap (from Map.js) for terrain rendering and collision.
// Render order: terrain tiles → lane paths → entities → players
//
// Game loop: fixed-timestep accumulator pattern.
//   - Logic updates at a locked 60Hz (dt = 1000/60 ≈ 16.67ms)
//   - Rendering interpolates between the previous and current physics state
//   - Speed values are in pixels-per-second, not pixels-per-frame
// ============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed logic timestep in milliseconds (60 updates per second) */
const FIXED_DT = 1000 / 60;

/** Fixed timestep in seconds (for movement calculations) */
const FIXED_DT_SEC = FIXED_DT / 1000;

/** Max accumulated frame time in ms — prevents spiral of death after stalls */
const MAX_FRAME_TIME = 100;

/** Max number of catch-up ticks per frame — prevents burst storms */
const MAX_TICKS_PER_FRAME = 5;

// ---------------------------------------------------------------------------
// Util — rendering helpers
// ---------------------------------------------------------------------------

class Util {

    constructor(ctx, cam) {
        this.ctx = ctx
        this.ctx.fillStyle = 'black';
        this.cam = cam
        // Viewport dimensions — used for tile culling
        this.viewWidth = 800
        this.viewHeight = 600
    }

    vpx(x) {return x-this.cam.x}
    vpy(y) {return y-this.cam.y}
    
    line(x1,y1,x2,y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.vpx(x1), this.vpy(y1));
        this.ctx.lineTo(this.vpx(x2), this.vpy(y2));
        this.ctx.stroke();
    }

    circle(x,y,r,color) {
        this.ctx.beginPath();
        this.ctx.arc(this.vpx(x), this.vpy(y), r, 0, 2 * Math.PI);
        this.ctx.stroke();
        if(color) this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.fillStyle = "black"
    }

    // -------------------------------------------------------------------------
    // Terrain rendering — only draw tiles visible through the camera viewport
    // -------------------------------------------------------------------------

    drawTerrain(map) {
        if (!map) return;

        const tw = map.tileWidth;
        const th = map.tileHeight;

        // Cull with +1 tile margin on all sides. During camera interpolation
        // the camera position shifts fractionally between fixed updates,
        // and without the margin the edge tiles can pop in/out, leaving
        // brief uncovered strips that show as white flashes.
        const startCol = Math.max(0, Math.floor(this.cam.x / tw) - 1);
        const endCol = Math.min(map.cols, Math.ceil((this.cam.x + this.viewWidth) / tw) + 1);
        const startRow = Math.max(0, Math.floor(this.cam.y / th) - 1);
        const endRow = Math.min(map.rows, Math.ceil((this.cam.y + this.viewHeight) / th) + 1);

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                const terrainId = map.terrain[row * map.cols + col];
                const terrain = TerrainById[terrainId];
                if (!terrain) continue;

                // Floor to integer pixels so tiles snap to the pixel grid.
                // Without this, sub-pixel camera positions cause fillRect
                // to anti-alias tile edges, leaving thin transparent gaps
                // that appear as white lines/squares.
                const sx = Math.floor(this.vpx(col * tw));
                const sy = Math.floor(this.vpy(row * th));

                this.ctx.fillStyle = terrain.color;
                // +1px on each axis: guaranteed overlap with neighbors,
                // eliminates any residual gap from the floor rounding.
                this.ctx.fillRect(sx, sy, tw + 1, th + 1);
            }
        }
    }

    drawEntities(map) {
        if (!map) return;

        for (const ent of map.entities) {
            const sx = this.vpx(ent.x);
            const sy = this.vpy(ent.y);

            if (sx < -50 || sx > this.viewWidth + 50 ||
                sy < -50 || sy > this.viewHeight + 50) continue;

            const radius = ent.props.radius || 15;
            const team = ent.props.team;

            let color;
            switch (ent.type) {
                case EntityType.TOWER:
                    color = team === Team.BLUE ? '#4444ff' : '#ff4444';
                    this._drawEntityShape(sx, sy, radius, color, 'tower');
                    break;
                case EntityType.NEXUS:
                    color = team === Team.BLUE ? '#6666ff' : '#ff6666';
                    this._drawEntityShape(sx, sy, radius, color, 'nexus');
                    break;
                case EntityType.BASE:
                    color = team === Team.BLUE ? '#3333aa' : '#aa3333';
                    this._drawEntityShape(sx, sy, radius, color, 'base');
                    break;
                case EntityType.SPAWN_POINT:
                    color = team === Team.BLUE ? '#66aaff' : '#ffaa66';
                    this._drawEntityShape(sx, sy, radius, color, 'spawn');
                    break;
                case EntityType.SHOP:
                    color = '#cccccc';
                    this._drawEntityShape(sx, sy, radius, color, 'shop');
                    break;
                case EntityType.WAYPOINT:
                    break;
                case EntityType.NEUTRAL_CAMP:
                    color = '#cc88cc';
                    this._drawEntityShape(sx, sy, radius, color, 'camp');
                    break;
                default:
                    color = '#888888';
                    this._drawEntityShape(sx, sy, radius, color, 'default');
            }
        }
    }

    _drawEntityShape(sx, sy, r, color, shapeType) {
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        this.ctx.lineWidth = 1;

        switch (shapeType) {
            case 'tower':
                this.ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
                this.ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
                break;
            case 'nexus':
                this.ctx.beginPath();
                this.ctx.moveTo(sx, sy - r);
                this.ctx.lineTo(sx + r, sy);
                this.ctx.lineTo(sx, sy + r);
                this.ctx.lineTo(sx - r, sy);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                break;
            case 'base':
                this.ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
                this.ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
                break;
            case 'spawn':
                this.ctx.beginPath();
                this.ctx.moveTo(sx, sy - r);
                this.ctx.lineTo(sx + r, sy + r);
                this.ctx.lineTo(sx - r, sy + r);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                break;
            case 'shop':
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, r, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
                break;
            case 'camp':
                this.ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const px = sx + Math.cos(a) * r;
                    const py = sy + Math.sin(a) * r;
                    if (i === 0) this.ctx.moveTo(px, py);
                    else this.ctx.lineTo(px, py);
                }
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                break;
            default:
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, r, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
        }
    }

    drawLanes(map) {
        if (!map || !map.lanes) return;

        this.ctx.strokeStyle = 'rgba(255, 255, 100, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        for (const lane of map.lanes) {
            const path = map.getLanePath(lane.id);
            if (path.length < 2) continue;

            this.ctx.beginPath();
            this.ctx.moveTo(this.vpx(path[0].x), this.vpy(path[0].y));
            for (let i = 1; i < path.length; i++) {
                this.ctx.lineTo(this.vpx(path[i].x), this.vpy(path[i].y));
            }
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);
        this.ctx.lineWidth = 1;
    }

    // -------------------------------------------------------------------------
    // Debug overlay — FPS and tick stats
    // -------------------------------------------------------------------------

    /**
     * Draw debug stats in the top-left corner.
     * @param {object} stats - { fps, tickRate, alpha, ticks }
     */
    drawDebug(stats) {
        if (!stats) return;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(5, 5, 180, 60);

        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = '12px monospace';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`FPS:     ${stats.fps.toFixed(1)}`, 10, 8);
        this.ctx.fillText(`Ticks:   ${stats.tickRate.toFixed(1)}/s`, 10, 22);
        this.ctx.fillText(`Alpha:   ${stats.alpha.toFixed(3)}`, 10, 36);
        this.ctx.fillText(`Updates: ${stats.totalTicks}`, 10, 50);

        this.ctx.textBaseline = 'alphabetic';
    }

    grahamScan(points) { 
        let bottomP = points.reduce((p,c)=>c.y<p.y||c.y==p.y&&c.x<p.x?c:p)
        let sorted = points.map(x=>({...x, degree: this.degree(bottomP,x)}))
        sorted.sort((a,b) => {
            let dif = a.degree-b.degree
            if(dif==0) {
                let f = this.distance(a,bottomP)
                let s = this.distance(b,bottomP)
                return (a.degree >= Math.PI/2) ? (f>s ? -1 : 1) : (f<s ? -1 : 1)
            }
            return dif
        })
        let stack = [sorted[0], sorted[1]]
        for(let i=2; i<sorted.length; i++) {
            while(this.crossProduct(
                this.difference(stack[stack.length-2],stack[stack.length-1]),
                this.difference(stack[stack.length-1], sorted[i])
            )<0) stack.pop()
            stack.push(sorted[i])
        }
        return stack.map(i=>({x: i.x, y: i.y}))
    }

    degree(a,b) { return Math.atan2((b.y-a.y),(b.x-a.x)) }
    distance(a,b) { return Math.pow((b.y-a.y)**2+(b.x-a.x)**2,0.5) }
    difference(a,b) { return {x: b.x-a.x, y: b.y-a.y} }
    crossProduct(a,b) { return a.x*b.y-a.y*b.x }

    clear() {
        this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    }
}

// ============================================================================
// Game — owns the map, player, camera, and the fixed-timestep loop
// ============================================================================
//
// Loop architecture:
//
//   frameStart → accumulate real elapsed time → drain accumulator in
//   fixed FIXED_DT steps (calling update()) → render with interpolation alpha
//
//   update() is called 0..N times per rAF callback, always with the same dt.
//   draw() is called exactly once per rAF callback.
//
// ============================================================================

class Game {

    p1 = new Player()
    cam = new Camera()
    otherPlayers = []
    id = -1
    map = null

    constructor(ctx, socket, id) {
        this.utils = new Util(ctx, this.cam)
        this.controller = new Controller(this);

        // Loop state
        this._running = false;
        this._lastTime = 0;
        this._accumulator = 0;

        // Stats
        this._stats = {
            fps: 0,
            tickRate: 0,
            alpha: 0,
            totalTicks: 0,
        };
        this._fpsFrames = 0;
        this._fpsTime = 0;
        this._tickCount = 0;
        this._tickTime = 0;

        // Debug overlay toggle
        this.debug = false;
    }

    /**
     * Load a GameMap into the game. Player position is set to the first
     * blue spawn point if available, otherwise map center.
     */
    loadMap(map) {
        this.map = map;

        const blueSpawns = map.getEntitiesByType(EntityType.SPAWN_POINT)
            .filter(e => e.props.team === Team.BLUE);
        if (blueSpawns.length > 0) {
            this.p1.x = blueSpawns[0].x;
            this.p1.y = blueSpawns[0].y;
        } else {
            this.p1.x = map.worldWidth / 2;
            this.p1.y = map.worldHeight / 2;
        }

        // Initialize previous positions for interpolation
        this.p1.prevX = this.p1.x;
        this.p1.prevY = this.p1.y;

        // Center camera on player
        this.cam.x = this.p1.x - this.utils.viewWidth / 2;
        this.cam.y = this.p1.y - this.utils.viewHeight / 2;
        this.cam.prevX = this.cam.x;
        this.cam.prevY = this.cam.y;

        // Pass map reference to player for collision
        this.p1.map = map;

        console.log(`Map loaded: ${map.toString()}`);
        console.log(`Player spawned at (${this.p1.x}, ${this.p1.y})`);
    }

    // -------------------------------------------------------------------------
    // Fixed-timestep game loop
    // -------------------------------------------------------------------------

    /**
     * Start the game loop.
     */
    start() {
        if (this._running) return;
        this._running = true;
        this._lastTime = performance.now();
        this._accumulator = 0;
        this._fpsFrames = 0;
        this._fpsTime = 0;
        this._tickCount = 0;
        this._tickTime = 0;
        this._frameLoop();
    }

    /**
     * Stop the game loop.
     */
    stop() {
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /**
     * The main rAF callback. Collects elapsed time, drains the accumulator
     * in fixed steps, then renders with interpolation.
     * @private
     */
    _frameLoop = () => {
        if (!this._running) return;

        const now = performance.now();
        let frameTime = now - this._lastTime;
        this._lastTime = now;

        // Cap frame time to prevent spiral of death after tab switches
        if (frameTime > MAX_FRAME_TIME) {
            frameTime = MAX_FRAME_TIME;
        }

        this._accumulator += frameTime;

        // Drain accumulator in fixed steps
        let ticksThisFrame = 0;
        while (this._accumulator >= FIXED_DT && ticksThisFrame < MAX_TICKS_PER_FRAME) {
            this._snapshot();              // save prev state for interpolation
            this.update(FIXED_DT_SEC);     // fixed update
            this._accumulator -= FIXED_DT;
            this._stats.totalTicks++;
            this._tickCount++;
            ticksThisFrame++;
        }

        // If we hit the tick cap, discard remaining accumulator to avoid buildup
        if (ticksThisFrame >= MAX_TICKS_PER_FRAME) {
            this._accumulator = 0;
        }

        // Interpolation alpha: how far between the last two fixed updates
        const alpha = this._accumulator / FIXED_DT;
        this._stats.alpha = alpha;

        // Render
        this.draw(alpha);

        // Update FPS / tick stats every 500ms
        this._fpsFrames++;
        this._fpsTime += frameTime;
        if (this._fpsTime >= 500) {
            this._stats.fps = (this._fpsFrames * 1000) / this._fpsTime;
            this._stats.tickRate = (this._tickCount * 1000) / this._tickTime;
            this._fpsFrames = 0;
            this._tickTime = 0;
            this._tickCount = 0;
            // Keep _fpsTime's remainder for accuracy
            this._fpsTime = 0;
        }

        this._rafId = requestAnimationFrame(this._frameLoop);
    }

    /**
     * Snapshot current state into prev state, for render interpolation.
     * Called once per fixed update, BEFORE update() runs.
     * @private
     */
    _snapshot() {
        this.p1.prevX = this.p1.x;
        this.p1.prevY = this.p1.y;
        this.cam.prevX = this.cam.x;
        this.cam.prevY = this.cam.y;
    }

    // -------------------------------------------------------------------------
    // Update / Draw
    // -------------------------------------------------------------------------

    /**
     * Fixed-timestep update. Always called with the same dt (in seconds).
     * @param {number} dt - fixed delta time in seconds (≈ 0.01667)
     */
    update(dt) {
        this.p1.update(dt);
        this.cam.update(dt);
    }

    /**
     * Render the game with interpolation.
     * @param {number} alpha - 0.0 to 1.0, fraction between prev and current state
     */
    draw(alpha) {
        this.utils.clear()

        // Interpolate camera for smooth scrolling
        const savedCamX = this.cam.x;
        const savedCamY = this.cam.y;
        if (alpha < 1.0) {
            this.cam.x = this.cam.prevX + (this.cam.x - this.cam.prevX) * alpha;
            this.cam.y = this.cam.prevY + (this.cam.y - this.cam.prevY) * alpha;
        }

        // Render order: terrain → lanes → entities → players
        if (this.map) {
            this.utils.drawTerrain(this.map)
            this.utils.drawLanes(this.map)
            this.utils.drawEntities(this.map)
        }

        // Local player (interpolated)
        this.p1.draw(this.utils, alpha)

        // Other players
        for (let i = 0; i < this.otherPlayers.length; i++) {
            const player = this.otherPlayers[i];
            if(player.id !== this.id) {
                this.utils.circle(player.x, player.y, this.p1.r, 'black');
            }
        }

        // Debug overlay
        if (this.debug) {
            this.utils.drawDebug(this._stats);
        }

        // Restore camera to non-interpolated position for next update
        this.cam.x = savedCamX;
        this.cam.y = savedCamY;
    }
}

// ============================================================================
// Player — entity with collision-aware, dt-based movement
// ============================================================================
//
// Movement is now in pixels-per-second. The translation is stored as
// a direction vector (unit vector * speed) and a remaining distance.
// Each update step: x += dir.x * speed * dt, y += dir.y * speed * dt
//
// This is deterministic: regardless of frame rate, the player covers
// the same distance per unit of real time.
// ============================================================================

class Player {

    // state
    x = 400
    y = 300
    prevX = 400   // for interpolation
    prevY = 300
    r = 20
    color = "red"

    // movement — pixels per second
    speed = 240   // was 4px/frame * 60fps = 240px/s
    destination = null  // { x, y }
    direction = null    // { dx, dy } unit vector
    remainingDist = 0   // pixels left to travel

    map = null  // reference to GameMap for collision checks

    /**
     * Set a movement destination. Computes direction and distance.
     * @param {number} x - world X
     * @param {number} y - world Y
     */
    setDestination(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.01) return;  // already there

        this.destination = { x, y };
        this.direction = { dx: dx / dist, dy: dy / dist };
        this.remainingDist = dist;
    }

    /**
     * Fixed-timestep update. Moves the player toward the destination,
     * checking collision at each step.
     * @param {number} dt - fixed delta time in seconds
     */
    move(dt) {
        if (!this.direction || this.remainingDist <= 0) {
            this.direction = null;
            this.remainingDist = 0;
            return;
        }

        // How far to move this tick
        const stepDist = this.speed * dt;
        const moveDist = Math.min(stepDist, this.remainingDist);

        const nextX = this.x + this.direction.dx * moveDist;
        const nextY = this.y + this.direction.dy * moveDist;

        // Collision check: can the player's circle fit at the next position?
        if (this.map && this.map.canCircleFit(nextX, nextY, this.r)) {
            this.x = nextX;
            this.y = nextY;
            this.remainingDist -= moveDist;
        } else {
            // Blocked — stop movement
            this.direction = null;
            this.remainingDist = 0;
        }

        // Reached destination
        if (this.remainingDist <= 0) {
            this.direction = null;
            this.remainingDist = 0;
        }
    }

    update(dt) {
        this.move(dt)
    }

    /**
     * Draw the player. Uses interpolation for smooth rendering.
     * @param {Util} utils
     * @param {number} alpha - interpolation factor (0..1)
     */
    draw(utils, alpha) {
        let renderX = this.x;
        let renderY = this.y;

        // Interpolate between prev and current position
        if (alpha < 1.0 && this.prevX !== undefined) {
            renderX = this.prevX + (this.x - this.prevX) * alpha;
            renderY = this.prevY + (this.y - this.prevY) * alpha;
        }

        utils.circle(renderX, renderY, this.r, this.color)
    }
}

// ============================================================================
// Camera — viewport into the world, dt-based movement
// ============================================================================

class Camera {
    x = 0
    y = 0
    prevX = 0   // for interpolation
    prevY = 0

    speed = 120   // pixels per second (was 2px/frame * 60fps = 120px/s)
    direction = [0, 0]

    /**
     * Fixed-timestep update.
     * @param {number} dt - fixed delta time in seconds
     */
    update(dt) {
        this.x += this.direction[0] * this.speed * dt;
        this.y += this.direction[1] * this.speed * dt;
    }

    translate(x, y) { return [x + this.x, y + this.y] }
}

// ============================================================================
// Controller — input handling
// ============================================================================

class Controller {

    constructor(game) {
        this.game = game
    }

    mouseDown(e) {
        e.preventDefault()
        if(e.which == 3) this.rightMouseDown(e)
        if(e.which == 1) this.leftMouseDown(e)
        if(e.which == 2) this.middleMouseDown(e)
    }

    rightMouseDown(e) {
        this.game.p1.setDestination(...this.game.cam.translate(e.offsetX, e.offsetY))
    }

    leftMouseDown(e) {
        // Toggle debug overlay with left-click (temporary, for testing)
        this.game.debug = !this.game.debug
    }

    middleMouseDown(e) {
        // No-op
    }

    keyDown(e) {
        if(e.repeat) return
        switch(e.keyCode) {
            case 39: // right
                this.game.cam.direction[0]++
                break
            case 37: // left
                this.game.cam.direction[0]--
                break
            case 38: // up
                this.game.cam.direction[1]--
                break
            case 40: // down
                this.game.cam.direction[1]++
                break
            case 192: // backtick (`) — toggle debug
                this.game.debug = !this.game.debug
                break
        }
    }

    keyUp(e) {
        if(e.repeat) return
        switch(e.keyCode) {
            case 39: // right
                this.game.cam.direction[0]--
                break
            case 37: // left
                this.game.cam.direction[0]++
                break
            case 38: // up
                this.game.cam.direction[1]++
                break
            case 40: // down
                this.game.cam.direction[1]--
                break
        }
    }

    contextMenu(e) {
        e.preventDefault()
    }
}