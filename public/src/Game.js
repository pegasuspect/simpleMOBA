// ============================================================================
// Game.js — Game state + fixed-timestep loop
// ============================================================================
// Depends on (load order):
//   1. Constants.js   (FIXED_DT, FIXED_DT_SEC, MAX_FRAME_TIME, MAX_TICKS_PER_FRAME)
//   2. Map.js          (GameMap, Terrain, EntityType, Team)
//   3. Geometry.js     (pure functions — no direct dependency, but available)
//   4. Camera.js       (Camera)
//   5. Player.js       (Player)
//   6. Renderer.js     (Renderer)
//   7. Controller.js   (Controller)
//
// Loop architecture:
//   frameStart → accumulate real elapsed time → drain accumulator in
//   fixed FIXED_DT steps (calling update()) → render with interpolation alpha
//
//   update() is called 0..N times per rAF callback, always with the same dt.
//   draw() is called exactly once per rAF callback.
// ============================================================================

class Game {

    p1 = new Player();
    cam = new Camera();
    otherPlayers = [];
    id = -1;
    map = null;

    constructor(ctx, socket, id) {
        this.renderer = new Renderer(ctx, this.cam);
        this.controller = new Controller(this);
        this.canvas = ctx.canvas;  // reference for touch coordinate conversion

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

    // Backward-compatible alias for code that references `game.utils`
    get utils() { return this.renderer; }

    /**
     * Resize the canvas viewport. Called on window resize and initial load.
     * @param {number} cssWidth  - CSS pixel width of the canvas
     * @param {number} cssHeight - CSS pixel height of the canvas
     */
    resizeViewport(cssWidth, cssHeight) {
        this.renderer.resizeViewport(cssWidth, cssHeight);
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
        this.cam.x = this.p1.x - this.renderer.viewWidth / 2;
        this.cam.y = this.p1.y - this.renderer.viewHeight / 2;
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
        this.controller.applyJoystick();
    }

    /**
     * Render the game with interpolation.
     * @param {number} alpha - 0.0 to 1.0, fraction between prev and current state
     */
    draw(alpha) {
        this.renderer.clear();

        // Interpolate camera for smooth scrolling
        const savedCamX = this.cam.x;
        const savedCamY = this.cam.y;
        if (alpha < 1.0) {
            this.cam.x = this.cam.prevX + (this.cam.x - this.cam.prevX) * alpha;
            this.cam.y = this.cam.prevY + (this.cam.y - this.cam.prevY) * alpha;
        }

        // Render order: terrain → lanes → entities → players
        if (this.map) {
            this.renderer.drawTerrain(this.map);
            this.renderer.drawLanes(this.map);
            this.renderer.drawEntities(this.map);
        }

        // Local player (interpolated)
        this.p1.draw(this.renderer, alpha);

        // Other players
        for (let i = 0; i < this.otherPlayers.length; i++) {
            const player = this.otherPlayers[i];
            if (player.id !== this.id) {
                this.renderer.circle(player.x, player.y, this.p1.r, 'black');
            }
        }

        // Debug overlay
        if (this.debug) {
            this.renderer.drawDebug(this._stats);
        }

        // Virtual joystick overlay (mobile)
        this._drawJoystick();

        // Restore camera to non-interpolated position for next update
        this.cam.x = savedCamX;
        this.cam.y = savedCamY;
    }

    /**
     * Draw the on-screen virtual joystick if active.
     * @private
     */
    _drawJoystick() {
        const joy = this.controller.getJoystickState();
        if (!joy) return;

        const ctx = this.renderer.ctx;
        const radius = 60;
        const knobRadius = 30;
        const knobX = joy.startX + joy.dx * radius;
        const knobY = joy.startY + joy.dy * radius;

        // Outer ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(joy.startX, joy.startY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Inner knob
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.stroke();
    }
}

// Browser global
if (typeof window !== 'undefined') {
    window.Game = Game;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Game };
}