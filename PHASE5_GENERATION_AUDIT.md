# Phase 5 Data Generation Pipeline Audit Report

**Date:** January 02, 2026  
**Branch:** `feat/azgaar-fork` (current main)  
**Test Seed:** 42  
**Map Size:** 960x540  
**Test File:** `examples/test-svg-seed42.html`

---

## Executive Summary

**Status:** ❌ **CRITICAL FAILURE - MISSING CORE GENERATION FUNCTION**

The data generation pipeline is **missing the `rankCells()` function**, which calculates cell suitability (`cells.s`) and population (`cells.pop`) scores. This causes a **cascade of failures** in the generation pipeline:

1. **No suitability/population scores** → No populated cells identified
2. **No populated cells** → Cultures cannot place centers
3. **No cultures** → Burgs cannot be placed (require cells with culture)
4. **No burgs** → No capitals → States cannot be created
5. **Result:** Maps with 1 state (Neutrals), 0 burgs, sparse landmasses

**Key Findings:**
- ❌ `rankCells()` function **NOT CALLED** in generation pipeline
- ❌ `cells.s` (suitability) array **NOT POPULATED**
- ❌ `cells.pop` (population) array **NOT POPULATED**
- ❌ Cultures: May generate but fail to expand (no populated cells)
- ❌ Burgs: **0 placed** (require `cells.culture` AND `cells.s/cells.pop > 0`)
- ❌ States: **1 state** (only "Neutrals" - no capitals to create states from)
- ✅ Rivers: **141 generated** - functional
- ✅ Features: **315 generated** - functional
- ✅ Biomes: Assigned correctly

**Visual Quality:** Maps appear sparse with few landmasses, no settlements, and no political divisions.

---

## Previously Known Issues → Resolution Status

### Issue 1: Missing Suitability/Population Calculation (NEW)

**Status:** ❌ **NOT RESOLVED** - Critical missing function

**Evidence:**
- Original Azgaar has `rankCells()` function in `main.js` (lines 1169-1208)
- Fork's `generator.js` has **NO CALL** to `rankCells()` or equivalent
- Generation pipeline skips from Phase 9 (biomes) directly to Phase 11 (cultures)
- Missing Phase 10: Suitability/Population calculation

---

## Current Issues

### Issue 1: Missing `rankCells()` Function Call (CRITICAL)

**Severity:** Critical  
**Impact:** Complete failure of burg and state generation

**Root Cause:**
The `rankCells()` function from original Azgaar is **not implemented or called** in the fork's generation pipeline. This function is essential for:

1. **Calculating suitability scores** (`cells.s`) based on:
   - Biome habitability
   - River flux (water availability)
   - Elevation (low elevation preferred)
   - Coastline proximity
   - Harbor availability
   - Feature types (lakes, etc.)

2. **Calculating population scores** (`cells.pop`) based on:
   - Suitability scores
   - Cell area (normalized)

**Code Location:**
- **Original:** `original/main.js:1169-1208` - `rankCells()` function
- **Fork:** `src/generator.js:115-268` - Generation pipeline (missing call)

**Missing Call Location:**
Should be called **after Phase 9 (biomes)** and **before Phase 11 (cultures)**:

```javascript
// Phase 9: Biome assignment
assignBiomes({ pack, grid, options, biomesData });

// MISSING: Phase 10: Calculate suitability and population
// rankCells({ pack, grid, options, biomesData }); // <-- NOT CALLED

// Phase 11: Culture generation
generateCultures({ pack, grid, options, rng, biomesData });
```

**Impact Chain:**
1. No `cells.s` → `generateCultures()` filters by `baseScore[i] > 0` → No populated cells → Cultures fail
2. No `cells.s` → `placeCapitals()` filters by `score[i] > 0 && cells.culture[i]` → No capitals → No states
3. No `cells.s` → `placeTowns()` filters by `score[i] > 0 && cells.culture[i]` → No towns → No burgs

### Issue 2: Cultures Not Expanding (HIGH)

**Severity:** High  
**Impact:** Even if cultures generate, they may not expand to cover cells

**Root Cause:**
`expandCultures()` requires populated cells (`cells.pop > 0` or `cells.s > 0`) to assign culture:

