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
    mapWidth = null
    mapHeight = null

    constructor(ctx, socket, id) {
        this.ctx = ctx
        this.utils = new Util(ctx, this.cam)
        this.controller = new Controller(this);
    }

    applyMapState(mapState) {
        const size = mapState && typeof mapState.size === 'string'
            ? mapState.size.match(/^(\d+)x(\d+)$/)
            : null
        if(size && Number(size[1]) > 0 && Number(size[2]) > 0) {
            this.mapWidth = Number(size[1])
            this.mapHeight = Number(size[2])
        }

        const spawn = mapState && mapState.spawn
        if(spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.y)) {
            this.p1.x = spawn.x
            this.p1.y = spawn.y
            this.p1.translation = null
        }

        this.constrainPlayer()
        this.constrainCamera()
    }

    constrainPlayer() {
        if(this.mapWidth === null || this.mapHeight === null) return
        const minX = Math.min(this.p1.r, this.mapWidth / 2)
        const maxX = Math.max(this.mapWidth - this.p1.r, this.mapWidth / 2)
        const minY = Math.min(this.p1.r, this.mapHeight / 2)
        const maxY = Math.max(this.mapHeight - this.p1.r, this.mapHeight / 2)
        const x = Math.min(maxX, Math.max(minX, this.p1.x))
        const y = Math.min(maxY, Math.max(minY, this.p1.y))

        if(x !== this.p1.x || y !== this.p1.y) {
            this.p1.x = x
            this.p1.y = y
            this.p1.translation = null
        }
    }

    constrainDestination(x, y) {
        if(this.mapWidth === null || this.mapHeight === null) return [x, y]
        const minX = Math.min(this.p1.r, this.mapWidth / 2)
        const maxX = Math.max(this.mapWidth - this.p1.r, this.mapWidth / 2)
        const minY = Math.min(this.p1.r, this.mapHeight / 2)
        const maxY = Math.max(this.mapHeight - this.p1.r, this.mapHeight / 2)
        return [
            Math.min(maxX, Math.max(minX, x)),
            Math.min(maxY, Math.max(minY, y))
        ]
    }

    constrainCamera() {
        if(this.mapWidth === null || this.mapHeight === null) return
        const halfWidth = this.ctx.canvas.width / 2
        const halfHeight = this.ctx.canvas.height / 2
        this.cam.x = Math.min(this.mapWidth - halfWidth, Math.max(-halfWidth, this.cam.x))
        this.cam.y = Math.min(this.mapHeight - halfHeight, Math.max(-halfHeight, this.cam.y))
    }

    update() {
        this.p1.update();
        this.cam.update();
        this.constrainPlayer();
        this.constrainCamera();
    }

    draw() {
        this.utils.clear()
        this.drawMapBoundary()
        this.p1.draw(this.utils)
        for (let i = 0; i < this.otherPlayers.length; i++) {
            const player = this.otherPlayers[i];
            if(player.id !== this.id) {
                this.utils.circle(player.x, player.y, this.p1.r, 'black');
            }
        }
    }

    drawMapBoundary() {
        if(this.mapWidth === null || this.mapHeight === null) return
        this.ctx.save()
        this.ctx.strokeStyle = '#334155'
        this.ctx.lineWidth = 3
        this.ctx.strokeRect(
            this.utils.vpx(0),
            this.utils.vpy(0),
            this.mapWidth,
            this.mapHeight
        )
        this.ctx.restore()
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
    translation = null

    setDestination(x,y) {
        let h = Math.pow((y-this.y)**2+(x-this.x)**2, 0.5)
        if(h === 0) {
            this.translation = null
            return
        }
        let i = Math.ceil(h/this.speed)
        this.translation = [i,[(x-this.x)/i, (y-this.y)/i],[x,y]]
    }

    move() {
        if(this.translation) {
            this.translation[0]--
            this.x += this.translation[1][0]
            this.y += this.translation[1][1]

            if(this.translation[0] == 0) {
                this.x = this.translation[2][0]
                this.y = this.translation[2][1]
                this.translation = null
            }
        }
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

    rightMouseDown(e) {
        const destination = this.game.cam.translate(e.offsetX, e.offsetY)
        this.game.p1.setDestination(...this.game.constrainDestination(...destination))
    }

    leftMouseDown(e) {

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
