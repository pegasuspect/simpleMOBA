// ============================================================================
// Renderer.js — Canvas drawing (formerly Util)
// ============================================================================
// Depends on: Map.js (TerrainById, EntityType, Team for entity rendering)
//
// Renamed from Util → Renderer. Geometry functions (grahamScan, degree,
// distance, etc.) have been extracted to Geometry.js as pure functions.
//
// This class is purely about drawing to a 2D canvas context. It owns no
// game state — it receives the camera and map from the Game class.
// ============================================================================

class Renderer {

    constructor(ctx, cam) {
        this.ctx = ctx;
        this.ctx.fillStyle = 'black';
        this.cam = cam;
        // Viewport dimensions — used for tile culling
        this.viewWidth = 800;
        this.viewHeight = 600;
    }

    // -------------------------------------------------------------------------
    // World-to-screen projection
    // -------------------------------------------------------------------------

    vpx(x) { return x - this.cam.x; }
    vpy(y) { return y - this.cam.y; }

    // -------------------------------------------------------------------------
    // Primitive shapes
    // -------------------------------------------------------------------------

    line(x1, y1, x2, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.vpx(x1), this.vpy(y1));
        this.ctx.lineTo(this.vpx(x2), this.vpy(y2));
        this.ctx.stroke();
    }

    circle(x, y, r, color) {
        this.ctx.beginPath();
        this.ctx.arc(this.vpx(x), this.vpy(y), r, 0, 2 * Math.PI);
        this.ctx.stroke();
        if (color) this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.fillStyle = "black";
    }

    clear() {
        this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
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

    // -------------------------------------------------------------------------
    // Entity rendering
    // -------------------------------------------------------------------------

    drawEntities(map) {
        if (!map) return;

        for (const ent of map.entities) {
            const sx = this.vpx(ent.x);
            const sy = this.vpy(ent.y);

            // Cull if off-screen
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
                    // Waypoints are invisible in game view (editor-only)
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

    /**
     * Draw a shape for an entity. Different shapes for different entity types
     * so they're visually distinguishable.
     * @private
     */
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

    // -------------------------------------------------------------------------
    // Lane rendering
    // -------------------------------------------------------------------------

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
     * @param {object} stats - { fps, tickRate, alpha, totalTicks }
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
}

// Browser global
if (typeof window !== 'undefined') {
    window.Renderer = Renderer;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Renderer };
}