```javascript
// From expandCultures() line 345:
const hasPopulation = (cells.pop && cells.pop[neibCellId] > 0) || (cells.s && cells.s[neibCellId] > 0);
if (hasPopulation) cells.culture[neibCellId] = cultureId;
```

Without `cells.s` or `cells.pop`, cultures cannot expand beyond their initial centers.

**Code Location:**
- `src/core/cultures.js:289-388` - `expandCultures()` function
- Line 345: Population check prevents culture assignment

### Issue 3: Burgs Require Culture AND Suitability (CRITICAL)

**Severity:** Critical  
**Impact:** No burgs can be placed

**Root Cause:**
Both `placeCapitals()` and `placeTowns()` filter cells by:
1. `cells.culture[i]` must exist (culture assigned)
2. `score[i] > 0` (suitability/population > 0)

```javascript
// From placeCapitals() line 111:
.filter((i) => score[i] > 0 && cells.culture && cells.culture[i])

// From placeTowns() line 171:
.filter((i) => !cells.burg[i] && score[i] > 0 && cells.culture && cells.culture[i])
```

Without both conditions, **zero burgs** are placed.

**Code Location:**
- `src/core/burgs.js:102-151` - `placeCapitals()` function
- `src/core/burgs.js:162-213` - `placeTowns()` function

### Issue 4: States Require Capitals (CRITICAL)

**Severity:** Critical  
**Impact:** Only "Neutrals" state (state 0) is created

**Root Cause:**
`createStates()` filters burgs by `b.capital`:

```javascript
// From createStates() line 71:
const capitals = burgs.filter((b) => b && b.capital);
```

If no capitals are placed (because no burgs are placed), **zero states** are created beyond the default "Neutrals" state.

**Code Location:**
- `src/core/states.js:65-104` - `createStates()` function

### Issue 5: Low Land Percentage (MEDIUM)

**Severity:** Medium  
**Impact:** Sparse landmasses, fewer habitable cells

**Potential Causes:**
1. Heightmap generation may produce too much ocean
2. Land threshold (`cells.h >= 20`) may be too high
3. Template or noise parameters may favor ocean

**Note:** This is secondary to the missing `rankCells()` issue, but should be investigated.

---

## Root Cause Analysis

### Primary Root Cause: Missing `rankCells()` Function

The original Azgaar generator calls `rankCells()` **after biomes are assigned** and **before cultures are generated**. This function:

1. **Initializes arrays:**
   ```javascript
   cells.s = new Int16Array(cells.i.length); // suitability
   cells.pop = new Float32Array(cells.i.length); // population
   ```

2. **Calculates suitability for each land cell:**
   ```javascript
   let s = +biomesData.habitability[cells.biome[i]]; // base from biome
   s += normalize(cells.fl[i] + cells.conf[i], flMean, flMax) * 250; // rivers
   s -= (cells.h[i] - 50) / 5; // elevation penalty
   // ... coastlines, harbors, features ...
   cells.s[i] = s / 5;
   ```

3. **Calculates population:**
   ```javascript
   cells.pop[i] = cells.s[i] > 0 ? (cells.s[i] * cells.area[i]) / areaMean : 0;
   ```

**Why It's Missing:**
- The fork's generation pipeline was simplified/modularized
- `rankCells()` was not ported or integrated
- The dependency chain (suitability → cultures → burgs → states) was not fully understood

### Secondary Root Cause: Dependency Chain Not Validated

The generation pipeline has a **strict dependency chain**:

```
rankCells() → cells.s/cells.pop
    ↓
generateCultures() → cells.culture (requires populated cells)
    ↓
expandCultures() → cells.culture expanded (requires populated cells)
    ↓
generateBurgs() → burgs placed (requires cells.culture AND cells.s/cells.pop)
    ↓
generateStates() → states created (requires capitals/burgs)
```

**Problem:** The fork's pipeline does not validate that prerequisites are met before proceeding. Each phase assumes the previous phase completed successfully.

---

## Comparison to Original Azgaar

### Original Azgaar (Seed 42, Default Options)

**Expected Metrics:**
- **States:** 10-20 (based on `statesNumber: 18` default)
- **Burgs:** 50-200+ (based on `manors: 1000` auto calculation)
- **Cultures:** 12 (based on `cultures: 12` default)
- **Land percentage:** ~40-60% (varies by template)
- **Populated cells:** ~80-100% of land cells

