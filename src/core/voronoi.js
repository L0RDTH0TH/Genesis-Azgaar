/**
 * =============================================================================
 * voronoi.js
 * Desc: Voronoi diagram generation using Delaunator
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';
import { getCellsDesired } from '../options.js';

/**
 * Voronoi diagram class
 * Creates a Voronoi diagram from Delaunay triangulation
 */
class Voronoi {
  /**
   * Creates a Voronoi diagram from the given Delaunator
   * @param {{triangles: Uint32Array, halfedges: Int32Array}} delaunay - Delaunator instance
   * @param {[number, number][]} points - List of coordinates
   * @param {number} pointsN - Number of points
   */
  constructor(delaunay, points, pointsN) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;
    this.cells = { v: [], c: [], b: [] }; // voronoi cells: v = cell vertices, c = adjacent cells, b = near-border cell
    this.vertices = { p: [], v: [], c: [] }; // cells vertices: p = vertex coordinates, v = neighboring vertices, c = adjacent cells

    // Half-edges are the indices into the delaunator outputs:
    // delaunay.triangles[e] gives the point ID where the half-edge starts
    // delaunay.halfedges[e] returns either the opposite half-edge in the adjacent triangle, or -1 if there's not an adjacent triangle.
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      if (p < this.pointsN && !this.cells.c[p]) {
        const edges = this.edgesAroundPoint(e);
        this.cells.v[p] = edges.map((e) => this.triangleOfEdge(e)); // cell: adjacent vertex
        this.cells.c[p] = edges.map((e) => this.delaunay.triangles[e]).filter((c) => c < this.pointsN); // cell: adjacent valid cells
        this.cells.b[p] = edges.length > this.cells.c[p].length ? 1 : 0; // cell: is border
      }

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
        this.vertices.v[t] = this.trianglesAdjacentToTriangle(t); // vertex: adjacent vertices
        this.vertices.c[t] = this.pointsOfTriangle(t); // vertex: adjacent cells
      }
    }
  }

  pointsOfTriangle(t) {
    return this.edgesOfTriangle(t).map((edge) => this.delaunay.triangles[edge]);
  }

  trianglesAdjacentToTriangle(t) {
    return this.edgesOfTriangle(t).map(edge => {
      const opposite = this.delaunay.halfedges[edge];
      return opposite === -1 ? undefined : this.triangleOfEdge(opposite);
    }).filter(t => t !== undefined);
  }

  edgesAroundPoint(start) {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = this.nextHalfedge(incoming);
      incoming = this.delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result;
  }

  triangleCenter(t) {
    let vertices = this.pointsOfTriangle(t).map((p) => this.points[p]);
    return this.circumcenter(vertices[0], vertices[1], vertices[2]);
  }

  edgesOfTriangle(t) {
    return [3 * t, 3 * t + 1, 3 * t + 2];
  }

  triangleOfEdge(e) {
    return Math.floor(e / 3);
  }

  nextHalfedge(e) {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  prevHalfedge(e) {
    return e % 3 === 0 ? e + 2 : e - 1;
  }

  circumcenter(a, b, c) {
    const [ax, ay] = a;
    const [bx, by] = b;
    const [cx, cy] = c;
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(D) < 1e-10) {
      // Degenerate triangle - return centroid
      return [Math.floor((ax + bx + cx) / 3), Math.floor((ay + by + cy) / 3)];
    }
    return [
      Math.floor((1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by))),
      Math.floor((1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))),
    ];
  }
}

/**
 * Add points along map edge to pseudo-clip voronoi cells
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} spacing - Point spacing
 * @returns {Array<[number, number]>} Boundary points
 */
