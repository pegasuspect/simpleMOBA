// ============================================================================
// Geometry.js — Pure math / geometry helpers
// ============================================================================
// Extracted from the original lib.js Util class. These are pure functions
// with no canvas dependency — they operate on plain {x, y} point objects.
// This makes them independently testable and reusable by the map editor.
// ============================================================================

/**
 * Compute the angle (in radians) from point a to point b.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number} angle in radians
 */
function degree(a, b) {
    return Math.atan2((b.y - a.y), (b.x - a.x));
}

/**
 * Euclidean distance between two points.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function distance(a, b) {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Vector difference (b - a).
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {{x:number,y:number}}
 */
function difference(a, b) {
    return { x: b.x - a.x, y: b.y - a.y };
}

/**
 * 2D cross product (scalar): a.x * b.y - a.y * b.x
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function crossProduct(a, b) {
    return a.x * b.y - a.y * b.x;
}

/**
 * Graham Scan convex hull algorithm.
 * Given an array of {x, y} points, returns the convex hull as an ordered
 * array of {x, y} vertices (counter-clockwise).
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number,y:number}[]} convex hull vertices
 */
function grahamScan(points) {
    if (!points || points.length < 3) return points ? [...points] : [];

    // Find the bottom-most point (lowest y, then lowest x as tiebreaker)
    let bottomP = points.reduce((p, c) =>
        c.y < p.y || (c.y === p.y && c.x < p.x) ? c : p
    );

    // Sort by polar angle from bottomP
    let sorted = points.map(x => ({ ...x, degree: degree(bottomP, x) }));
    sorted.sort((a, b) => {
        let dif = a.degree - b.degree;
        if (dif === 0) {
            let f = distance(a, bottomP);
            let s = distance(b, bottomP);
            return (a.degree >= Math.PI / 2) ? (f > s ? -1 : 1) : (f < s ? -1 : 1);
        }
        return dif;
    });

    // Build hull with a stack
    let stack = [sorted[0], sorted[1]];
    for (let i = 2; i < sorted.length; i++) {
        while (crossProduct(
            difference(stack[stack.length - 2], stack[stack.length - 1]),
            difference(stack[stack.length - 1], sorted[i])
        ) < 0) stack.pop();
        stack.push(sorted[i]);
    }

    return stack.map(i => ({ x: i.x, y: i.y }));
}

// Browser globals
if (typeof window !== 'undefined') {
    window.degree = degree;
    window.distance = distance;
    window.difference = difference;
    window.crossProduct = crossProduct;
    window.grahamScan = grahamScan;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { degree, distance, difference, crossProduct, grahamScan };
}