**Generation Pipeline:**
1. Voronoi diagram
2. Heightmap
3. Features
4. Temperature
5. Precipitation
6. Rivers
7. Biomes
8. **rankCells()** ← **PRESENT**
9. Cultures
10. Burgs
11. States
12. Provinces
13. Religions
14. Emblems

### Fork (Seed 42, Default Options)

**Actual Metrics:**
- **States:** 1 (only "Neutrals")
- **Burgs:** 0
- **Cultures:** Unknown (likely 0 or minimal)
- **Land percentage:** Unknown (appears sparse)
- **Populated cells:** 0% (no `cells.s` or `cells.pop`)

**Generation Pipeline:**
1. Voronoi diagram ✅
2. Heightmap ✅
3. Features ✅
4. Temperature ✅
5. Precipitation ✅
6. Rivers ✅
7. Biomes ✅
8. **rankCells()** ← **MISSING**
9. Cultures ❌ (fails due to no populated cells)
10. Burgs ❌ (fails due to no culture/suitability)
11. States ❌ (fails due to no capitals)
12. Provinces ⚠️ (may work but no states to assign)
13. Religions ⚠️ (may work but limited)
14. Emblems ⚠️ (may work but limited)

**Similarity Estimate:** ~20-30% (basic terrain works, but political/cultural features fail)

---

## Recommendations

### Immediate Fixes (Priority 1)

#### Fix 1: Implement and Call `rankCells()` Function

**Effort:** 4-6 hours  
**Impact:** Critical - Enables all downstream generation

**Actions:**
1. **Create `rankCells()` function** in `src/core/population.js` (new file) or `src/core/index.js`
2. **Port logic from original** `original/main.js:1169-1208`
3. **Add call in generation pipeline** after Phase 9 (biomes), before Phase 11 (cultures)
4. **Ensure dependencies:** Requires `cells.fl` (flux), `cells.conf` (confluences), `cells.area`, `cells.haven`, `cells.harbor`, `cells.t`, `cells.r`, `pack.features`

**Code Changes:**
```javascript
// In src/generator.js, after Phase 9:
// Phase 9: Biome assignment
assignBiomes({ pack, grid, options, biomesData });

// Phase 10: Calculate suitability and population (NEW)
rankCells({ pack, grid, options, biomesData });

// Phase 11: Culture generation
generateCultures({ pack, grid, options, rng, biomesData });
```

**Dependencies to Verify:**
- `cells.fl` (flux) - from river generation
- `cells.conf` (confluences) - from river generation
- `cells.area` - from pack creation
- `cells.haven` - from feature detection
- `cells.harbor` - from feature detection
- `cells.t` (type) - from grid markup
- `cells.r` (rivers) - from river generation
- `pack.features` - from feature specification

#### Fix 2: Add Dependency Validation

**Effort:** 1-2 hours  
**Impact:** Medium - Prevents silent failures

**Actions:**
1. Add validation checks before each generation phase
2. Log warnings if prerequisites are missing
3. Provide fallback behavior or clear error messages

**Example:**
```javascript
// Before generateCultures():
if (!cells.s && !cells.pop) {
  console.warn('No suitability/population scores found. Cultures may fail.');
}
```

### Medium-term Improvements (Priority 2)

#### Improvement 1: Verify All Required Cell Properties

**Effort:** 2-3 hours  
**Impact:** Medium - Ensures complete data structure

**Actions:**
1. Audit all cell properties used by `rankCells()`
2. Verify they are populated in previous phases
3. Add fallback values if missing

#### Improvement 2: Add Generation Metrics Logging

**Effort:** 1-2 hours  
**Impact:** Low - Improves debugging

**Actions:**
1. Log metrics after each generation phase
2. Include: cell counts, populated cells, cultures, burgs, states
3. Compare to expected values

### Long-term Enhancements (Priority 3)

#### Enhancement 1: Modularize `rankCells()` Logic

**Effort:** 3-4 hours  
**Impact:** Low - Improves maintainability

**Actions:**
1. Split `rankCells()` into smaller functions:
   - `calculateSuitability()`
   - `calculatePopulation()`
   - `normalizeFlux()`
2. Add unit tests for each function

