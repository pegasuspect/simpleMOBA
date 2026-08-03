class Util {

    constructor(ctx, cam) {
        this.ctx = ctx
        this.ctx.fillStyle = 'black';
        this.cam = cam
    }

    vpx(x) {return x-this.cam.x}
    vpy(y) {return y-this.cam.y}
    
    line(x1,y1,x2,y2) {
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

    grahamScan(points) { 
        let bottomP = points.reduce((p,c)=>c.y<p.y||c.y==p.y&&c.x<p.x?c:p)
        let sorted = points.map(x=>({...x, degree: this.degree(bottomP,x)}))
        sorted.sort((a,b) => {
            let dif = a.degree-b.degree
            if(dif==0) {
                let f = this.distance(a,bottomP)
                let s = this.distance(b,bottomP)
                return (a.degree >= Math.pi/2) ? (f>s ? -1 : 1) : (f<s ? -1 : 1)
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

    

    degree(a,b) {
        return Math.atan2((b.y-a.y),(b.x-a.x))
    }

    distance(a,b) {
        return Math.pow((b.y-a.y)**2+(b.x-a.x)**2,0.5)
    }

    difference(a,b) {
        return {x: b.x-a.x, y: b.y-a.y}
    }

    crossProduct(a,b) {
        return a.x*b.y-a.y*b.x
    }

    clear() {
        this.ctx.clearRect(0, 0, 800, 600);
    }
}

class Game {

    p1 = new Player()
    cam = new Camera()
    otherPlayers = []
    id = -1

    constructor(ctx, socket, id, cam) {
        this.cam = cam || new Camera()
        this.utils = new Util(ctx, this.cam)
        this.controller = new Controller(this);
    }

    update() {
        this.p1.update();
        this.cam.update();
    }

    draw() {
        this.utils.clear()
        this.p1.draw(this.utils)
        for (let i = 0; i < this.otherPlayers.length; i++) {
            const player = this.otherPlayers[i];
            if(player.id !== this.id) {
                this.utils.circle(player.x, player.y, this.p1.r, 'black');
            }
        }
    }
}

class Player {

    // state
    x = 400
    y = 300
    r = 20
    color = "red"

    // business-logic
    speed = 4
    destination = null
    bounds = null // {minX, minY, maxX, maxY} optional clamping region
    walls = null // array of {x1,y1,x2,y2} optional collision segments

    setDestination(x,y) {
        this.destination = {x, y}
    }

    clamp(x, y) {
        if (!this.bounds) return [x, y]
        let bx = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, x))
        let by = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, y))
        return [bx, by]
    }

    pointSegDist(px, py, x1, y1, x2, y2) {
        let dx = x2 - x1, dy = y2 - y1
        let len2 = dx*dx + dy*dy
        let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        let cx = x1 + t * dx, cy = y1 + t * dy
        return Math.pow((px - cx)**2 + (py - cy)**2, 0.5)
    }

    // Closest point on segment to (px,py)
    closestOnSeg(px, py, x1, y1, x2, y2) {
        let dx = x2 - x1, dy = y2 - y1
        let len2 = dx*dx + dy*dy
        let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        return [x1 + t * dx, y1 + t * dy]
    }

    // Push (x,y) out of any overlapping walls, returning the resolved [x,y].
    // Iterates so corners/diagonals resolve cleanly.
    resolveWalls(x, y) {
        if (!this.walls) return [x, y]
        for (let iter = 0; iter < 4; iter++) {
            let moved = false
            for (const w of this.walls) {
                let cp = this.closestOnSeg(x, y, w.x1, w.y1, w.x2, w.y2)
                let ddx = x - cp[0], ddy = y - cp[1]
                let d = Math.pow(ddx*ddx + ddy*ddy, 0.5)
                if (d < this.r) {
                    if (d < 0.0001) {
                        // Center is exactly on the wall: nudge along normal
                        ddx = 1; ddy = 0; d = 1
                    }
                    let push = this.r - d
                    x += (ddx / d) * push
                    y += (ddy / d) * push
                    moved = true
                }
            }
            if (!moved) break
        }
        return [x, y]
    }

    move() {
        if (!this.destination) return
        let dx = this.destination.x - this.x
        let dy = this.destination.y - this.y
        let dist = Math.pow(dx*dx + dy*dy, 0.5)
        let target = dist <= this.speed ? [this.destination.x, this.destination.y] : null
        let nx, ny
        if (target) {
            nx = target[0]; ny = target[1]
        } else {
            nx = this.x + (dx / dist) * this.speed
            ny = this.y + (dy / dist) * this.speed
        }
        let c = this.clamp(nx, ny)
        let r = this.resolveWalls(c[0], c[1])
        this.x = r[0]
        this.y = r[1]
        if (target) this.destination = null
    }

    update() {
        this.move()
    }

    draw(utils) {
        utils.circle(this.x, this.y, this.r, this.color)
    }
}

class Camera {
    x = 0
    y = 0

    speed = 2
    direction = [0,0]

    update() {
        this.x += this.direction[0]*this.speed
        this.y += this.direction[1]*this.speed
    }

    translate(x,y) {return [x+this.x, y+this.y]}
}

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

    mouseMove(e) {
        if (this.game.onMouseMove) this.game.onMouseMove(e)
    }

    rightMouseDown(e) {
        this.game.p1.setDestination(...this.game.cam.translate(e.offsetX, e.offsetY))
    }

    leftMouseDown(e) {
        if (this.game.onLeftClick) this.game.onLeftClick(e)
    }

    middleMouseDown(e) {
        this.game.utils.asd(this.game.p1, e)
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

class Editor {

    p1 = new Player()
    cam = new Camera()
    spawn = null
    mapSize = { w: 800, h: 600 }
    walls = []
    previewing = false
    placingSpawn = false
    placingWall = false
    wallStart = null
    wallEnd = null
    mouseWorld = null

    constructor(ctx) {
        this.utils = new Util(ctx, this.cam)
        this.controller = new Controller(this);
        this.ctx = ctx
    }

    worldFromEvent(e) {
        return this.cam.translate(e.offsetX, e.offsetY)
    }

    insideMap(x, y) {
        return x >= 0 && y >= 0 && x <= this.mapSize.w && y <= this.mapSize.h
    }

    onMouseMove(e) {
        this.mouseWorld = this.worldFromEvent(e)
        if (this.placingSpawn && this.mouseWorld) {
            let x = this.mouseWorld[0]
            let y = this.mouseWorld[1]
            if (!this.insideMap(x, y)) return
            this.spawn = { x, y }
        } else if (this.placingWall && this.wallStart) {
            this.wallEnd = this.mouseWorld
        }
    }

    onLeftClick(e) {
        if (this.placingSpawn) {
            const w = this.worldFromEvent(e)
            if (!this.insideMap(w[0], w[1])) return
            this.spawn = { x: w[0], y: w[1] }
            this.placingSpawn = false
            if (this.onSpawnPlaced) this.onSpawnPlaced()
        } else if (this.placingWall) {
            const w = this.worldFromEvent(e)
            if (!this.wallStart) {
                this.wallStart = w
                this.wallEnd = w
            } else {
                if (this.wallStart[0] !== w[0] || this.wallStart[1] !== w[1]) {
                    this.walls.push({ x1: this.wallStart[0], y1: this.wallStart[1], x2: w[0], y2: w[1] })
                    if (this.onWallAdded) this.onWallAdded(this.walls[this.walls.length - 1])
                }
                this.wallStart = null
                this.wallEnd = null
            }
        }
    }

    update() {
        this.cam.update();
        if (this.previewing) {
            this.p1.update();
        }
    }

    draw() {
        this.utils.clear()
        const m = this.mapSize
        const vx = this.utils.vpx(0)
        const vy = this.utils.vpy(0)
        // Map area outline
        this.ctx.strokeRect(vx, vy, m.w, m.h)
        // Walls
        for (const w of this.walls) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.utils.vpx(w.x1), this.utils.vpy(w.y1));
            this.ctx.lineTo(this.utils.vpx(w.x2), this.utils.vpy(w.y2));
            this.ctx.stroke();
        }
        // Wall preview
        if (this.placingWall && this.wallStart && this.wallEnd) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.utils.vpx(this.wallStart[0]), this.utils.vpy(this.wallStart[1]));
            this.ctx.lineTo(this.utils.vpx(this.wallEnd[0]), this.utils.vpy(this.wallEnd[1]));
            this.ctx.stroke();
        }
        if (!this.previewing && this.spawn) {
            // Draw spawn marker (X)
            const s = this.spawn;
            const sx = this.utils.vpx(s.x);
            const sy = this.utils.vpy(s.y);
            this.ctx.beginPath();
            this.ctx.moveTo(sx - 10, sy - 10);
            this.ctx.lineTo(sx + 10, sy + 10);
            this.ctx.moveTo(sx + 10, sy - 10);
            this.ctx.lineTo(sx - 10, sy + 10);
            this.ctx.stroke();
            return
        }
        if (this.previewing) this.p1.draw(this.utils)
    }
}
