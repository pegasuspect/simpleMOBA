(() => {
    const SPAWN = Object.freeze({ x: 400, y: 300 });

    class EditorController extends Controller {
        rightMouseDown() {}
        middleMouseDown() {}
    }

    class MapEditor {
        constructor(canvas, toggle, status) {
            this.canvas = canvas;
            this.toggle = toggle;
            this.status = status;
            this.ctx = canvas.getContext('2d');
            this.camera = new Camera();
            this.utils = new Util(this.ctx, this.camera);
            this.editorController = new EditorController(this);
            this.activeController = this.editorController;
            this.previewGame = null;
            this.editorCameraState = { x: 0, y: 0 };

            this.onMouseDown = (event) => this.activeController.mouseDown(event);
            this.onContextMenu = (event) => this.activeController.contextMenu(event);
            this.onKeyDown = (event) => {
                if (this.isArrowKey(event)) event.preventDefault();
                this.activeController.keyDown(event);
            };
            this.onKeyUp = (event) => {
                if (this.isArrowKey(event)) event.preventDefault();
                this.activeController.keyUp(event);
            };

            canvas.addEventListener('mousedown', this.onMouseDown);
            canvas.addEventListener('contextmenu', this.onContextMenu);
            document.addEventListener('keydown', this.onKeyDown);
            document.addEventListener('keyup', this.onKeyUp);
            toggle.addEventListener('change', () => this.setPreview(toggle.checked));

            this.frame = this.frame.bind(this);
            requestAnimationFrame(this.frame);
        }

        get cam() {
            return this.camera;
        }

        isArrowKey(event) {
            return ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key);
        }

        resetCameraDirection() {
            this.camera.direction = [0, 0];
        }

        setPreview(enabled) {
            this.resetCameraDirection();

            if (enabled) {
                this.editorCameraState = { x: this.camera.x, y: this.camera.y };
                this.previewGame = new Game(this.ctx);
                this.previewGame.cam = this.camera;
                this.previewGame.utils = new Util(this.ctx, this.camera);
                this.previewGame.p1.x = SPAWN.x;
                this.previewGame.p1.y = SPAWN.y;
                this.previewGame.p1.translation = null;
                this.activeController = this.previewGame.controller;
                this.status.textContent = 'Preview mode · right-click to move · arrow keys move the camera';
                this.canvas.focus();
                return;
            }

            this.previewGame = null;
            this.camera.x = this.editorCameraState.x;
            this.camera.y = this.editorCameraState.y;
            this.activeController = this.editorController;
            this.status.textContent = 'Editor mode · use the arrow keys to move the camera';
        }

        drawEditor() {
            this.utils.clear();
            const x = this.utils.vpx(SPAWN.x);
            const y = this.utils.vpy(SPAWN.y);
            const size = 14;

            this.ctx.save();
            this.ctx.strokeStyle = '#dc2626';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(x - size, y - size);
            this.ctx.lineTo(x + size, y + size);
            this.ctx.moveTo(x + size, y - size);
            this.ctx.lineTo(x - size, y + size);
            this.ctx.stroke();
            this.ctx.fillStyle = '#991b1b';
            this.ctx.font = '600 13px system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Spawn', x, y - 22);
            this.ctx.restore();
        }

        frame() {
            if (this.previewGame) {
                this.previewGame.update();
                this.previewGame.draw();
            } else {
                this.camera.update();
                this.drawEditor();
            }
            requestAnimationFrame(this.frame);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.mapEditor = new MapEditor(
            document.getElementById('editor-canvas'),
            document.getElementById('preview-toggle'),
            document.getElementById('status')
        );
    });
})();
