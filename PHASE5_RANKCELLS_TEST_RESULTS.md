# Phase 5 rankCells() Implementation - Test Results

**Date:** January 03, 2026  
**Test Seed:** 42  
**Map Size:** 960x540  
**Test File:** `examples/test-svg-seed42.html`

---

## Executive Summary

**Status:** ✅ **IMPLEMENTATION SUCCESSFUL - WITH ISSUES**

The `rankCells()` function has been successfully implemented and integrated into the generation pipeline. The function executes correctly and calculates suitability/population scores. However, **unexpected results** were discovered:

- ✅ `rankCells()` executes successfully
- ✅ Suitability and population scores are calculated
- ⚠️ **States: 677** (expected ~18) - **TOO MANY**
- ⚠️ **Burgs: 676** (expected 50-200) - **TOO MANY**
- ✅ Rivers: 141 (expected)
- ✅ Features: 315 (expected)

**Root Cause:** The state/burg generation logic is creating states/burgs for **every capital placed**, not limiting to `options.statesNumber`. This suggests a logic issue in `placeCapitals()` or `createStates()`.

---

## Test Results

### Generation Metrics

```
Generation time: 4787.80ms
Rendering time: 183.40ms
Total time: 4971.20ms
Grid cells: 9975
Pack cells: 10659
States: 677
Burgs: 676
Rivers: 141
Features: 315
SVG string size: 593.98 KB
JSON data size: 3850.85 KB
```

### rankCells() Execution

**Console Log:**
```
[rankCells] Suitability and population calculated: {
  totalCells: 10659,
  populatedCells: 5299,
  populatedPercent: "49.7%",
  maxSuitability: 76,
  avgSuitability: 17.42,
  maxPopulation: [value],
  avgPopulation: [value],
  flMean: [value],
  flMax: [value],
  areaMean: [value]
}
```

**Analysis:**
- ✅ **49.7% of cells populated** - Reasonable (land cells only)
- ✅ **Max suitability: 76** - Good range
- ✅ **Average suitability: 17.42** - Reasonable
- ✅ Function executes without errors

### State Generation Results

**Expected:** 18 states (from `options.statesNumber: 18`)  
**Actual:** 677 states

**Issue:** States are being created for **every capital burg placed**, not limited to `statesNumber`. This suggests:
1. `placeCapitals()` is placing too many capitals
2. `createStates()` is creating a state for every capital, not limiting to `statesNumber`

**Console Evidence:**
- Map shows many capital labels (Capital1, Capital2, ..., Capital43+ visible in snapshot)
- `[drawBordersSVG] Border data: {statesCount: 677, ...}`

### Burg Generation Results

**Expected:** 50-200 burgs (based on `manors: 1000` auto calculation)  
**Actual:** 676 burgs

**Issue:** Too many burgs are being placed. This may be related to:
1. Too many capitals (676 burgs ≈ 677 states, suggesting each state has 1 burg)
2. `placeTowns()` may not be limiting correctly
3. Spacing logic may be too permissive

### SVG Rendering Results

**SVG Generated:** ✅ Yes (608,239 bytes)  
**Layers Rendered:**
- ✅ Oceans
- ✅ Biomes
- ✅ States (677 paths)
- ✅ Rivers (141 paths)
- ✅ Borders (visible)
- ✅ Burgs (676 markers)

**Visual Quality:**
- Map is dense with many states/burgs
- Borders are visible (677 states means many borders)
- Burgs are visible (many capital markers)

---

## Issues Identified

### Issue 1: Too Many States (CRITICAL)

**Severity:** Critical  
**Impact:** Maps have 677 states instead of expected ~18

**Root Cause Analysis:**
1. `placeCapitals()` in `src/core/burgs.js` should limit to `options.statesNumber` (18)
2. Logic at lines 114-120 may not be working correctly:
   ```javascript
   let count = statesNumber;
   if (sorted.length < count * 10) {
     count = Math.floor(sorted.length / 10);
     if (!count) {
       return burgs;
     }
   }
   ```
3. The condition `sorted.length < count * 10` may be evaluating incorrectly
4. With 5,299 populated cells, `sorted.length` is likely > 180, so the condition is false, and `count` remains 18
5. But the loop at line 125 may not be respecting the limit correctly

**Code Location:**
- `src/core/burgs.js:102-151` - `placeCapitals()` function

### Issue 2: Too Many Burgs (HIGH)

**Severity:** High  
**Impact:** Maps have 676 burgs instead of expected 50-200

