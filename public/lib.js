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

    constructor(ctx, socket, id) {
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
    translation = null

    setDestination(x,y) {
        let h = Math.pow((y-this.y)**2+(x-this.x)**2, 0.5)
        let i = Math.round(h/this.speed)
        let r = Math.atan2((y-this.y),(x-this.x))
        this.translation = [i,[Math.cos(r)*this.speed, Math.sin(r)*this.speed]]
    }

    move() {
        if(this.translation) {
            this.translation[0]--
            this.x += this.translation[1][0]
            this.y += this.translation[1][1]

            if(this.translation[0] == 0) {
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
        this.game.p1.setDestination(...this.game.cam.translate(e.offsetX, e.offsetY))
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
