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
 * Enhanced with iterative merging and smarter prioritization
 * @param {Object} pack - Pack object (will be modified)
 * @param {Object} options - Options with mergeDistance threshold
 * @returns {number} Total number of clusters merged across all iterations
 */
export function mergeNearbyClusters(pack, options = {}) {
  if (!pack || !pack.cells || !pack.features) {
    return 0;
  }

  const { cells, features } = pack;
  const { c: neighbors, h: heights, p: points } = cells;
  const packCellsNumber = cells.i.length;
  
  // Enhanced parameters for more aggressive merging
  const mergeDistance = options.mergeDistance || 6; // Increased from 3 to 6 cells (more aggressive)
  const maxMergeDistance = options.maxMergeDistance || 8; // Maximum distance to consider
  const minClusterSize = options.minClusterSize || 5; // Reduced from 10 to 5 (include smaller isles)
  const maxIterations = options.maxIterations || 10; // Maximum iterations for convergence
  const maxClusterSize = options.maxClusterSize || packCellsNumber * 0.6; // Prevent supercontinents

  let totalMergesPerformed = 0;
  let iteration = 0;

  // Iterative merging: loop until no more merges are possible
  while (iteration < maxIterations) {
    // Get current land features (recalculate each iteration as features change)
    const landFeatures = features.filter(f => f && f.land === true);
    if (landFeatures.length <= 1) break; // No merging needed if 0 or 1 land feature

    // Sort by size (smallest first) to prioritize small-to-large merges
    const sortedFeatures = [...landFeatures].sort((a, b) => a.cells - b.cells);

    let iterationMerges = 0;
    const mergedThisIteration = new Set();

    // Find pairs of nearby land features (prioritize small-to-large)
    for (let i = 0; i < sortedFeatures.length; i++) {
      const feature1 = sortedFeatures[i];
      if (mergedThisIteration.has(feature1.i)) continue;
      if (feature1.cells >= maxClusterSize) continue; // Don't merge into supercontinents

      // Find nearest large feature to merge into (or nearby feature if small)
      let bestMerge = null;
      let bestDistance = Infinity;
      let bestTarget = null;

      for (let j = i + 1; j < sortedFeatures.length; j++) {
        const feature2 = sortedFeatures[j];
        if (mergedThisIteration.has(feature2.i)) continue;
        if (feature2.cells >= maxClusterSize) continue;

        // Find minimum distance between features
        const distance = findMinDistanceBetweenFeatures(feature1, feature2, pack, cells);
        
        if (distance > 0 && distance <= mergeDistance) {
          // Prefer merging small into large, or nearest if similar size
          const sizeDiff = feature2.cells - feature1.cells;
          const score = distance - (sizeDiff * 0.01); // Prefer larger targets (lower score = better)
          
          if (score < bestDistance) {
            bestDistance = score;
            bestMerge = feature2;
            bestTarget = feature1; // Merge feature1 (smaller) into feature2 (larger)
          }
        }
      }

      // Perform best merge found
      if (bestMerge && bestTarget) {
        const distance = findMinDistanceBetweenFeatures(bestTarget, bestMerge, pack, cells);
        const bridged = bridgeFeatures(bestTarget, bestMerge, pack, cells, distance, maxMergeDistance);
        if (bridged) {
          iterationMerges++;
          totalMergesPerformed++;
          mergedThisIteration.add(bestTarget.i); // Mark source as merged
          // Note: bestMerge (target) stays active for potential further merges
        }
      }
    }

    // If no merges this iteration, we've converged
    if (iterationMerges === 0) break;

    iteration++;
  }

  return totalMergesPerformed;
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
  // Enhanced: raise heights more intelligently (average of endpoints, with gradient)
  let raised = 0;
  if (path.length === 0) return false;

  // Calculate average height of endpoint land cells
  const startHeight = heights[closestPair[0]];
  const endHeight = heights[closestPair[1]];
  const avgEndpointHeight = (startHeight + endHeight) / 2;
  const targetHeight = Math.max(20, Math.min(avgEndpointHeight, 30)); // Raise to 20-30 range

  // Raise path cells with gradient (higher near endpoints)
  for (let idx = 0; idx < path.length; idx++) {
    const cellId = path[idx];
    if (cellId < 0 || cellId >= packCellsNumber) continue;
    
    const currentHeight = heights[cellId];
    if (currentHeight < 20 && currentHeight >= 10) { // Water but not deep ocean
      // Gradient: cells closer to endpoints get higher values
      const progress = idx / Math.max(path.length - 1, 1);
      const gradient = 1 - Math.abs(progress - 0.5) * 2; // Higher near start/end
      const heightValue = 20 + (targetHeight - 20) * gradient;
      heights[cellId] = Math.max(20, Math.min(heightValue, 35)); // Clamp to reasonable range
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