#### Enhancement 2: Add Generation Pipeline Validation

**Effort:** 4-6 hours  
**Impact:** Medium - Prevents regressions

**Actions:**
1. Create validation framework
2. Define expected metrics for each phase
3. Add automated tests

---

## Testing Recommendations

### Test 1: Verify `rankCells()` Execution

**Test:** Generate map with seed 42, check if `cells.s` and `cells.pop` are populated  
**Expected:** Both arrays should have non-zero values for land cells  
**Actual:** Needs verification after fix

### Test 2: Verify Culture Generation

**Test:** Generate map with seed 42, check culture count and coverage  
**Expected:** 12 cultures, ~80-100% of land cells have culture  
**Actual:** Needs verification after fix

### Test 3: Verify Burg Generation

**Test:** Generate map with seed 42, check burg count  
**Expected:** 50-200+ burgs, 18 capitals  
**Actual:** Needs verification after fix

### Test 4: Verify State Generation

**Test:** Generate map with seed 42, check state count  
**Expected:** 18 states (plus Neutrals = 19 total)  
**Actual:** Needs verification after fix

### Test 5: Compare to Original Azgaar

**Test:** Generate same seed in original Azgaar, compare metrics  
**Expected:** Similar state/burg/culture counts  
**Actual:** Needs verification after fix

---

## Conclusion

**Readiness for Phase 5.5/5.6:** ❌ **NOT READY**

The data generation pipeline has a **critical missing function** (`rankCells()`) that prevents proper generation of cultures, burgs, and states. This must be fixed before proceeding to Phase 5.5/5.6.

**Merge Status:** ⚠️ **DO NOT MERGE** - Requires `rankCells()` implementation

**Next Steps:**
1. **Implement `rankCells()` function** (Fix 1) - **CRITICAL**
2. **Add call to generation pipeline** (Fix 1) - **CRITICAL**
3. **Verify all dependencies** (Fix 1) - **CRITICAL**
4. **Test with seed 42** - Verify metrics match expected
5. **Add dependency validation** (Fix 2) - **RECOMMENDED**
6. Proceed to Phase 5.5/5.6 only after fixes are verified

**Estimated Fix Time:** 5-8 hours for critical fixes

**Priority:** **HIGHEST** - This blocks all political/cultural feature generation

---

## Appendix: Code References

### Original `rankCells()` Function

**Location:** `original/main.js:1169-1208`

**Key Logic:**
```javascript
function rankCells() {
  cells.s = new Int16Array(cells.i.length);
  cells.pop = new Float32Array(cells.i.length);
  
  const flMean = d3.median(cells.fl.filter(f => f)) || 0;
  const flMax = d3.max(cells.fl) + d3.max(cells.conf);
  const areaMean = d3.mean(cells.area);
  
  for (const i of cells.i) {
    if (cells.h[i] < 20) continue; // no population in water
    let s = +biomesData.habitability[cells.biome[i]];
    if (!s) continue;
    if (flMean) s += normalize(cells.fl[i] + cells.conf[i], flMean, flMax) * 250;
    s -= (cells.h[i] - 50) / 5;
    // ... coastlines, harbors, features ...
    cells.s[i] = s / 5;
    cells.pop[i] = cells.s[i] > 0 ? (cells.s[i] * cells.area[i]) / areaMean : 0;
  }
}
```

### Fork Generation Pipeline

**Location:** `src/generator.js:115-268`

**Missing Call:**
```javascript
// Phase 9: Biome assignment
assignBiomes({ pack, grid, options, biomesData });

// MISSING: Phase 10: Calculate suitability and population
// rankCells({ pack, grid, options, biomesData });

// Phase 11: Culture generation
generateCultures({ pack, grid, options, rng, biomesData });
```

### Dependency Chain

```
rankCells() → cells.s, cells.pop
    ↓
generateCultures() → cells.culture (requires cells.s/cells.pop > 0)
    ↓
expandCultures() → cells.culture expanded (requires cells.s/cells.pop > 0)
    ↓
generateBurgs() → burgs (requires cells.culture AND cells.s/cells.pop > 0)
    ↓
generateStates() → states (requires capitals from burgs)
```

---

**Report Generated:** 2026-01-02  
**Auditor:** AI Assistant  
**Review Status:** Pending user review
