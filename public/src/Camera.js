// ============================================================================
// Camera.js — Viewport into the world, dt-based movement
// ============================================================================
// Depends on: Constants.js (FIXED_DT for interpolation awareness)
// ============================================================================

class Camera {
    x = 0
    y = 0
    prevX = 0   // for interpolation
    prevY = 0

    speed = 450   // 1.5x player speed — camera must outpace character
    direction = [0, 0]

    /**
     * Fixed-timestep update.
     * @param {number} dt - fixed delta time in seconds
     */
    update(dt) {
        this.x += this.direction[0] * this.speed * dt;
        this.y += this.direction[1] * this.speed * dt;
    }

    /**
     * Convert screen coordinates to world coordinates.
     * @param {number} x - screen X (canvas pixel)
     * @param {number} y - screen Y (canvas pixel)
     * @returns {[number, number]} world coordinates [x, y]
     */
    translate(x, y) { return [x + this.x, y + this.y] }
}

// Browser global
if (typeof window !== 'undefined') {
    window.Camera = Camera;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Camera };
}