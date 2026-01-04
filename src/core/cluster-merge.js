/**
 * =============================================================================
 * cluster-merge.js
 * Desc: Post-processing cluster merging to connect nearby land features
 * Author: Lordthoth (based on original Azgaar logic)
 * =============================================================================
 */

/**
 * Calculate squared distance between two points
 * @param {Array<number>} p1 - Point 1 [x, y]
 * @param {Array<number>} p2 - Point 2 [x, y]
 * @returns {number} Squared distance
 */
function dist2(p1, p2) {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return dx * dx + dy * dy;
}

/**
 * Merge nearby land clusters by bridging gaps between them
 * This raises water cells between nearby land features to create land bridges
 * @param {Object} pack - Pack object (will be modified)
 * @param {Object} options - Options with mergeDistance threshold
 * @returns {number} Number of clusters merged
 */
export function mergeNearbyClusters(pack, options = {}) {
  if (!pack || !pack.cells || !pack.features) {
    return 0;
  }

  const { cells, features } = pack;
  const { c: neighbors, h: heights, p: points } = cells;
  const packCellsNumber = cells.i.length;
  
  // Get land features (islands/continents)
  const landFeatures = features.filter(f => f && f.land === true);
  if (landFeatures.length <= 1) return 0; // No merging needed if 0 or 1 land feature

  // Merge distance threshold: 2-5 cells (configurable)
  const mergeDistance = options.mergeDistance || 3; // Default: 3 cells
  const maxMergeDistance = options.maxMergeDistance || 5; // Maximum distance to consider
  const minClusterSize = options.minClusterSize || 10; // Don't merge very small clusters (preserve islands)

  let mergesPerformed = 0;
  const mergedFeatures = new Set();

  // Find pairs of nearby land features
  for (let i = 0; i < landFeatures.length; i++) {
    const feature1 = landFeatures[i];
    if (mergedFeatures.has(feature1.i)) continue;
    if (feature1.cells < minClusterSize) continue; // Skip very small clusters

    for (let j = i + 1; j < landFeatures.length; j++) {
      const feature2 = landFeatures[j];
      if (mergedFeatures.has(feature2.i)) continue;
      if (feature2.cells < minClusterSize) continue; // Skip very small clusters

      // Find minimum distance between features
      const distance = findMinDistanceBetweenFeatures(feature1, feature2, pack, cells);
      
      if (distance <= mergeDistance && distance > 0) {
        // Bridge the gap between features
        const bridged = bridgeFeatures(feature1, feature2, pack, cells, distance, maxMergeDistance);
        if (bridged) {
          mergesPerformed++;
          mergedFeatures.add(feature2.i); // Mark feature2 as merged into feature1
        }
      }
    }
  }

  return mergesPerformed;
}

/**
 * Find minimum distance (in cells) between two land features
 * Returns the minimum number of water cells between them, or -1 if not reachable
 */
function findMinDistanceBetweenFeatures(feature1, feature2, pack, cells) {
  const { c: neighbors, h: heights } = cells;
  const packCellsNumber = cells.i.length;

  // Get all cells in each feature
  const feature1Cells = [];
  const feature2Cells = [];
  
  for (let i = 0; i < packCellsNumber; i++) {
    if (pack.cells.f[i] === feature1.i) feature1Cells.push(i);
    if (pack.cells.f[i] === feature2.i) feature2Cells.push(i);
  }

  // Use BFS to find shortest path through water between features
  const queue = [];
  const visited = new Uint8Array(packCellsNumber);
  const distances = new Uint16Array(packCellsNumber);
  distances.fill(65535); // Max distance

  // Start BFS from all feature1 coast cells (land cells adjacent to water)
  for (const cellId of feature1Cells) {
    if (heights[cellId] >= 20) { // Land cell
      const hasWaterNeighbor = neighbors[cellId]?.some(neibId => 
        neibId >= 0 && neibId < packCellsNumber && heights[neibId] < 20
      );
      if (hasWaterNeighbor) {
        queue.push(cellId);
        visited[cellId] = 1;
        distances[cellId] = 0;
      }
    }
  }

  // BFS to find shortest path to feature2
  let minDistance = -1;
  while (queue.length > 0) {
    const current = queue.shift();
    const currentDist = distances[current];

    // Check if we reached feature2
    if (pack.cells.f[current] === feature2.i && heights[current] >= 20) {
      minDistance = currentDist;
      break;
    }

    // Explore neighbors
    if (!neighbors[current]) continue;
    for (const neighborId of neighbors[current]) {
      if (neighborId < 0 || neighborId >= packCellsNumber) continue;
      if (visited[neighborId]) continue;

      // Only traverse water cells (or land cells of feature2)
      const isWater = heights[neighborId] < 20;
      const isFeature2Land = pack.cells.f[neighborId] === feature2.i && heights[neighborId] >= 20;
      
      if (isWater || isFeature2Land) {
        visited[neighborId] = 1;
        distances[neighborId] = currentDist + 1;
        queue.push(neighborId);
      }
    }
  }

  return minDistance;
}

