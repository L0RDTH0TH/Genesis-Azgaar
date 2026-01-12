/**
 * =============================================================================
 * partials.test.js
 * Desc: Unit tests for partial generation logic (caching, dependencies, merging, fallbacks)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PHASES } from '../src/utils/constants.js';
import {
  validatePhaseDependencies,
  deepMerge,
  manageCacheSize,
  getFallbackForPhase,
  efficientDeepCopyOfRelevantData,
  getPhaseSeed,
} from '../src/partials.js';
import { DependencyError } from '../src/utils/errors.js';

describe('Partial Generation - Dependency Validation', () => {
  test('should throw DependencyError when running cultures without RANK_CELLS cached or included', () => {
    const skipPhases = [PHASES.RANK_CELLS];
    const cached = {}; // No RANK_CELLS cached
    
    expect(() => {
      validatePhaseDependencies(PHASES.CULTURES, skipPhases, cached);
    }).toThrow(DependencyError);
    
    expect(() => {
      validatePhaseDependencies(PHASES.CULTURES, skipPhases, cached);
    }).toThrow(/rankCells is required/);
  });

  test('should throw DependencyError when running states without RANK_CELLS cached or included', () => {
    const skipPhases = [PHASES.RANK_CELLS];
    const cached = {};
    
    expect(() => {
      validatePhaseDependencies(PHASES.STATES, skipPhases, cached);
    }).toThrow(DependencyError);
  });

  test('should throw DependencyError when running burgs without RANK_CELLS cached or included', () => {
    const skipPhases = [PHASES.RANK_CELLS];
    const cached = {};
    
    expect(() => {
      validatePhaseDependencies(PHASES.BURGS, skipPhases, cached);
    }).toThrow(DependencyError);
  });

  test('should throw DependencyError when running provinces without RANK_CELLS cached or included', () => {
    const skipPhases = [PHASES.RANK_CELLS];
    const cached = {};
    
    expect(() => {
      validatePhaseDependencies(PHASES.PROVINCES, skipPhases, cached);
    }).toThrow(DependencyError);
  });

  test('should NOT throw when RANK_CELLS is cached even if skipped', () => {
    const skipPhases = [PHASES.RANK_CELLS];
    const cached = {
      [PHASES.RANK_CELLS]: { grid: {}, pack: {} }
    };
    
    expect(() => {
      validatePhaseDependencies(PHASES.CULTURES, skipPhases, cached);
    }).not.toThrow();
  });

  test('should NOT throw when RANK_CELLS is included (not skipped)', () => {
    const skipPhases = []; // RANK_CELLS not skipped
    const cached = {};
    
    expect(() => {
      validatePhaseDependencies(PHASES.CULTURES, skipPhases, cached);
    }).not.toThrow();
  });

  test('should throw DependencyError when skipping required dependency without cache', () => {
    const skipPhases = [PHASES.VORONOI];
    const cached = {};
    
    expect(() => {
      validatePhaseDependencies(PHASES.HEIGHTMAP, skipPhases, cached);
    }).toThrow(DependencyError);
  });

  test('should NOT throw when required dependency is cached', () => {
    const skipPhases = [PHASES.VORONOI];
    const cached = {
      [PHASES.VORONOI]: { grid: {} }
    };
    
    expect(() => {
      validatePhaseDependencies(PHASES.HEIGHTMAP, skipPhases, cached);
    }).not.toThrow();
  });
});

describe('Partial Generation - Cache Management', () => {
  let mockCached;
  
  beforeEach(() => {
    mockCached = {};
  });

  test('manageCacheSize should return 0 when cache is under limit', () => {
    mockCached[PHASES.VORONOI] = { data: 'test' };
    mockCached[PHASES.HEIGHTMAP] = { data: 'test' };
    
    const evicted = manageCacheSize(mockCached, 5);
    expect(evicted).toBe(0);
    expect(Object.keys(mockCached).length).toBe(2);
  });

  test('manageCacheSize should evict oldest phases when over limit', () => {
    // Add 10 phases
    for (let i = 0; i < 10; i++) {
      mockCached[`phase${i}`] = { data: `test${i}` };
    }
    
    const evicted = manageCacheSize(mockCached, 8);
    
    expect(evicted).toBe(2); // Should evict 2 oldest
    expect(Object.keys(mockCached).length).toBe(8);
    // Oldest phases (phase0, phase1) should be gone
    expect(mockCached.phase0).toBeUndefined();
    expect(mockCached.phase1).toBeUndefined();
    // Newest phases should remain
    expect(mockCached.phase9).toBeDefined();
    expect(mockCached.phase8).toBeDefined();
  });

  test('manageCacheSize should evict all when limit is 0', () => {
    mockCached[PHASES.VORONOI] = { data: 'test' };
    mockCached[PHASES.HEIGHTMAP] = { data: 'test' };
    
    const evicted = manageCacheSize(mockCached, 0);
    
    expect(evicted).toBe(2);
    expect(Object.keys(mockCached).length).toBe(0);
  });

  test('manageCacheSize should handle null/undefined cached gracefully', () => {
    expect(manageCacheSize(null, 5)).toBe(0);
    expect(manageCacheSize(undefined, 5)).toBe(0);
    expect(manageCacheSize({}, 5)).toBe(0);
  });

  test('efficientDeepCopyOfRelevantData should create deep copy (converts typed arrays to arrays for caching)', () => {
    const testData = {
      grid: {
        cells: {
          h: new Uint8Array([10, 20, 30, 40]),
          temp: new Float32Array([15.5, 20.3, 25.1]),
        }
      }
    };
    
    const copied = efficientDeepCopyOfRelevantData(PHASES.HEIGHTMAP, testData);
    
    // getPhaseData converts typed arrays to regular arrays for caching efficiency
    expect(Array.isArray(copied.grid.cells.h)).toBe(true);
    expect(copied.grid.cells.h).not.toBe(testData.grid.cells.h); // Should be a copy
    expect(copied.grid.cells.h).toEqual([10, 20, 30, 40]);
    // Verify it's a deep copy (modifying original doesn't affect copy)
    testData.grid.cells.h[0] = 99;
    expect(copied.grid.cells.h[0]).toBe(10);
  });

  test('efficientDeepCopyOfRelevantData should handle missing context gracefully', () => {
    const result = efficientDeepCopyOfRelevantData(PHASES.HEIGHTMAP, null);
    expect(result).toBeDefined();
  });
});

describe('Partial Generation - Deep Merge', () => {
  test('deepMerge should merge nested objects', () => {
    const target = {
      grid: {
        cells: {
          h: [10, 20, 30],
          temp: [15, 20, 25]
        }
      }
    };
    
    const source = {
      grid: {
        cells: {
          h: [11, 21, 31],
          prec: [50, 60, 70]
        }
      }
    };
    
    const merged = deepMerge(target, source);
    
    expect(merged.grid.cells.h).toEqual([11, 21, 31]);
    expect(merged.grid.cells.temp).toEqual([15, 20, 25]); // Preserved from target
    expect(merged.grid.cells.prec).toEqual([50, 60, 70]); // Added from source
  });

  test('deepMerge should preserve typed arrays via slice', () => {
    const target = {
      grid: {
        cells: {
          h: new Uint8Array([10, 20, 30])
        }
      }
    };
    
    const source = {
      grid: {
        cells: {
          h: new Uint8Array([11, 21, 31])
        }
      }
    };
    
    const merged = deepMerge(target, source);
    
    expect(merged.grid.cells.h).toBeInstanceOf(Uint8Array);
    expect(Array.from(merged.grid.cells.h)).toEqual([11, 21, 31]);
    expect(merged.grid.cells.h).not.toBe(source.grid.cells.h); // Should be a copy
  });

  test('deepMerge should handle array index merging', () => {
    const target = {
      pack: {
        burgs: [
          { name: 'City1', population: 1000 },
          { name: 'City2', population: 2000 }
        ]
      }
    };
    
    const source = {
      pack: {
        burgs: [
          { name: 'City1', population: 1500 }, // Updated
          { name: 'City2', population: 2000 }, // Same
          { name: 'City3', population: 3000 } // New
        ]
      }
    };
    
    const merged = deepMerge(target, source);
    
    expect(merged.pack.burgs.length).toBe(3);
    expect(merged.pack.burgs[0].population).toBe(1500);
    expect(merged.pack.burgs[1].population).toBe(2000);
    expect(merged.pack.burgs[2].name).toBe('City3');
  });

  test('deepMerge should override primitives', () => {
    const target = {
      seed: 'old-seed',
      count: 10
    };
    
    const source = {
      seed: 'new-seed',
      count: 20
    };
    
    const merged = deepMerge(target, source);
    
    expect(merged.seed).toBe('new-seed');
    expect(merged.count).toBe(20);
  });

  test('deepMerge should handle null/undefined gracefully', () => {
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
    expect(deepMerge(null, null)).toEqual({});
  });

  test('deepMerge should handle different typed array types', () => {
    const target = {
      grid: {
        cells: {
          h: new Uint8Array([10, 20])
        }
      }
    };
    
    const source = {
      grid: {
        cells: {
          h: [11, 21] // Regular array
        }
      }
    };
    
    const merged = deepMerge(target, source);
    
    // Should convert regular array to typed array
    expect(merged.grid.cells.h).toBeInstanceOf(Uint8Array);
    expect(Array.from(merged.grid.cells.h)).toEqual([11, 21]);
  });
});

describe('Partial Generation - Fallbacks', () => {
  test('getFallbackForPhase should return flat ocean for HEIGHTMAP', () => {
    const context = {
      grid: {
        cells: {
          i: new Array(100).fill(0).map((_, i) => i)
        }
      }
    };
    
    const fallback = getFallbackForPhase(PHASES.HEIGHTMAP, context);
    
    expect(fallback).toBeDefined();
    expect(fallback.grid.cells.h).toBeInstanceOf(Uint8Array);
    expect(fallback.grid.cells.h.length).toBe(100);
    expect(Array.from(fallback.grid.cells.h)).toEqual(new Array(100).fill(0));
  });

  test('getFallbackForPhase should return uniform temperature for TEMPERATURES', () => {
    const context = {
      grid: {
        cells: {
          i: new Array(50).fill(0).map((_, i) => i)
        }
      },
      options: {
        temperatureEquator: 27
      }
    };
    
    const fallback = getFallbackForPhase(PHASES.TEMPERATURES, context);
    
    expect(fallback).toBeDefined();
    expect(fallback.grid.cells.temp).toBeInstanceOf(Float32Array);
    expect(fallback.grid.cells.temp.length).toBe(50);
    expect(fallback.grid.cells.temp[0]).toBe(27);
    expect(fallback.grid.cells.temp[49]).toBe(27);
  });

  test('getFallbackForPhase should return uniform precipitation for PRECIPITATION', () => {
    const context = {
      grid: {
        cells: {
          i: new Array(30).fill(0).map((_, i) => i)
        }
      }
    };
    
    const fallback = getFallbackForPhase(PHASES.PRECIPITATION, context);
    
    expect(fallback).toBeDefined();
    expect(fallback.grid.cells.prec).toBeInstanceOf(Float32Array);
    expect(fallback.grid.cells.prec.length).toBe(30);
    expect(fallback.grid.cells.prec[0]).toBe(50.0);
  });

  test('getFallbackForPhase should return empty rivers array for RIVERS', () => {
    const fallback = getFallbackForPhase(PHASES.RIVERS, {});
    
    expect(fallback).toBeDefined();
    expect(fallback.pack.rivers).toEqual([]);
  });

  test('getFallbackForPhase should return ocean biome for BIOMES', () => {
    const context = {
      pack: {
        cells: {
          i: new Array(75).fill(0).map((_, i) => i)
        }
      }
    };
    
    const fallback = getFallbackForPhase(PHASES.BIOMES, context);
    
    expect(fallback).toBeDefined();
    expect(fallback.pack.cells.biome).toBeInstanceOf(Uint8Array);
    expect(fallback.pack.cells.biome.length).toBe(75);
    expect(Array.from(fallback.pack.cells.biome)).toEqual(new Array(75).fill(0));
  });

  test('getFallbackForPhase should return null for PACK_CREATION (no fallback)', () => {
    const fallback = getFallbackForPhase(PHASES.PACK_CREATION, {});
    
    expect(fallback).toBeNull();
  });

  test('getFallbackForPhase should return null when context is missing required data', () => {
    const fallback = getFallbackForPhase(PHASES.HEIGHTMAP, {});
    
    expect(fallback).toBeNull();
  });
});

describe('Partial Generation - Phase Seed Generation', () => {
  test('getPhaseSeed should generate consistent seeds for same input', () => {
    const seed1 = getPhaseSeed('42', PHASES.HEIGHTMAP);
    const seed2 = getPhaseSeed('42', PHASES.HEIGHTMAP);
    
    expect(seed1).toBe(seed2);
  });

  test('getPhaseSeed should generate different seeds for different phases', () => {
    const seed1 = getPhaseSeed('42', PHASES.HEIGHTMAP);
    const seed2 = getPhaseSeed('42', PHASES.TEMPERATURES);
    
    expect(seed1).not.toBe(seed2);
  });

  test('getPhaseSeed should generate different seeds for different main seeds', () => {
    const seed1 = getPhaseSeed('42', PHASES.HEIGHTMAP);
    const seed2 = getPhaseSeed('43', PHASES.HEIGHTMAP);
    
    expect(seed1).not.toBe(seed2);
  });

  test('getPhaseSeed should handle numeric seeds', () => {
    const seed1 = getPhaseSeed(42, PHASES.HEIGHTMAP);
    const seed2 = getPhaseSeed('42', PHASES.HEIGHTMAP);
    
    expect(seed1).toBe(seed2);
  });
});
