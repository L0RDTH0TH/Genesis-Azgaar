/**
 * =============================================================================
 * svg-diff.js
 * Desc: Simple utility for comparing SVG strings from map generation
 * Author: Lordthoth
 * =============================================================================
 */

/**
 * Compare two SVG strings and return differences
 * @param {string} svg1 - First SVG string
 * @param {string} svg2 - Second SVG string
 * @returns {Object} Comparison results
 */
export function compareSVG(svg1, svg2) {
  const result = {
    identical: false,
    lengthDiff: 0,
    elementCount1: 0,
    elementCount2: 0,
    differences: [],
  };

  if (svg1 === svg2) {
    result.identical = true;
    return result;
  }

  result.lengthDiff = Math.abs(svg1.length - svg2.length);

  // Count elements (rough estimate)
  result.elementCount1 = (svg1.match(/<[^>]+>/g) || []).length;
  result.elementCount2 = (svg2.match(/<[^>]+>/g) || []).length;

  // Simple diff: find first differing character position
  const minLength = Math.min(svg1.length, svg2.length);
  let firstDiff = -1;
  for (let i = 0; i < minLength; i++) {
    if (svg1[i] !== svg2[i]) {
      firstDiff = i;
      break;
    }
  }

  if (firstDiff >= 0) {
    // Extract context around difference
    const contextStart = Math.max(0, firstDiff - 50);
    const contextEnd = Math.min(minLength, firstDiff + 50);
    result.differences.push({
      position: firstDiff,
      context1: svg1.substring(contextStart, contextEnd),
      context2: svg2.substring(contextStart, contextEnd),
    });
  }

  return result;
}

/**
 * Compare two map data JSON objects
 * @param {Object} data1 - First map data
 * @param {Object} data2 - Second map data
 * @returns {Object} Comparison results
 */
export function compareMapData(data1, data2) {
  const result = {
    seedMatch: data1.seed === data2.seed,
    gridCellsMatch: false,
    packCellsMatch: false,
    differences: [],
  };

  // Compare grid cells count
  if (data1.grid?.cells?.i && data2.grid?.cells?.i) {
    result.gridCellsMatch = data1.grid.cells.i.length === data2.grid.cells.i.length;
    if (!result.gridCellsMatch) {
      result.differences.push({
        field: 'grid.cells.i.length',
        value1: data1.grid.cells.i.length,
        value2: data2.grid.cells.i.length,
      });
    }
  }

  // Compare pack cells count
  if (data1.pack?.cells?.i && data2.pack?.cells?.i) {
    result.packCellsMatch = data1.pack.cells.i.length === data2.pack.cells.i.length;
    if (!result.packCellsMatch) {
      result.differences.push({
        field: 'pack.cells.i.length',
        value1: data1.pack.cells.i.length,
        value2: data2.pack.cells.i.length,
      });
    }
  }

  // Compare heights (terrain)
  if (data1.grid?.cells?.h && data2.grid?.cells?.h) {
    const h1 = data1.grid.cells.h;
    const h2 = data2.grid.cells.h;
    if (h1.length === h2.length) {
      let heightDiffs = 0;
      for (let i = 0; i < h1.length; i++) {
        if (h1[i] !== h2[i]) {
          heightDiffs++;
        }
      }
      if (heightDiffs > 0) {
        result.differences.push({
          field: 'grid.cells.h',
          type: 'array_diff',
          count: heightDiffs,
          total: h1.length,
        });
      }
    }
  }

  // Compare feature counts
  const features1 = data1.pack?.features?.length || 0;
  const features2 = data2.pack?.features?.length || 0;
  if (features1 !== features2) {
    result.differences.push({
      field: 'pack.features.length',
      value1: features1,
      value2: features2,
    });
  }

  // Compare political data
  const states1 = data1.pack?.states?.length || 0;
  const states2 = data2.pack?.states?.length || 0;
  if (states1 !== states2) {
    result.differences.push({
      field: 'pack.states.length',
      value1: states1,
      value2: states2,
    });
  }

  const cultures1 = data1.pack?.cultures?.length || 0;
  const cultures2 = data2.pack?.cultures?.length || 0;
  if (cultures1 !== cultures2) {
    result.differences.push({
      field: 'pack.cultures.length',
      value1: cultures1,
      value2: cultures2,
    });
  }

  const burgs1 = data1.pack?.burgs?.length || 0;
  const burgs2 = data2.pack?.burgs?.length || 0;
  if (burgs1 !== burgs2) {
    result.differences.push({
      field: 'pack.burgs.length',
      value1: burgs1,
      value2: burgs2,
    });
  }

  return result;
}
