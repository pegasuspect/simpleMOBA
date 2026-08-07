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
//   - Tap (no drag): move player to tap location
//   - One-finger drag: pan camera
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
            case 39: case 68: this.game.cam.direction[0]--; break;
            case 37: case 65: this.game.cam.direction[0]++; break;
            case 38: case 87: this.game.cam.direction[1]++; break;
            case 40: case 83: this.game.cam.direction[1]--; break;
        }
    }

    contextMenu(e) {
        e.preventDefault();
    }

    // -------------------------------------------------------------------------
    // Touch input (mobile)
    // -------------------------------------------------------------------------

    touchStart(e) {
        e.preventDefault();
        if (this._isDragging) return;  // one touch at a time
        const touch = e.changedTouches[0];
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;
        this._touchLastX = touch.clientX;
        this._touchLastY = touch.clientY;
        this._isDragging = false;
    }

    touchMove(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const dx = touch.clientX - this._touchStartX;
        const dy = touch.clientY - this._touchStartY;

        if (!this._isDragging && Math.sqrt(dx * dx + dy * dy) > 10) {
            this._isDragging = true;
        }

        if (this._isDragging) {
            this.game.cam.x -= touch.clientX - this._touchLastX;
            this.game.cam.y -= touch.clientY - this._touchLastY;
        }

        this._touchLastX = touch.clientX;
        this._touchLastY = touch.clientY;
    }

    touchEnd(e) {
        e.preventDefault();
        if (!this._isDragging) {
            // It's a tap — move player
            const rect = this._getCanvasRect();
            if (rect) {
                const touch = e.changedTouches[0];
                const offsetX = touch.clientX - rect.left;
                const offsetY = touch.clientY - rect.top;
                this.game.p1.setDestination(
                    ...this.game.cam.translate(offsetX, offsetY)
                );
            }
        }
        this._isDragging = false;
    }

    _getCanvasRect() {
        if (this.game.canvas) return this.game.canvas.getBoundingClientRect();
        const c = document.getElementById('myCanvas');
        return c ? c.getBoundingClientRect() : null;
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