/**
 * Bridge two features by raising water cells between them
 * Returns true if bridging was successful
 */
function bridgeFeatures(feature1, feature2, pack, cells, distance, maxDistance) {
  if (distance > maxDistance) return false;

  const { c: neighbors, h: heights, p: points } = cells;
  const packCellsNumber = cells.i.length;

  // Find representative cells from each feature (coast cells)
  const feature1Coast = [];
  const feature2Coast = [];
  
  for (let i = 0; i < packCellsNumber; i++) {
    if (pack.cells.f[i] === feature1.i && heights[i] >= 20) {
      const hasWaterNeighbor = neighbors[i]?.some(neibId => 
        neibId >= 0 && neibId < packCellsNumber && heights[neibId] < 20
      );
      if (hasWaterNeighbor) feature1Coast.push(i);
    }
    if (pack.cells.f[i] === feature2.i && heights[i] >= 20) {
      const hasWaterNeighbor = neighbors[i]?.some(neibId => 
        neibId >= 0 && neibId < packCellsNumber && heights[neibId] < 20
      );
      if (hasWaterNeighbor) feature2Coast.push(i);
    }
  }

  if (feature1Coast.length === 0 || feature2Coast.length === 0) return false;

  // Find closest pair of coast cells
  let minDist2 = Infinity;
  let closestPair = null;
  
  for (const c1 of feature1Coast) {
    for (const c2 of feature2Coast) {
      const d2 = dist2(points[c1], points[c2]);
      if (d2 < minDist2) {
        minDist2 = d2;
        closestPair = [c1, c2];
      }
    }
  }

  if (!closestPair) return false;

  // Use A* or simple pathfinding to find path through water
  const path = findPathThroughWater(closestPair[0], closestPair[1], pack, cells, maxDistance);
  if (!path || path.length === 0) return false;

  // Raise water cells along path to create land bridge
  // Only raise cells that are water (h < 20) and within maxDistance
  let raised = 0;
  for (const cellId of path) {
    if (cellId < 0 || cellId >= packCellsNumber) continue;
    if (heights[cellId] < 20 && heights[cellId] >= 10) { // Water but not deep ocean
      heights[cellId] = 20; // Raise to land threshold
      raised++;
    }
  }

  return raised > 0;
}

/**
 * Find path through water between two cells using A* or simple BFS
 * Returns array of cell IDs along the path, or null if no path found
 */
function findPathThroughWater(startCell, endCell, pack, cells, maxDistance) {
  const { c: neighbors, h: heights, p: points } = cells;
  const packCellsNumber = cells.i.length;

  // Simple BFS with distance limit
  const queue = [[startCell, [startCell]]];
  const visited = new Uint8Array(packCellsNumber);
  visited[startCell] = 1;

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    
    if (path.length > maxDistance + 2) continue; // Too far

    if (current === endCell) {
      return path; // Found path
    }

    if (!neighbors[current]) continue;
    for (const neighborId of neighbors[current]) {
      if (neighborId < 0 || neighborId >= packCellsNumber) continue;
      if (visited[neighborId]) continue;

      // Can traverse water cells or the target land cell
      const isWater = heights[neighborId] < 20;
      const isTarget = neighborId === endCell;
      
      if (isWater || isTarget) {
        visited[neighborId] = 1;
        queue.push([neighborId, [...path, neighborId]]);
      }
    }
  }

  return null; // No path found
}
