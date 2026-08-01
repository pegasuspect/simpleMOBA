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
    walls = []

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
            this.p1.stop()
        }

        this.walls = Array.isArray(mapState && mapState.walls)
            ? mapState.walls.filter(wall =>
                wall &&
                wall.start && Number.isFinite(wall.start.x) && Number.isFinite(wall.start.y) &&
                wall.end && Number.isFinite(wall.end.x) && Number.isFinite(wall.end.y)
            )
            : []

        this.constrainPlayer()
        this.resolveWallOverlaps()
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
            this.p1.stop()
        }
    }

    constrainDestination(x, y) {
        if(this.mapWidth === null || this.mapHeight === null) return [x, y]
        const minX = Math.min(this.p1.r, this.mapWidth / 2)
        const maxX = Math.max(this.mapWidth - this.p1.r, this.mapWidth / 2)
        const minY = Math.min(this.p1.r, this.mapHeight / 2)
        const maxY = Math.max(this.mapHeight - this.p1.r, this.mapHeight / 2)
        const boundaryTarget = [
            Math.min(maxX, Math.max(minX, x)),
            Math.min(maxY, Math.max(minY, y))
        ]
        return boundaryTarget
    }

    constrainCamera() {
        if(this.mapWidth === null || this.mapHeight === null) return
        const halfWidth = this.ctx.canvas.width / 2
        const halfHeight = this.ctx.canvas.height / 2
        this.cam.x = Math.min(this.mapWidth - halfWidth, Math.max(-halfWidth, this.cam.x))
        this.cam.y = Math.min(this.mapHeight - halfHeight, Math.max(-halfHeight, this.cam.y))
    }

    closestPointOnWall(point, wall) {
        const dx = wall.end.x - wall.start.x
        const dy = wall.end.y - wall.start.y
        const lengthSquared = dx * dx + dy * dy
        if(lengthSquared === 0) {
            return {x: wall.start.x, y: wall.start.y}
        }
        const projection = Math.max(0, Math.min(1,
            ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared
        ))
        return {
            x: wall.start.x + projection * dx,
            y: wall.start.y + projection * dy
        }
    }

    distanceToWall(point, wall) {
        const closest = this.closestPointOnWall(point, wall)
        return Math.hypot(point.x - closest.x, point.y - closest.y)
    }

    wallSide(point, wall) {
        return (wall.end.x - wall.start.x) * (point.y - wall.start.y) -
            (wall.end.y - wall.start.y) * (point.x - wall.start.x)
    }

    resolveWallOverlaps() {
        for(const wall of this.walls) {
            const closest = this.closestPointOnWall(this.p1, wall)
            let dx = this.p1.x - closest.x
            let dy = this.p1.y - closest.y
            let distance = Math.hypot(dx, dy)
            if(distance >= this.p1.r) continue

            if(distance === 0) {
                dx = -(wall.end.y - wall.start.y)
                dy = wall.end.x - wall.start.x
                distance = Math.hypot(dx, dy)
                if(distance === 0) {
                    dx = 1
                    dy = 0
                    distance = 1
                }
            }
            this.p1.x = closest.x + dx / distance * this.p1.r
            this.p1.y = closest.y + dy / distance * this.p1.r
            this.p1.stop()
        }
        this.constrainPlayer()
    }

    resolveWallMovement(previousPosition) {
        const intended = {x: this.p1.x - previousPosition.x, y: this.p1.y - previousPosition.y}
        const constraints = []

        for(const wall of this.walls) {
            if(this.distanceToWall(this.p1, wall) >= this.p1.r) continue
            const closest = this.closestPointOnWall(previousPosition, wall)
            let nx = previousPosition.x - closest.x
            let ny = previousPosition.y - closest.y
            let distance = Math.hypot(nx, ny)
            if(distance === 0) {
                nx = -(wall.end.y - wall.start.y)
                ny = wall.end.x - wall.start.x
                distance = Math.hypot(nx, ny) || 1
            }
            nx /= distance
            ny /= distance
            constraints.push({nx, ny, minimum: -(Math.max(0, distance - this.p1.r))})
        }

        if(!constraints.length) return
        let movement = this.solveConstrainedMovement(intended, constraints)
        const restingOnWalls = constraints.every(constraint => constraint.minimum > -0.01)
        if(restingOnWalls && this.p1.destination) {
            const remainingGoal = {
                x: this.p1.destination.x - previousPosition.x,
                y: this.p1.destination.y - previousPosition.y
            }
            const contactConstraints = constraints.map(constraint => ({...constraint, minimum: 0}))
            const allowedGoal = this.solveConstrainedMovement(remainingGoal, contactConstraints)
            const allowedDistance = Math.hypot(allowedGoal.x, allowedGoal.y)
            if(allowedDistance > 0) {
                const step = Math.min(this.p1.speed, allowedDistance)
                movement = {
                    x: allowedGoal.x / allowedDistance * step,
                    y: allowedGoal.y / allowedDistance * step
                }
            }
        }
        this.p1.x = previousPosition.x + movement.x
        this.p1.y = previousPosition.y + movement.y
        this.resolveWallPenetration(previousPosition)
    }

    resolveWallPenetration(previousPosition) {
        for(let iteration = 0; iteration < 4; iteration++) {
            const constraints = []
            for(const wall of this.walls) {
                const closest = this.closestPointOnWall(this.p1, wall)
                let nx = this.p1.x - closest.x
                let ny = this.p1.y - closest.y
                let distance = Math.hypot(nx, ny)
                if(distance >= this.p1.r - 1e-7) continue
                if(distance === 0) {
                    const previousClosest = this.closestPointOnWall(previousPosition, wall)
                    nx = previousPosition.x - previousClosest.x
                    ny = previousPosition.y - previousClosest.y
                    distance = Math.hypot(nx, ny)
                    if(distance === 0) {
                        nx = -(wall.end.y - wall.start.y)
                        ny = wall.end.x - wall.start.x
                        distance = Math.hypot(nx, ny) || 1
                    }
                }
                constraints.push({
                    nx: nx / distance,
                    ny: ny / distance,
                    minimum: this.p1.r - distance
                })
            }
            if(!constraints.length) return
            const correction = this.solveConstrainedMovement({x: 0, y: 0}, constraints)
            this.p1.x += correction.x
            this.p1.y += correction.y
        }
    }

    solveConstrainedMovement(desired, constraints) {
        const candidates = [desired, {x: 0, y: 0}]
        for(const constraint of constraints) {
            const dot = constraint.nx * desired.x + constraint.ny * desired.y
            const adjustment = constraint.minimum - dot
            candidates.push({
                x: desired.x + adjustment * constraint.nx,
                y: desired.y + adjustment * constraint.ny
            })
        }
        for(let first = 0; first < constraints.length; first++) {
            for(let second = first + 1; second < constraints.length; second++) {
                const a = constraints[first]
                const b = constraints[second]
                const determinant = a.nx * b.ny - a.ny * b.nx
                if(Math.abs(determinant) < 1e-9) continue
                candidates.push({
                    x: (a.minimum * b.ny - a.ny * b.minimum) / determinant,
                    y: (a.nx * b.minimum - a.minimum * b.nx) / determinant
                })
            }
        }

        const feasible = candidates.filter(candidate => constraints.every(constraint =>
            constraint.nx * candidate.x + constraint.ny * candidate.y >= constraint.minimum - 1e-7
        ))
        feasible.sort((a, b) =>
            (a.x - desired.x) ** 2 + (a.y - desired.y) ** 2 -
            ((b.x - desired.x) ** 2 + (b.y - desired.y) ** 2)
        )
        return feasible[0] || {x: 0, y: 0}
    }

    update() {
        const previousPosition = {x: this.p1.x, y: this.p1.y}
        this.p1.update();
        this.cam.update();
        this.constrainPlayer();
        this.resolveWallMovement(previousPosition);
        this.constrainCamera();
    }

    draw() {
        this.utils.clear()
        this.drawMapBoundary()
        this.drawWalls()
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

    drawWalls() {
        this.ctx.save()
        this.ctx.strokeStyle = '#111827'
        this.ctx.lineWidth = 4
        this.ctx.lineCap = 'round'
        for(const wall of this.walls) {
            this.ctx.beginPath()
            this.ctx.moveTo(this.utils.vpx(wall.start.x), this.utils.vpy(wall.start.y))
            this.ctx.lineTo(this.utils.vpx(wall.end.x), this.utils.vpy(wall.end.y))
            this.ctx.stroke()
        }
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
    destination = null

    setDestination(x,y) {
        this.destination = {x, y}
    }

    stop() {
        this.destination = null
    }

    move() {
        if(!this.destination) return
        const dx = this.destination.x - this.x
        const dy = this.destination.y - this.y
        const distance = Math.hypot(dx, dy)
        if(distance <= this.speed) {
            this.x = this.destination.x
            this.y = this.destination.y
            this.destination = null
            return
        }
        this.x += dx / distance * this.speed
        this.y += dy / distance * this.speed
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