function getBoundaryPoints(width, height, spacing) {
  const offset = rn(-1 * spacing);
  const bSpacing = spacing * 2;
  const w = width - offset * 2;
  const h = height - offset * 2;
  const numberX = Math.ceil(w / bSpacing) - 1;
  const numberY = Math.ceil(h / bSpacing) - 1;
  const points = [];

  for (let i = 0.5; i < numberX; i++) {
    let x = Math.ceil((w * i) / numberX + offset);
    points.push([x, offset], [x, h + offset]);
  }

  for (let i = 0.5; i < numberY; i++) {
    let y = Math.ceil((h * i) / numberY + offset);
    points.push([offset, y], [w + offset, y]);
  }

  return points;
}

/**
 * Get points on a regular square grid and jitter them
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} spacing - Point spacing
 * @param {Object} rng - RNG instance for randomness
 * @returns {Array<[number, number]>} Jittered grid points
 */
function getJitteredGrid(width, height, spacing, rng) {
  const radius = spacing / 2; // square radius
  const jittering = radius * 0.9; // max deviation
  const doubleJittering = jittering * 2;
  const jitter = () => rng.randFloat(-jittering, jittering);

  let points = [];
  for (let y = radius; y < height; y += spacing) {
    for (let x = radius; x < width; x += spacing) {
      const xj = Math.min(rn(x + jitter(), 2), width);
      const yj = Math.min(rn(y + jitter(), 2), height);
      points.push([xj, yj]);
    }
  }
  return points;
}

/**
 * Place points for Voronoi diagram generation
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} cellsDesired - Desired number of cells
 * @param {Object} rng - RNG instance for randomness
 * @returns {Object} Point placement data
 */
function placePoints(width, height, cellsDesired, rng) {
  const spacing = rn(Math.sqrt((width * height) / cellsDesired), 2); // spacing between points before jittering

  const boundary = getBoundaryPoints(width, height, spacing);
  const points = getJitteredGrid(width, height, spacing, rng); // points of jittered square grid
  const cellsX = Math.floor((width + 0.5 * spacing - 1e-10) / spacing);
  const cellsY = Math.floor((height + 0.5 * spacing - 1e-10) / spacing);

  return { spacing, cellsDesired, boundary, points, cellsX, cellsY };
}


/**
 * Create Voronoi diagram from options
 * @param {Object} options - Generation options (must include mapWidth, mapHeight, points/cellsDesired)
 * @param {Object} rng - RNG instance for randomness
 * @param {Function} DelaunatorClass - Delaunator class (injected as peer dependency)
 * @returns {Object} Grid object with Voronoi data
 */
export function createVoronoiDiagram(options, rng, DelaunatorClass = null) {
  const width = options.mapWidth;
  const height = options.mapHeight;
  const cellsDesired = getCellsDesired(options);

  // Place points
  const { spacing, boundary, points, cellsX, cellsY } = placePoints(width, height, cellsDesired, rng);

  // Calculate Voronoi
  // Delaunator must be provided as peer dependency
  if (!DelaunatorClass) {
    throw new Error(
      'Delaunator is required as a peer dependency. Pass it as the third parameter or install: npm install delaunator'
    );
  }
  const Delaunator = DelaunatorClass;

  const allPoints = points.concat(boundary);
  const delaunay = Delaunator.from(allPoints);
  const voronoi = new Voronoi(delaunay, allPoints, points.length);
  const cells = voronoi.cells;
  cells.i = createTypedArray({ maxValue: points.length, length: points.length }).map((_, i) => i);
  const vertices = voronoi.vertices;

  return {
    seed: options.seed || null,
    spacing,
    cellsDesired,
    boundary,
    points,
    cellsX,
    cellsY,
    cells,
    vertices,
  };
}

/**
 * Find cell index on a regular square grid
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} grid - Grid object with spacing, cellsX, cellsY
 * @returns {number} Cell index
 */
export function findGridCell(x, y, grid) {
  return (
    Math.floor(Math.min(y / grid.spacing, grid.cellsY - 1)) * grid.cellsX +
    Math.floor(Math.min(x / grid.spacing, grid.cellsX - 1))
  );
}

// Export Voronoi class for advanced usage
export { Voronoi };
