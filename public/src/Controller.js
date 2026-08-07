// ============================================================================
// Controller.js — Input handling (keyboard, mouse, touch)
// ============================================================================
// Depends on: Game class (references game.p1, game.cam, game.debug)
//
// Desktop:
//   - Right-click: move player to cursor
//   - Left-click: toggle debug overlay
//   - Arrow keys / WASD: pan camera
//   - ` (backtick): toggle debug
//
// Mobile / touch:
//   - One-finger tap (no drag): move player to tap location
//   - One-finger drag: pan camera
//   - Virtual joystick (left side): continuous camera panning
// ============================================================================

class Controller {

    constructor(game) {
        this.game = game;

        // Touch state
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchLastX = 0;
        this._touchLastY = 0;
        this._isDragging = false;
        this._touchStartTime = 0;
        this._touchMoved = false;

        // Virtual joystick state
        this._joystickActive = false;
        this._joystickStartX = 0;
        this._joystickStartY = 0;
        this._joystickTouchId = null;
        this._joystickDX = 0;  // normalized -1..1
        this._joystickDY = 0;
    }

    // -------------------------------------------------------------------------
    // Mouse input (desktop)
    // -------------------------------------------------------------------------

    mouseDown(e) {
        e.preventDefault();
        if (e.which == 3) this.rightMouseDown(e);
        if (e.which == 1) this.leftMouseDown(e);
        if (e.which == 2) this.middleMouseDown(e);
    }

    rightMouseDown(e) {
        this.game.p1.setDestination(...this.game.cam.translate(e.offsetX, e.offsetY));
    }

    leftMouseDown(e) {
        // Toggle debug overlay with left-click (temporary, for testing)
        this.game.debug = !this.game.debug;
    }

    middleMouseDown(e) {
        // No-op
    }

    keyDown(e) {
        if (e.repeat) return;
        switch (e.keyCode) {
            case 39: case 68: // right / D
                this.game.cam.direction[0]++;
                break;
            case 37: case 65: // left / A
                this.game.cam.direction[0]--;
                break;
            case 38: case 87: // up / W
                this.game.cam.direction[1]--;
                break;
            case 40: case 83: // down / S
                this.game.cam.direction[1]++;
                break;
            case 192: // backtick (`) — toggle debug
                this.game.debug = !this.game.debug;
                break;
        }
    }

    keyUp(e) {
        if (e.repeat) return;
        switch (e.keyCode) {
            case 39: case 68: // right / D
                this.game.cam.direction[0]--;
                break;
            case 37: case 65: // left / A
                this.game.cam.direction[0]++;
                break;
            case 38: case 87: // up / W
                this.game.cam.direction[1]++;
                break;
            case 40: case 83: // down / S
                this.game.cam.direction[1]--;
                break;
        }
    }

    contextMenu(e) {
        e.preventDefault();
    }

    // -------------------------------------------------------------------------
    // Touch input (mobile)
    // -------------------------------------------------------------------------

    /**
     * Handle touchstart. Determines if this is a joystick touch (left third
     * of screen) or a map interaction touch (rest of screen).
     */
    touchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const isLeftSide = touch.clientX < window.innerWidth / 3;

            if (isLeftSide && !this._joystickActive) {
                // Start virtual joystick
                this._joystickActive = true;
                this._joystickTouchId = touch.identifier;
                this._joystickStartX = touch.clientX;
                this._joystickStartY = touch.clientY;
                this._joystickDX = 0;
                this._joystickDY = 0;
            } else if (!this._touchMoved && this._touchStartTime === 0) {
                // Start a potential tap-or-drag on the map
                this._touchStartX = touch.clientX;
                this._touchStartY = touch.clientY;
                this._touchLastX = touch.clientX;
                this._touchLastY = touch.clientY;
                this._touchStartTime = Date.now();
                this._touchMoved = false;
                this._isDragging = false;
            }
        }
    }

    /**
     * Handle touchmove. If the touch moved beyond a small threshold, treat
     * it as a camera drag (not a tap). Update joystick vector if active.
     */
    touchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._joystickTouchId) {
                // Update joystick vector
                const dx = touch.clientX - this._joystickStartX;
                const dy = touch.clientY - this._joystickStartY;
                const maxDist = 60;  // max joystick radius in px
                this._joystickDX = Math.max(-1, Math.min(1, dx / maxDist));
                this._joystickDY = Math.max(-1, Math.min(1, dy / maxDist));
            } else if (this._touchStartTime > 0) {
                // Map interaction touch
                const dx = touch.clientX - this._touchStartX;
                const dy = touch.clientY - this._touchStartY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 10 && !this._isDragging) {
                    // Became a drag — start panning camera
                    this._isDragging = true;
                    this._touchMoved = true;
                }

                if (this._isDragging) {
                    // Pan camera by the delta since last move
                    const deltaX = touch.clientX - this._touchLastX;
                    const deltaY = touch.clientY - this._touchLastY;
                    this.game.cam.x -= deltaX;
                    this.game.cam.y -= deltaY;
                }

                this._touchLastX = touch.clientX;
                this._touchLastY = touch.clientY;
            }
        }
    }

    /**
     * Handle touchend. If the touch was a tap (no significant drag), move
     * the player. Clear joystick state if it was the joystick touch.
     */
    touchEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._joystickTouchId) {
                // Release joystick
                this._joystickActive = false;
                this._joystickTouchId = null;
                this._joystickDX = 0;
                this._joystickDY = 0;
            } else if (this._touchStartTime > 0) {
                // Check if this was a tap (no drag, quick release)
                if (!this._isDragging) {
                    // It's a tap — move player to the tapped location
                    const rect = this.game.canvas || this._getCanvasRect();
                    if (rect) {
                        // offsetX/offsetY relative to canvas
                        const offsetX = touch.clientX - rect.left;
                        const offsetY = touch.clientY - rect.top;
                        this.game.p1.setDestination(
                            ...this.game.cam.translate(offsetX, offsetY)
                        );
                    }
                }
                // Reset map touch state
                this._touchStartTime = 0;
                this._isDragging = false;
                this._touchMoved = false;
            }
        }
    }

    /**
     * Get the canvas bounding rect (helper for touch-to-canvas coordinate conversion).
     * @private
     */
    _getCanvasRect() {
        if (this.game.canvas) return this.game.canvas.getBoundingClientRect();
        const c = document.getElementById('myCanvas');
        return c ? c.getBoundingClientRect() : null;
    }

    /**
     * Apply joystick movement to camera direction. Called from the game loop
     * every frame so the joystick provides continuous panning.
     */
    applyJoystick() {
        if (!this._joystickActive) return;

        // Joystick sets camera direction proportionally
        // We use a dead zone of 0.15 to prevent drift
        const deadZone = 0.15;
        const dx = Math.abs(this._joystickDX) > deadZone ? this._joystickDX : 0;
        const dy = Math.abs(this._joystickDY) > deadZone ? this._joystickDY : 0;

        // Move camera directly (proportional to joystick deflection)
        this.game.cam.x -= dx * 8;  // 8px per frame at full deflection
        this.game.cam.y -= dy * 8;
    }

    /**
     * Get joystick state for rendering the on-screen joystick overlay.
     * @returns {object|null} { active, startX, startY, dx, dy } or null
     */
    getJoystickState() {
        if (!this._joystickActive) return null;
        return {
            active: true,
            startX: this._joystickStartX,
            startY: this._joystickStartY,
            dx: this._joystickDX,
            dy: this._joystickDY,
        };
    }
}

// Browser global
if (typeof window !== 'undefined') {
    window.Controller = Controller;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Controller };
}