**Root Cause Analysis:**
1. `placeTowns()` in `src/core/burgs.js` calculates `desiredNumber` based on `options.manors`
2. With `manors: 1000` (auto), the calculation may be producing too high a number
3. Spacing logic may be too permissive, allowing too many burgs

**Code Location:**
- `src/core/burgs.js:162-213` - `placeTowns()` function

### Issue 3: States Created for Every Capital (CRITICAL)

**Severity:** Critical  
**Impact:** Every capital burg becomes a state, regardless of `statesNumber`

**Root Cause Analysis:**
1. `createStates()` in `src/core/states.js` filters burgs by `b.capital`
2. It creates a state for **every capital**, not limiting to `statesNumber`
3. The function doesn't check `options.statesNumber` - it just creates states for all capitals

**Code Location:**
- `src/core/states.js:65-104` - `createStates()` function
- Line 71: `const capitals = burgs.filter((b) => b && b.capital);`
- Line 73: `capitals.forEach((b, i) => { ... })` - Creates state for EVERY capital

---

## Comparison to Expected

### Expected (Original Azgaar, Seed 42)

- **States:** 10-20 (based on `statesNumber: 18`)
- **Burgs:** 50-200 (based on `manors: 1000` auto)
- **Cultures:** 12
- **Land percentage:** ~40-60%

### Actual (Fork, Seed 42)

- **States:** 677 ❌ (37x too many)
- **Burgs:** 676 ❌ (3-13x too many)
- **Cultures:** Unknown (not logged)
- **Land percentage:** ~50% ✅ (reasonable)

**Similarity:** ~30-40% (basic terrain works, but political features are excessive)

---

## Root Cause Analysis

### Primary Issue: State Creation Logic

The `createStates()` function creates a state for **every capital burg**, not limiting to `options.statesNumber`. This is the core issue:

```javascript
// From createStates() line 71:
const capitals = burgs.filter((b) => b && b.capital);
capitals.forEach((b, i) => {
  // Creates state for EVERY capital
  states.push({ ... });
});
```

**Fix Required:** Limit state creation to `options.statesNumber`:

```javascript
const capitals = burgs.filter((b) => b && b.capital).slice(0, options.statesNumber || 18);
```

### Secondary Issue: Capital Placement Logic

`placeCapitals()` may be placing more capitals than intended. The logic at lines 114-120 should limit to `statesNumber`, but the actual placement loop (lines 125-133) may not be respecting the limit correctly.

**Potential Fix:** Ensure the loop respects `count`:

```javascript
for (let i = 0; i < sorted.length && burgs.length < count + 1; i++) {
  // This should work, but may need verification
}
```

---

## Recommendations

### Immediate Fixes (Priority 1)

#### Fix 1: Limit State Creation to statesNumber

**Effort:** 1 hour  
**Impact:** Critical - Fixes excessive state generation

**Code Change:**
```javascript
// In createStates() line 71:
const capitals = burgs
  .filter((b) => b && b.capital)
  .slice(0, options.statesNumber || 18); // Limit to statesNumber
```

#### Fix 2: Verify Capital Placement Logic

**Effort:** 1-2 hours  
**Impact:** High - Ensures correct number of capitals

**Actions:**
1. Add logging to `placeCapitals()` to verify `count` and `burgs.length`
2. Check if spacing logic is preventing placement
3. Verify the loop condition `burgs.length < count + 1` is working

#### Fix 3: Fix Burg Placement Logic

**Effort:** 1-2 hours  
**Impact:** High - Reduces excessive burg generation

**Actions:**
1. Review `placeTowns()` calculation for `desiredNumber`
2. Verify spacing logic is working correctly
3. Add limits to prevent excessive burg placement

### Testing Recommendations

1. **Test with statesNumber: 18** - Verify exactly 18 states are created
2. **Test with manors: 100** - Verify burg count is reasonable
3. **Compare to original Azgaar** - Generate same seed, compare metrics
4. **Visual inspection** - Verify map doesn't look overcrowded

---

## Conclusion

**rankCells() Implementation:** ✅ **SUCCESSFUL**

The `rankCells()` function is working correctly and enables culture/burg/state generation. However, **state and burg generation logic has issues** that cause excessive generation:

- **677 states** instead of ~18 (37x too many)
- **676 burgs** instead of 50-200 (3-13x too many)

**Next Steps:**
1. Fix state creation logic to limit to `options.statesNumber`
2. Fix capital placement logic to ensure correct count
3. Fix burg placement logic to ensure reasonable count
4. Re-test with seed 42 and verify metrics match expected

**Estimated Fix Time:** 3-5 hours

---

**Report Generated:** 2026-01-03  
**Tester:** AI Assistant  
**Review Status:** Pending user review
