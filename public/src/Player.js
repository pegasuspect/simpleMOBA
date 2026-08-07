// ============================================================================
// Player.js — Entity with collision-aware, dt-based movement
// ============================================================================
// Depends on: Map.js (GameMap.canCircleFit for collision)
//
// Movement is in pixels-per-second. The translation is stored as
// a direction vector (unit vector) and a remaining distance.
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
        this.move(dt);
    }

    /**
     * Draw the player. Uses interpolation for smooth rendering.
     * @param {Renderer} renderer
     * @param {number} alpha - interpolation factor (0..1)
     */
    draw(renderer, alpha) {
        let renderX = this.x;
        let renderY = this.y;

        // Interpolate between prev and current position
        if (alpha < 1.0 && this.prevX !== undefined) {
            renderX = this.prevX + (this.x - this.prevX) * alpha;
            renderY = this.prevY + (this.y - this.prevY) * alpha;
        }

        renderer.circle(renderX, renderY, this.r, this.color);
    }
}

// Browser global
if (typeof window !== 'undefined') {
    window.Player = Player;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player };
}