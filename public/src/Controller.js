// ============================================================================
// Controller.js — Input handling (keyboard + mouse)
// ============================================================================
// Depends on: Game class (references game.p1, game.cam, game.debug)
// ============================================================================

class Controller {

    constructor(game) {
        this.game = game;
    }

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
            case 39: // right
                this.game.cam.direction[0]++;
                break;
            case 37: // left
                this.game.cam.direction[0]--;
                break;
            case 38: // up
                this.game.cam.direction[1]--;
                break;
            case 40: // down
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
            case 39: // right
                this.game.cam.direction[0]--;
                break;
            case 37: // left
                this.game.cam.direction[0]++;
                break;
            case 38: // up
                this.game.cam.direction[1]++;
                break;
            case 40: // down
                this.game.cam.direction[1]--;
                break;
        }
    }

    contextMenu(e) {
        e.preventDefault();
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