(() => {
    const DEFAULT_SPAWN = Object.freeze({ x: 400, y: 300 });
    const DEFAULT_SIZE = '800x600';
    const SIZE_PATTERN = /^(\d+)x(\d+)$/;
    const SPAWN_INSET = 20;

    async function apiFetch(path, options) {
        try {
            const response = await fetch(path, options);
            if (response.status !== 404 && response.status !== 405) return response;
        } catch (error) {
            if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) throw error;
        }

        if (!['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.port === '3000') {
            throw new Error('The game server is unavailable.');
        }

        return fetch(`http://${window.location.hostname}:3000${path}`, options);
    }

    class EditorController extends Controller {
        leftMouseDown(event) {
            this.game.handleEditorClick(event);
        }

        rightMouseDown() {}
        middleMouseDown() {}
    }

    class MapEditor {
        constructor(elements) {
            this.canvas = elements.canvas;
            this.toggle = elements.toggle;
            this.status = elements.status;
            this.spawnButton = elements.spawnButton;
            this.wallsButton = elements.wallsButton;
            this.eraserButton = elements.eraserButton;
            this.sizeInput = elements.sizeInput;
            this.ctx = this.canvas.getContext('2d');
            this.camera = new Camera();
            this.utils = new Util(this.ctx, this.camera);
            this.editorController = new EditorController(this);
            this.activeController = this.editorController;
            this.previewGame = null;
            this.editorCameraState = { x: 0, y: 0 };
            this.mapState = {};
            this.spawn = { ...DEFAULT_SPAWN };
            this.mapSize = DEFAULT_SIZE;
            this.placingSpawn = false;
            this.spawnPreview = null;
            this.walls = [];
            this.wallMode = false;
            this.wallStart = null;
            this.wallPreview = null;
            this.eraserMode = false;
            this.saveQueue = Promise.resolve();

            this.onMouseDown = (event) => this.activeController.mouseDown(event);
            this.onMouseMove = (event) => {
                const point = this.worldPoint(event);
                if (this.placingSpawn && this.pointWithinBoundaries(point, SPAWN_INSET)) {
                    this.spawnPreview = point;
                } else if (this.wallMode && this.wallStart && this.pointWithinBoundaries(point)) {
                    this.wallPreview = point;
                }
            };
            this.onContextMenu = (event) => this.activeController.contextMenu(event);
            this.onKeyDown = (event) => {
                if (this.isArrowKey(event)) event.preventDefault();
                this.activeController.keyDown(event);
            };
            this.onKeyUp = (event) => {
                if (this.isArrowKey(event)) event.preventDefault();
                this.activeController.keyUp(event);
            };

            this.canvas.addEventListener('mousedown', this.onMouseDown);
            this.canvas.addEventListener('mousemove', this.onMouseMove);
            this.canvas.addEventListener('contextmenu', this.onContextMenu);
            document.addEventListener('keydown', this.onKeyDown);
            document.addEventListener('keyup', this.onKeyUp);
            this.toggle.addEventListener('change', () => this.setPreview(this.toggle.checked));
            this.spawnButton.addEventListener('click', () => this.beginSpawnPlacement());
            this.wallsButton.addEventListener('click', () => this.toggleWallMode());
            this.eraserButton.addEventListener('click', () => this.toggleEraserMode());
            this.sizeInput.addEventListener('input', () => this.validateSizeInput());
            this.sizeInput.addEventListener('change', () => this.applyMapSize());
            this.sizeInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') this.sizeInput.blur();
            });

            this.frame = this.frame.bind(this);
            requestAnimationFrame(this.frame);
            this.loadMapState();
        }

        get cam() {
            return this.camera;
        }

        async loadMapState() {
            try {
                const response = await apiFetch('/map-state');
                if (!response.ok) throw new Error(`Map state request failed (${response.status})`);
                const data = await response.json();
                if (!data || Array.isArray(data) || typeof data !== 'object') {
                    throw new Error('Map state is not an object');
                }
                this.mapState = data;
                this.mapSize = this.validSize(data.size) ? data.size : DEFAULT_SIZE;
                const loadedSpawn = this.validSpawn(data.spawn) ? data.spawn : DEFAULT_SPAWN;
                this.spawn = this.clampMapPoint(loadedSpawn, SPAWN_INSET);
                const adjustedSpawn = this.validSpawn(data.spawn) &&
                    (this.spawn.x !== data.spawn.x || this.spawn.y !== data.spawn.y);
                this.mapState.spawn = { ...this.spawn };
                this.mapState.size = this.mapSize;
                this.walls = this.normalizeWalls(data.walls);
                const adjustedWalls = JSON.stringify(this.walls) !== JSON.stringify(data.walls || []);
                this.mapState.walls = this.walls.map(wall => this.copyWall(wall));
                this.sizeInput.value = this.mapSize;
                this.status.textContent = 'Editor mode · use the arrow keys to move the camera';
                if (adjustedSpawn || adjustedWalls) {
                    this.saveMapState('Out-of-bounds objects were moved inside the map boundaries.');
                }
            } catch (error) {
                console.error(error);
                this.mapState = {};
                this.spawn = { ...DEFAULT_SPAWN };
                this.mapSize = DEFAULT_SIZE;
                this.walls = [];
                this.status.textContent = 'Could not load map data; using game defaults.';
            } finally {
                this.toggle.disabled = false;
                this.spawnButton.disabled = false;
                this.wallsButton.disabled = false;
                this.eraserButton.disabled = false;
                this.sizeInput.disabled = false;
                this.updateSpawnButton();
            }
        }

        validSpawn(spawn) {
            return spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.y);
        }

        validSize(value) {
            const match = typeof value === 'string' && value.match(SIZE_PATTERN);
            return Boolean(match && Number(match[1]) > 0 && Number(match[2]) > 0);
        }

        validateSizeInput() {
            const valid = this.validSize(this.sizeInput.value);
            this.sizeInput.classList.toggle('invalid', !valid);
            this.sizeInput.setCustomValidity(valid ? '' : 'Use two positive integers separated by x, for example 800x600.');
            return valid;
        }

        applyMapSize() {
            if (!this.validateSizeInput()) {
                this.status.textContent = 'Map boundaries must look like 800x600.';
                return;
            }

            this.mapSize = this.sizeInput.value;
            this.mapState.size = this.mapSize;
            if (this.spawn) {
                this.spawn = this.clampMapPoint(this.spawn, SPAWN_INSET);
                this.mapState.spawn = { ...this.spawn };
            }
            this.walls = this.normalizeWalls(this.walls);
            this.mapState.walls = this.walls.map(wall => this.copyWall(wall));
            this.clampCamera();
            this.saveMapState('Map boundaries saved.');
        }

        beginSpawnPlacement() {
            if (this.placingSpawn) {
                this.canvas.focus();
                return;
            }

            this.setWallMode(false);
            this.spawn = null;
            delete this.mapState.spawn;
            this.placingSpawn = true;
            this.spawnPreview = null;
            this.toggle.disabled = true;
            this.sizeInput.disabled = true;
            this.wallsButton.disabled = true;
            this.eraserButton.disabled = true;
            this.updateSpawnButton();
            this.status.textContent = 'Move over the map and click to place the spawn point.';
            this.saveMapState();
            this.canvas.focus();
        }

        placeSpawn(event) {
            if (!this.placingSpawn) return;

            const point = this.worldPoint(event);
            if (!this.pointWithinBoundaries(point, SPAWN_INSET)) {
                this.status.textContent = 'The spawn point must be placed inside the map boundaries.';
                return;
            }

            this.spawn = point;
            this.mapState.spawn = { ...this.spawn };
            this.placingSpawn = false;
            this.spawnPreview = null;
            this.toggle.disabled = false;
            this.sizeInput.disabled = false;
            this.wallsButton.disabled = false;
            this.eraserButton.disabled = false;
            this.updateSpawnButton();
            this.saveMapState('Spawn point saved.');
        }

        handleEditorClick(event) {
            if (this.placingSpawn) {
                this.placeSpawn(event);
            } else if (this.wallMode) {
                this.placeWallPoint(event);
            } else if (this.eraserMode) {
                this.eraseObject(event);
            }
        }

        toggleWallMode() {
            this.setWallMode(!this.wallMode);
            if (this.wallMode) this.canvas.focus();
        }

        setWallMode(enabled) {
            if (enabled) this.setEraserMode(false);
            this.wallMode = enabled;
            this.wallStart = null;
            this.wallPreview = null;
            this.wallsButton.setAttribute('aria-pressed', String(enabled));
            this.spawnButton.disabled = enabled;
            this.sizeInput.disabled = enabled;
            if (enabled) {
                this.status.textContent = 'Wall mode · click a start point, then click an end point.';
            } else if (!this.previewGame && !this.placingSpawn) {
                this.status.textContent = 'Editor mode · use the arrow keys to move the camera';
            }
        }

        toggleEraserMode() {
            this.setEraserMode(!this.eraserMode);
            if (this.eraserMode) this.canvas.focus();
        }

        setEraserMode(enabled) {
            if (enabled && this.wallMode) {
                this.wallMode = false;
                this.wallStart = null;
                this.wallPreview = null;
                this.wallsButton.setAttribute('aria-pressed', 'false');
            }
            this.eraserMode = enabled;
            this.eraserButton.setAttribute('aria-pressed', String(enabled));
            this.spawnButton.disabled = enabled;
            this.sizeInput.disabled = enabled;
            if (enabled) {
                this.status.textContent = 'Eraser mode · click a wall or spawn point to remove it.';
            } else if (!this.wallMode && !this.previewGame && !this.placingSpawn) {
                this.status.textContent = 'Editor mode · use the arrow keys to move the camera';
            }
        }

        placeWallPoint(event) {
            const point = this.worldPoint(event);
            if (!this.pointWithinBoundaries(point)) {
                this.status.textContent = 'Wall points must be inside the map boundaries.';
                return;
            }

            if (!this.wallStart) {
                this.wallStart = point;
                this.wallPreview = point;
                this.status.textContent = 'Move the mouse and click to set the wall end point.';
                return;
            }

            if (point.x === this.wallStart.x && point.y === this.wallStart.y) {
                this.status.textContent = 'A wall needs two different points.';
                return;
            }

            this.walls.push({ start: this.wallStart, end: point });
            this.mapState.walls = this.walls.map(wall => this.copyWall(wall));
            this.wallStart = null;
            this.wallPreview = null;
            this.saveMapState('Wall saved · click to start another wall.');
        }

        copyWall(wall) {
            return {
                start: { x: wall.start.x, y: wall.start.y },
                end: { x: wall.end.x, y: wall.end.y }
            };
        }

        normalizeWalls(walls) {
            if (!Array.isArray(walls)) return [];
            return walls
                .filter(wall => wall && this.validSpawn(wall.start) && this.validSpawn(wall.end))
                .map(wall => ({
                    start: this.clampMapPoint(wall.start),
                    end: this.clampMapPoint(wall.end)
                }))
                .filter(wall => wall.start.x !== wall.end.x || wall.start.y !== wall.end.y);
        }

        distanceToWall(point, wall) {
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const lengthSquared = dx * dx + dy * dy;
            if (lengthSquared === 0) return Math.hypot(point.x - wall.start.x, point.y - wall.start.y);
            const projection = Math.max(0, Math.min(1,
                ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared
            ));
            return Math.hypot(
                point.x - (wall.start.x + projection * dx),
                point.y - (wall.start.y + projection * dy)
            );
        }

        eraseObject(event) {
            const point = this.worldPoint(event);
            const candidates = this.walls.map((wall, index) => ({
                type: 'wall', index, distance: this.distanceToWall(point, wall)
            }));
            if (this.spawn) {
                candidates.push({
                    type: 'spawn',
                    distance: Math.hypot(point.x - this.spawn.x, point.y - this.spawn.y)
                });
            }
            candidates.sort((a, b) => a.distance - b.distance);
            const target = candidates[0];
            if (!target || target.distance > 16) {
                this.status.textContent = 'No object found there. Click closer to a wall or spawn point.';
                return;
            }

            if (target.type === 'wall') {
                this.walls.splice(target.index, 1);
                this.mapState.walls = this.walls.map(wall => this.copyWall(wall));
                this.saveMapState('Wall removed.');
            } else {
                this.spawn = null;
                delete this.mapState.spawn;
                this.updateSpawnButton();
                this.saveMapState('Spawn point removed.');
            }
        }

        updateSpawnButton() {
            this.spawnButton.textContent = this.spawn ? 'Remove Spawn' : 'Place Spawn';
        }

        worldPoint(event) {
            const scaleX = this.canvas.width / this.canvas.clientWidth;
            const scaleY = this.canvas.height / this.canvas.clientHeight;
            return {
                x: Math.round(event.offsetX * scaleX + this.camera.x),
                y: Math.round(event.offsetY * scaleY + this.camera.y)
            };
        }

        mapDimensions() {
            const dimensions = this.mapSize.match(SIZE_PATTERN);
            return { width: Number(dimensions[1]), height: Number(dimensions[2]) };
        }

        pointWithinBoundaries(point, inset = 0) {
            const { width, height } = this.mapDimensions();
            if (width < inset * 2 || height < inset * 2) return false;
            const minX = Math.min(inset, width / 2);
            const maxX = Math.max(width - inset, width / 2);
            const minY = Math.min(inset, height / 2);
            const maxY = Math.max(height - inset, height / 2);

            return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        }

        clampMapPoint(point, inset = 0) {
            const { width, height } = this.mapDimensions();
            const minX = Math.min(inset, width / 2);
            const maxX = Math.max(width - inset, width / 2);
            const minY = Math.min(inset, height / 2);
            const maxY = Math.max(height - inset, height / 2);

            return {
                x: Math.round(Math.min(maxX, Math.max(minX, point.x))),
                y: Math.round(Math.min(maxY, Math.max(minY, point.y)))
            };
        }

        saveMapState(successMessage) {
            const snapshot = JSON.parse(JSON.stringify(this.mapState));
            this.saveQueue = this.saveQueue
                .catch(() => {})
                .then(async () => {
                    const response = await apiFetch('/save-map', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(snapshot)
                    });
                    if (!response.ok) throw new Error(`Save failed (${response.status})`);
                    if (successMessage) this.status.textContent = successMessage;
                })
                .catch((error) => {
                    console.error(error);
                    this.status.textContent = 'Could not save map data. Your edits remain in this tab.';
                });
            return this.saveQueue;
        }

        isArrowKey(event) {
            return ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key);
        }

        resetCameraDirection() {
            this.camera.direction = [0, 0];
        }

        clampCamera() {
            const { width: mapWidth, height: mapHeight } = this.mapDimensions();
            const halfViewWidth = this.canvas.width / 2;
            const halfViewHeight = this.canvas.height / 2;

            this.camera.x = Math.min(
                mapWidth - halfViewWidth,
                Math.max(-halfViewWidth, this.camera.x)
            );
            this.camera.y = Math.min(
                mapHeight - halfViewHeight,
                Math.max(-halfViewHeight, this.camera.y)
            );
        }

        setPreview(enabled) {
            this.resetCameraDirection();

            if (enabled) {
                if (!this.spawn) {
                    this.toggle.checked = false;
                    this.status.textContent = 'Place a spawn point before starting Preview.';
                    return;
                }
                this.setWallMode(false);
                this.setEraserMode(false);
                this.editorCameraState = { x: this.camera.x, y: this.camera.y };
                this.previewGame = new Game(this.ctx);
                this.previewGame.cam = this.camera;
                this.previewGame.utils = new Util(this.ctx, this.camera);
                this.previewGame.applyMapState({
                    size: this.mapSize,
                    spawn: this.spawn,
                    walls: this.walls
                });
                this.activeController = this.previewGame.controller;
                this.spawnButton.disabled = true;
                this.sizeInput.disabled = true;
                this.wallsButton.disabled = true;
                this.eraserButton.disabled = true;
                this.status.textContent = 'Preview mode · right-click to move · arrow keys move the camera';
                this.canvas.focus();
                return;
            }

            this.previewGame = null;
            this.camera.x = this.editorCameraState.x;
            this.camera.y = this.editorCameraState.y;
            this.activeController = this.editorController;
            this.spawnButton.disabled = false;
            this.sizeInput.disabled = false;
            this.wallsButton.disabled = false;
            this.eraserButton.disabled = false;
            this.status.textContent = 'Editor mode · use the arrow keys to move the camera';
        }

        drawSpawn(spawn, preview = false) {
            if (!spawn) return;
            const x = this.utils.vpx(spawn.x);
            const y = this.utils.vpy(spawn.y);
            const size = 14;

            this.ctx.save();
            this.ctx.globalAlpha = preview ? .55 : 1;
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

        drawWall(wall, preview = false) {
            if (!wall) return;
            this.ctx.save();
            this.ctx.globalAlpha = preview ? .55 : 1;
            this.ctx.strokeStyle = '#111827';
            this.ctx.lineWidth = 4;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(this.utils.vpx(wall.start.x), this.utils.vpy(wall.start.y));
            this.ctx.lineTo(this.utils.vpx(wall.end.x), this.utils.vpy(wall.end.y));
            this.ctx.stroke();
            this.ctx.restore();
        }

        drawEditor() {
            this.utils.clear();
            const dimensions = this.mapSize.match(SIZE_PATTERN);
            const width = Number(dimensions[1]);
            const height = Number(dimensions[2]);

            this.ctx.save();
            this.ctx.strokeStyle = '#94a3b8';
            this.ctx.setLineDash([8, 6]);
            this.ctx.strokeRect(this.utils.vpx(0), this.utils.vpy(0), width, height);
            this.ctx.restore();
            this.walls.forEach(wall => this.drawWall(wall));
            if (this.wallStart && this.wallPreview) {
                this.drawWall({ start: this.wallStart, end: this.wallPreview }, true);
            }
            this.drawSpawn(this.spawn);
            this.drawSpawn(this.spawnPreview, true);
        }

        frame() {
            if (this.previewGame) {
                this.previewGame.update();
                this.previewGame.draw();
            } else {
                this.camera.update();
                this.clampCamera();
                this.drawEditor();
            }
            requestAnimationFrame(this.frame);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.mapEditor = new MapEditor({
            canvas: document.getElementById('editor-canvas'),
            toggle: document.getElementById('preview-toggle'),
            status: document.getElementById('status'),
            spawnButton: document.getElementById('spawn-button'),
            wallsButton: document.getElementById('walls-button'),
            eraserButton: document.getElementById('eraser-button'),
            sizeInput: document.getElementById('map-size')
        });
    });
})();
