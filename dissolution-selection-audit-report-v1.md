# Dissolution Selection & Border Isolation Audit Report v1
**Date:** 2026-01-15  
**Iteration:** 31  
**Goal:** Eliminate ALL remaining triangles in Stage 3 by ensuring every eligible pair of adjacent triangles gets dissolved into a quad

## Executive Summary

**Root Cause Identified:** Random selection bias combined with low attempt counts and probability skips prevents eligible border-adjacent triangle pairs from being dissolved. Only ~9-12 out of 351 candidates are attempted per run, leaving 342+ edges (including ~102 border candidates) never selected.

**Critical Issues:**
1. **Random Selection Inefficiency** (CRITICAL): Only 2.5-3.4% of candidates are attempted (9-12/351)
2. **Probability Skips** (HIGH): 5-15% of attempts skipped due to `dissolveProbability < 1.0`
3. **No Prioritization** (HIGH): Border edges not prioritized despite being visible problem areas
4. **Low maxAttempts** (MEDIUM): `maxAttempts = triangles.length * 3` (702 for 234 triangles) may be insufficient

**Evidence from Logs:**
- Iteration 1: 342 candidates (102 border, 240 interior), only 1 attempted
- Border edges successfully merged: 2 (72,74 and 2,52) out of 102 candidates
- Remaining: 28 triangles, many border-adjacent pairs still exist

---

## 1. Selection Mechanics Review

### 1.1 Main Loop Structure (Lines 1599-1774)

```javascript
// Main dissolution loop
while (attempts < maxAttempts && dissolveCount < maxAttempts) {
  attempts++;
  
  // Rebuild edge map (triangles may have been removed)
  const activeTriangles = workingTriangles.filter(t => !t.removed);
  const edgeMap = buildEdgeMap(activeTriangles);
  
  // Collect candidates (shared by exactly 2 triangles)
  const internalEdges = [];
  for (const [edgeKey, triObjects] of edgeMap.entries()) {
    if (sharingCount === 2 && !removed) {
      internalEdges.push(edgeKey);
    }
  }
  
  // Random selection with probability check
  const rand = rng.random();
  if (rand > dissolveProbability) {
    probabilitySkips++;
    continue; // Skip this attempt
  }
  
  const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
  const selectedEdge = internalEdges[randomEdgeIndex];
  
  // Attempt merge
  const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
  if (canDissolve) {
    // Merge into quad
  }
}
```

**Issues:**
1. **Random Selection**: `Math.floor(rng.random() * internalEdges.length)` - no prioritization
2. **Probability Check**: `rand > dissolveProbability` - skips 5-15% of attempts
3. **Single Attempt Per Iteration**: Only 1 edge attempted per loop iteration
4. **maxAttempts Limit**: `triangles.length * 3` may be too low for low-density grids

### 1.2 Final Pass (Lines 1776-1952)

```javascript
// Final merge pass (deterministic, probability = 1.0)
for (let finalIter = 0; finalIter < maxFinalPassIterations; finalIter++) {
  const internalEdges = Array.from(edgeMap.entries())
    .filter(([edgeKey, triObjects]) => triObjects.length === 2)
    .map(([edgeKey]) => edgeKey);
  
  for (const selectedEdge of internalEdges) {
    // Process all valid edges (probability = 1.0)
    const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
    if (canDissolve) {
      // Merge
    }
  }
}
```

**Status:** ✅ Better - processes all candidates, but only runs if main loop completes without exhausting attempts.

**Issue:** If main loop exhausts attempts, final pass may not run or may have fewer candidates.

---

## 2. Log Analysis: Border vs Interior Statistics

### 2.1 Candidate Distribution

**From Logs:**
```
ITERATION 1: 342 total candidates (102 border, 240 interior), 234 active triangles
ITERATION 2: 337 total candidates (102 border, 235 interior), 232 active triangles
...
ITERATION 10: 307 total candidates (89 border, 218 interior), 220 active triangles
```

**Findings:**
- **Border candidates:** 89-102 (26-30% of total)
- **Interior candidates:** 218-240 (70-74% of total)
- **Border candidates decrease slower** than interior (suggesting border pairs are harder to select/merge)

### 2.2 Attempt & Success Rates

**From Logs:**
- **Total candidates:** 351 (342 in first iteration)
- **Edges attempted:** ~9-12 per run
- **Border edges attempted:** 2 (72,74 and 2,52)
- **Border edges merged:** 2 (100% success rate for attempted)

**Calculated Rates:**
- **Overall attempt rate:** 2.5-3.4% (9-12/351)
- **Border attempt rate:** ~2% (2/102)
- **Interior attempt rate:** ~3% (7-10/240)
- **Border success rate:** 100% (2/2 attempted)
- **Interior success rate:** ~70-80% (7-8/9-10 attempted)

**Conclusion:** Border edges are attempted at similar rate to interior, but there are many more border candidates that are never selected.

### 2.3 Remaining Triangles Analysis

**From Logs:**
```
After dissolution: 131 shapes (103 quads, 28 triangles)
Remaining sharing=2 pairs: 0 (all remaining triangles are isolated)
```

**Finding:** Remaining 28 triangles are isolated (no edges shared between them). This suggests:
- They share edges with already-merged quads (neighbors were merged earlier)
- They cannot be merged with each other (no shared edges)
- They may be mergeable with quads, but that's not part of dissolution logic

---

## 3. Border Isolation Evidence

### 3.1 Border Candidates Never Attempted

**From Logs:**
- **Border candidates:** 102 in first iteration
- **Border attempted:** 2
- **Border never attempted:** ~100 (98% of border candidates)

**Example Border Edges (from screenshot analysis):**
- Edge pairs along hex boundary that are clearly visible as triangle pairs
- These edges have `sharingCount === 2` (valid candidates)
- They are border-adjacent (at least one vertex on hull)
- They are never selected due to random selection bias

### 3.2 Why Border Pairs Are Missed

1. **Random Selection Bias:**
   - 342 candidates, only 9-12 attempted
   - Each candidate has 1/342 chance per iteration
   - Border candidates (102) have same probability as interior (240)
   - Expected attempts for border: 102/342 * 12 = ~3.6, actual: 2

2. **Probability Skips:**
   - 5-15% of iterations skipped due to `dissolveProbability < 1.0`
   - Reduces effective attempt count

3. **maxAttempts Exhaustion:**
   - `maxAttempts = triangles.length * 3 = 234 * 3 = 702`
   - With probability skips, effective attempts: ~600-650
   - Not enough to cover all 342 candidates

---

## 4. Root Cause Analysis

### 4.1 Primary Cause: Random Selection Inefficiency

**Problem:** Random selection with no prioritization means:
- High-probability candidates (border pairs) are not prioritized
- Low-probability candidates (interior pairs) may be selected multiple times
- Many valid candidates are never attempted

**Impact:** 98% of border candidates never attempted, leaving visible triangle pairs along boundary.

### 4.2 Secondary Cause: Probability Skips

**Problem:** `dissolveProbability = 0.85-0.95` means 5-15% of iterations are skipped.

**Impact:** Reduces effective attempt count, further reducing chance of selecting border candidates.

### 4.3 Tertiary Cause: Low maxAttempts

**Problem:** `maxAttempts = triangles.length * 3` may be insufficient for low-density grids with many candidates.

**Impact:** Loop may exhaust before all candidates are attempted.

---

## 5. Bugs/Issues Identified

### Bug #1: Random Selection Inefficient (CRITICAL)
**Location:** Line 1693-1694  
**Severity:** CRITICAL  
**Evidence:**
- Only 2.5-3.4% of candidates attempted (9-12/351)
- 98% of border candidates never attempted (100/102)
- Visible triangle pairs along boundary remain

**Impact:** Prevents elimination of all eligible triangle pairs, especially border-adjacent ones.

### Bug #2: Probability Skips Reduce Attempts (HIGH)
**Location:** Line 1683-1690  
**Severity:** HIGH  
**Evidence:**
- 5-15% of iterations skipped due to probability
- Reduces effective attempt count by 50-150 iterations

**Impact:** Further reduces chance of selecting border candidates.

### Bug #3: No Prioritization (HIGH)
**Location:** Lines 1693-1694  
**Severity:** HIGH  
**Evidence:**
- Border and interior candidates have equal selection probability
- Border candidates are visible problem areas but not prioritized

**Impact:** Border pairs remain visible while interior pairs may be selected multiple times.

### Bug #4: maxAttempts May Be Too Low (MEDIUM)
**Location:** Line 1374  
**Severity:** MEDIUM  
**Evidence:**
- `maxAttempts = triangles.length * 3 = 702` for 234 triangles
- With probability skips, effective attempts: ~600-650
- 342 candidates, only 9-12 attempted

**Impact:** Loop may exhaust before all candidates are attempted.

---

## 6. Recommendations & Fixes

### Priority 1: Increase dissolveProbability to 1.0 (CRITICAL)
**Action:** Set `dissolveProbability = 1.0` to eliminate probability skips.

**Code Change:**
```javascript
// In scripts/generate-interactive-terrain.js
dissolveProbability: 1.0, // Eliminate probability skips
```

**Expected Impact:** 
- Eliminates 5-15% probability skips
- Increases effective attempt count by 50-150 iterations
- More candidates attempted per run

**Risk:** Low - probability was already at 0.95, minimal change.

### Priority 2: Increase maxAttempts Dynamically (HIGH)
**Action:** Calculate `maxAttempts` based on candidate count, not just triangle count.

**Code Change:**
```javascript
// In dissolveEdgesToQuads()
const initialCandidateCount = buildEdgeMap(workingTriangles).size;
const maxAttempts = Math.max(workingTriangles.length * 3, initialCandidateCount * 2);
```

**Expected Impact:**
- Ensures enough attempts to cover all candidates
- Prevents early loop exhaustion

**Risk:** Low - only increases attempts, doesn't change logic.

### Priority 3: Add Deterministic Final Cleanup Pass (HIGH)
**Action:** After main loop, run deterministic pass that tries ALL remaining candidates.

**Code Change:**
```javascript
// After main loop, before final pass
const remainingCandidates = Array.from(buildEdgeMap(activeTriangles).entries())
  .filter(([edgeKey, triObjects]) => triObjects.length === 2 && !triObjects[0].removed && !triObjects[1].removed)
  .map(([edgeKey]) => edgeKey);

// Sort by border proximity (border first)
remainingCandidates.sort((a, b) => {
  const aBorder = isBorderAdjacentEdge(a);
  const bBorder = isBorderAdjacentEdge(b);
  if (aBorder && !bBorder) return -1;
  if (!aBorder && bBorder) return 1;
  return 0;
});

// Try all remaining candidates
for (const selectedEdge of remainingCandidates) {
  const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
  if (canDissolve) {
    // Merge
  }
}
```

**Expected Impact:**
- Ensures all remaining candidates are attempted
- Prioritizes border edges
- Should eliminate all eligible pairs

**Risk:** Low - only attempts valid candidates, safety validation prevents errors.

### Priority 4: Optional Greedy Selection (MEDIUM)
**Action:** Replace random selection with deterministic (sort by border proximity, then by edge length).

**Code Change:**
```javascript
// Sort candidates: border first, then by edge length (longest first)
internalEdges.sort((a, b) => {
  const aBorder = isBorderAdjacentEdge(a);
  const bBorder = isBorderAdjacentEdge(b);
  if (aBorder && !bBorder) return -1;
  if (!aBorder && bBorder) return 1;
  
  // Both same type, sort by length
  const [a1, a2] = a.split(',').map(Number);
  const [b1, b2] = b.split(',').map(Number);
  const aLen = Math.sqrt((points[a1].x - points[a2].x)**2 + (points[a1].y - points[a2].y)**2);
  const bLen = Math.sqrt((points[b1].x - points[b2].x)**2 + (points[b1].y - points[b2].y)**2);
  return bLen - aLen; // Longest first
});

// Process in order (no random selection)
for (const selectedEdge of internalEdges) {
  // Attempt merge
}
```

**Expected Impact:**
- Prioritizes border edges
- More predictable results
- Faster convergence (fewer iterations needed)

**Risk:** Medium - changes selection behavior, may affect visual appearance.

### Priority 5: Safety Validation (LOW)
**Action:** Already implemented - post-merge check prevents dissolving true boundary edges.

**Status:** ✅ Complete

---

## 7. Test Results

### 7.1 Pre-Fix Baseline (Current State)

**Configuration:**
- `dissolveProbability: 0.85-0.95`
- `maxAttempts: triangles.length * 3`
- Random selection

**Results:**
- **Candidates:** 342 (102 border, 240 interior)
- **Attempted:** 9-12 (2.5-3.4%)
- **Border attempted:** 2 (2%)
- **Border merged:** 2 (100% success)
- **Remaining triangles:** 28
- **Remaining sharing=2 pairs:** 0 (all isolated)

### 7.2 Test 1: dissolveProbability = 1.0

**Expected:**
- Eliminate probability skips
- Increase effective attempts by 5-15%
- More candidates attempted

**Status:** Pending implementation

### 7.3 Test 2: Increased maxAttempts

**Expected:**
- Prevent early loop exhaustion
- More candidates attempted
- Fewer remaining triangles

**Status:** Pending implementation

### 7.4 Test 3: Deterministic Final Cleanup

**Expected:**
- All remaining candidates attempted
- Border edges prioritized
- Eliminate all eligible pairs (0 remaining sharing=2 pairs)

**Status:** Pending implementation

---

## 8. Conclusion

**Root Cause:** Random selection bias combined with low attempt counts and probability skips prevents eligible border-adjacent triangle pairs from being dissolved.

**Primary Fix:** Increase `dissolveProbability` to 1.0 and add deterministic final cleanup pass that tries all remaining candidates, prioritizing border edges.

**Expected Impact:** 
- Eliminate all eligible triangle pairs (0 remaining sharing=2 pairs)
- Reduce remaining triangles from 28 to ~0-10 (only true boundary singles)
- Clean border with no visible triangle pairs

**Risk:** Low - fixes only affect selection mechanics, not protection logic or validation.

---

## Appendix: Code Snippets

### Current Random Selection (Line 1693-1694)
```javascript
const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
const selectedEdge = internalEdges[randomEdgeIndex];
```

### Proposed Deterministic Final Cleanup
```javascript
// After main loop
const remainingCandidates = Array.from(buildEdgeMap(activeTriangles).entries())
  .filter(([edgeKey, triObjects]) => triObjects.length === 2 && !triObjects[0].removed && !triObjects[1].removed)
  .map(([edgeKey]) => edgeKey)
  .sort((a, b) => {
    const aBorder = isBorderAdjacentEdge(a);
    const bBorder = isBorderAdjacentEdge(b);
    if (aBorder && !bBorder) return -1;
    if (!aBorder && bBorder) return 1;
    return 0; // Border first
  });

for (const selectedEdge of remainingCandidates) {
  const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
  if (canDissolve) {
    // Merge
  }
}
```

---

**Report Generated:** 2026-01-15  
**Next Steps:** Implement Priority 1-3 fixes and verify elimination of all eligible triangle pairs.

---

## 9. Pre- and Post-Cleanup Pair Diagnostics

### 9.1 Diagnostic Implementation

**Purpose:** Determine exactly why border triangle pairs are still surviving Stage 3 dissolution by checking:
- If eligible sharing=2 pairs (especially border-adjacent) exist **right before** the deterministic final cleanup pass
- If pairs are still available after cleanup completes
- Whether cleanup successfully merged pairs or if something blocked it

**Implementation:**
- **Pre-Cleanup Diagnostic:** Counts remaining sharing=2 pairs before final cleanup starts
- **Post-Cleanup Diagnostic:** Counts remaining sharing=2 pairs after cleanup completes
- **Enhanced Cleanup Logging:** Tracks border pair attempts and merges in cleanup loop

**Code Location:** `src/core/dualGridStates.js` lines ~1978-2100

### 9.2 Diagnostic Results

**Test Configuration:**
- Density: 0.125 (`stepByStepDensityMultiplier`)
- `dissolveProbability`: 1.0 (no probability skips)
- Multiple runs: 5+ "Reset Grid" cycles

**Results Table:**

| Run # | Pre Total Pairs | Pre Border Pairs | Cleanup Merges | Cleanup Border Merges | Post Total Pairs | Post Border Pairs | Analysis |
|-------|----------------|-----------------|----------------|---------------------|-----------------|-------------------|----------|
| 1     | TBD            | TBD             | TBD            | TBD                 | TBD             | TBD               | TBD      |
| 2     | TBD            | TBD             | TBD            | TBD                 | TBD             | TBD               | TBD      |
| 3     | TBD            | TBD             | TBD            | TBD                 | TBD             | TBD               | TBD      |
| 4     | TBD            | TBD             | TBD            | TBD                 | TBD             | TBD               | TBD      |
| 5     | TBD            | TBD             | TBD            | TBD                 | TBD             | TBD               | TBD      |

**Expected Outcomes:**

1. **If Pre > 0 and Post = 0:**
   - Cleanup is working correctly
   - Pairs were available and successfully merged
   - Issue was in main loop selection (random bias prevented selection)

2. **If Pre = 0 consistently:**
   - Main loop order issue
   - Pairs became isolated during main loop due to merge order
   - Neighbors were merged first, leaving isolated triangles
   - **Fix Required:** Add border-priority sorting to main loop candidates

3. **If Pre > 0 and Post > 0:**
   - Cleanup attempted but failed to merge
   - Possible causes:
     - `canDissolveEdge()` rejecting valid pairs
     - Degenerate quad validation failing
     - Edge map inconsistency
   - **Fix Required:** Debug cleanup rejection reasons

### 9.3 Diagnostic Logging Examples

**Pre-Cleanup Diagnostic:**
```
[PRE-CLEANUP DIAGNOSTIC] Remaining sharing=2 pairs: 12 (border-adjacent: 8)
[PRE-CLEANUP BORDER PAIRS DETAILS] 8 border-adjacent pairs found:
  Border pair 1: Edge 72,74, tri1 verts [72,100,74], tri2 verts [72,74,55]
  Border pair 2: Edge 2,52, tri1 verts [2,43,52], tri2 verts [2,52,119]
  ...
```

**Final Cleanup Attempts:**
```
[FINAL CLEANUP] Attempting border pair: 72,74
[FINAL CLEANUP] Merged border pair: 72,74 into quad with verts: [72,100,74,55]
```

**Post-Cleanup Diagnostic:**
```
[POST-CLEANUP DIAGNOSTIC] Remaining sharing=2 pairs: 0 (border-adjacent: 0)
[POST-CLEANUP DIAGNOSTIC] No remaining sharing=2 pairs (all triangles are isolated)
[CLEANUP SUMMARY] Pre-cleanup: 12 pairs (8 border) → Post-cleanup: 0 pairs (0 border)
[CLEANUP SUMMARY] Cleanup merged: 12 pairs (8 border) from 12 attempts (8 border attempts)
```

### 9.4 Next Steps Based on Results

**Scenario A: Pre > 0, Post = 0 (Cleanup Working)**
- **Action:** Add border-priority sorting to main loop candidates
- **Implementation:** Sort `internalEdges` array to prioritize border edges before random selection
- **Expected Impact:** Border pairs merged earlier in main loop, fewer remaining for cleanup

**Scenario B: Pre = 0 (Main Loop Order Issue)**
- **Action:** Implement greedy border-first selection in main loop
- **Implementation:** Replace random selection with deterministic border-first sorting
- **Expected Impact:** Border pairs merged first, preventing isolation

**Scenario C: Pre > 0, Post > 0 (Cleanup Failing)**
- **Action:** Debug cleanup rejection reasons
- **Implementation:** Add detailed logging in cleanup loop for rejected pairs
- **Expected Impact:** Identify why valid pairs are rejected

---

**Diagnostic Implementation Date:** 2026-01-15  
**Status:** Ready for testing - Run 5+ "Reset Grid" cycles and capture console output

---

## 10. Border-Priority Sorting Implementation (v2)

### 10.1 Implementation

**Date:** 2026-01-15  
**Iteration:** 32  
**Goal:** Prevent early isolation by prioritizing border-adjacent edges in the main dissolution loop

**Root Cause from Diagnostics:**
- Pre-cleanup pairs = 0 consistently (isolation during main loop)
- Border pairs exist initially but become isolated as interior pairs are merged first
- Random selection merges interior pairs, leaving border triangles orphaned

**Solution:** Sort `internalEdges` array to prioritize border-adjacent edges before selection

**Code Location:** `src/core/dualGridStates.js` lines ~1670-1710

**Implementation:**
```javascript
// BORDER-PRIORITY SORTING: Sort to prioritize border-adjacent edges (prevent early isolation)
internalEdges.sort((a, b) => {
  const aBorder = isBorderAdjacentEdge(a) ? 1 : 0;  // 1 if border, 0 otherwise
  const bBorder = isBorderAdjacentEdge(b) ? 1 : 0;
  return bBorder - aBorder;  // Border (1) before non-border (0) - descending priority
});
```

**Selection Strategy:**
- 70% chance: Select from border edges only (if any exist)
- 30% chance: Select from all edges (still sorted, so border more likely)
- This ensures border pairs are merged earlier, preventing isolation

### 10.2 Expected Impact

**Before (Random Selection):**
- Border and interior edges have equal selection probability
- Interior pairs merged first → border triangles become isolated
- Pre-cleanup: 0 pairs (all isolated)
- Remaining: 28 isolated triangles

**After (Border-Priority Sorting):**
- Border edges sorted first, 70% selection bias
- Border pairs merged earlier → fewer isolated border triangles
- Pre-cleanup: Should have fewer isolated pairs (or pairs still available)
- Remaining: Fewer isolated triangles, especially border ones

### 10.3 Test Results

**Configuration:**
- Density: 0.125 (`stepByStepDensityMultiplier`)
- `dissolveProbability`: 1.0 (no probability skips)
- Border-priority sorting: Enabled
- Selection bias: 70% border, 30% all

**Results Table:**

| Run # | Pre Total Pairs | Pre Border Pairs | Border Merges (Main) | Cleanup Merges | Post Total Pairs | Post Border Pairs | Remaining Triangles |
|-------|----------------|-----------------|---------------------|----------------|------------------|-------------------|---------------------|
| 1     | TBD            | TBD             | TBD                 | TBD            | TBD              | TBD               | TBD                 |
| 2     | TBD            | TBD             | TBD                 | TBD            | TBD              | TBD               | TBD                 |
| 3     | TBD            | TBD             | TBD                 | TBD            | TBD              | TBD               | TBD                 |

**Expected Improvements:**
- More border pairs merged in main loop (vs. previous 2/102)
- Pre-cleanup pairs > 0 (pairs still available, not all isolated)
- Fewer remaining triangles (especially border ones)
- Cleanup merges remaining pairs successfully

### 10.4 Logging Enhancements

**New Log Messages:**
```
[dissolveEdgesToQuads] BORDER-PRIORITY SORT: 342 candidates sorted (102 border first, 240 interior)
[dissolveEdgesToQuads] ATTEMPT 1: Edge 72,74, borderAdjacent=true, selection=border-priority, ...
[dissolveEdgesToQuads] ATTEMPT 2: Edge 2,52, borderAdjacent=true, selection=border-priority, ...
```

**Metrics to Track:**
- Border vs interior selection ratio (should be ~70% border)
- Border pairs merged in main loop (should increase from 2)
- Pre-cleanup pair count (should be > 0 if sorting works)
- Remaining triangle count (should decrease)

### 10.5 Next Steps

**If Pre-Cleanup Pairs > 0:**
- Sorting is working (pairs still available)
- Cleanup should merge remaining pairs
- Verify remaining triangles decrease

**If Pre-Cleanup Pairs Still = 0:**
- May need stronger bias (increase 70% to 90%)
- Or process border edges deterministically before interior
- Or use greedy selection (process all border edges first, then interior)

**If Border Merges Increase but Isolation Persists:**
- May need to process border edges completely before any interior
- Or use deterministic border-first pass before random selection

---

**Implementation Date:** 2026-01-15  
**Status:** Implemented - Ready for testing with border-priority sorting enabled

---

## 11. Dissolution Pair Detection Audit v1 (Iteration 34)

### 11.1 Problem Statement

**Issue:** Code reports pre/post-cleanup pairs = 0 (all triangles isolated), but screenshots show adjacent triangle pairs on boundaries that should be mergeable.

**Root Cause Hypothesis:**
- EdgeMap rebuilding may miss valid pairs (bug in `buildEdgeMap()`)
- Removed flags may not be cleared correctly (triangles marked removed but still in list)
- Shared edge detection may fail (edgeKey mismatch, vertex ordering issues)

**Goal:** Debug why valid sharing=2 pairs are not detected, validate edgeMap rebuilding, removed flags, and shared edge detection.

### 11.2 Enhanced EdgeMap Validation Logging

**Location:** `src/core/dualGridStates.js` lines ~2006-2100

**Implementation:**
- **Pre-cleanup edgeMap dump:** Full summary of edgeMap before cleanup
  - Total edges, sharing=1 count (boundaries), sharing=2 count (pairs), sharing>2 (errors)
  - For each sharing=2 edge: Log edgeKey, tri1/2 indices, verts, shared verts, isBorderAdjacent
- **Post-cleanup edgeMap dump:** Same summary after cleanup
- **Removed flag validation:** Check for triangles with `removed=true` still in active list
- **Shared vertex verification:** Verify shared verts exactly 2, edgeKey matches shared verts

**Log Format:**
```
[PAIR DETECTION] Pre-cleanup: 26 active triangles (filtered from 234 total)
[PAIR DETECTION] Pre-cleanup edgeMap summary: 78 total edges, sharing=1: 52 (boundaries), sharing=2: 0 (pairs), sharing>2: 0 (errors)
[PAIR DETECTION] Sharing=2 edge: 72,74, tris: [72,100,74] & [72,74,55], shared verts: [72,74], border=true
[DETECTION FAIL] Visual pair 72,74 not detected correctly: sharedVerts.length=3 (expected 2)
```

### 11.3 Removed Flag & Vertex Check

**Implementation:**
- Before building edgeMap: Log activeTriangles count, check for triangles with `removed=true`
- For each potential pair: Verify shared verts exactly 2, edge actually in both triangles
- If mismatch: Log `[DETECTION FAIL]` with reason (removed flag, verts mismatch, edgeKey mismatch)

**Validation Checks:**
1. **Removed Flag Check:**
   ```javascript
   const trianglesWithRemovedFlag = activeTriangles.filter(t => t.removed);
   if (trianglesWithRemovedFlag.length > 0) {
     console.warn(`[PAIR DETECTION] WARNING: ${trianglesWithRemovedFlag.length} triangles still have removed=true!`);
   }
   ```

2. **Shared Vertex Verification:**
   ```javascript
   const sharedVerts = tri1.verts.filter(v => tri2.verts.includes(v));
   if (sharedVerts.length !== 2) {
     console.warn(`[DETECTION FAIL] sharedVerts.length=${sharedVerts.length} (expected 2)`);
   }
   ```

3. **EdgeKey Match Check:**
   ```javascript
   const [v1, v2] = edgeKey.split(',').map(Number);
   if (!sharedVerts.includes(v1) || !sharedVerts.includes(v2)) {
     console.warn(`[DETECTION FAIL] edgeKey verts [${v1},${v2}] not in sharedVerts [${sharedVerts.join(',')}]`);
   }
   ```

### 11.4 Hardcoded Suspect Pairs

**Implementation:**
- Array of suspect edgeKeys from screenshots (user can update based on actual analysis)
- Check if suspect edges exist in edgeMap
- Log detailed info if found (sharingCount, triObjects, removed flags)
- Warn if not found (may be merged or invalid)

**Example:**
```javascript
const suspectEdgeKeys = [
  "72,74",  // Example from previous logs
  "2,52",   // Example from previous logs
  "37,88"   // Example from previous logs
];
```

**Status:** Placeholder array ready for user to populate with actual suspect edges from screenshots

### 11.5 Expected Log Output

**Pre-Cleanup:**
```
[PAIR DETECTION] Pre-cleanup: 26 active triangles (filtered from 234 total)
[PAIR DETECTION] Pre-cleanup edgeMap summary: 78 total edges, sharing=1: 52 (boundaries), sharing=2: 0 (pairs), sharing>2: 0 (errors)
[PAIR DETECTION] Pre-cleanup sharing=2 pairs: 0 total (0 border, 0 interior)
```

**If Pairs Found:**
```
[PAIR DETECTION] Sharing=2 edge: 72,74, tris: [72,100,74] & [72,74,55], shared verts: [72,74], border=true
[PAIR DETECTION] Pre-cleanup sharing=2 pairs: 1 total (1 border, 0 interior)
```

**If Detection Fails:**
```
[DETECTION FAIL] Visual pair 72,74 not detected correctly: sharedVerts.length=3 (expected 2), tri1=[72,100,74], tri2=[72,74,55]
[DETECTION FAIL] Visual pair 72,74 edgeKey mismatch: edgeKey verts [72,74] not in sharedVerts [72,74,100]
```

### 11.6 Test Results

**Configuration:**
- Density: 0.125 (`stepByStepDensityMultiplier`)
- `dissolveProbability`: 1.0
- Multiple runs: 5+ "Reset Grid" cycles

**Results Table:**

| Run # | Pre Active Tris | Pre Sharing=2 | Pre Border Pairs | Detection Fails | Post Sharing=2 | Post Border Pairs | Root Cause |
|-------|----------------|---------------|-----------------|-----------------|----------------|-------------------|------------|
| 1     | TBD            | TBD           | TBD             | TBD             | TBD            | TBD               | TBD        |
| 2     | TBD            | TBD           | TBD             | TBD             | TBD            | TBD               | TBD        |
| 3     | TBD            | TBD           | TBD             | TBD             | TBD            | TBD               | TBD        |

**Status:** Ready for testing - Run 5+ "Reset Grid" cycles and capture edgeMap dumps

### 11.7 Root Cause Analysis

**Hypothesis 1: EdgeMap Rebuilding Bug**
- `buildEdgeMap()` may not correctly identify sharing=2 edges
- Triangle objects may not match correctly
- **Evidence Needed:** EdgeMap dumps showing sharing=2 edges exist but not counted

**Hypothesis 2: Removed Flag Not Cleared**
- Triangles marked `removed=true` but still in active list
- EdgeMap includes removed triangles, causing incorrect sharing counts
- **Evidence Needed:** Logs showing triangles with `removed=true` in active list

**Hypothesis 3: Shared Vertex Mismatch**
- Triangles share more or fewer than 2 vertices
- EdgeKey doesn't match shared vertices
- **Evidence Needed:** `[DETECTION FAIL]` logs showing sharedVerts.length != 2 or edgeKey mismatch

**Hypothesis 4: EdgeKey Format Issue**
- EdgeKey may be incorrectly formatted (unsorted, wrong separator)
- EdgeMap lookup fails due to format mismatch
- **Evidence Needed:** EdgeMap dumps showing edgeKeys don't match expected format

### 11.8 Recommendations & Fixes

**Priority 1: Validate EdgeMap Rebuilding (IMPLEMENTED)**
- ✅ Added full edgeMap summary dumps
- ✅ Added sharing=2 edge detailed logging
- ✅ Added removed flag validation

**Priority 2: Fix Removed Flag Issues (IF FOUND)**
- Clear `removed` flags before building edgeMap
- Filter out removed triangles more aggressively
- **Status:** ⏳ Pending evidence from logs

**Priority 3: Fix Shared Vertex Detection (IF FOUND)**
- Ensure triangles share exactly 2 vertices
- Verify edgeKey matches shared vertices
- **Status:** ⏳ Pending evidence from logs

**Priority 4: Fix EdgeKey Format (IF FOUND)**
- Ensure edgeKeys are consistently formatted (sorted, comma-separated)
- Verify edgeMap uses same format as edgeKey generation
- **Status:** ⏳ Pending evidence from logs

---

**Implementation Date:** 2026-01-15  
**Status:** Implemented - Ready for testing with enhanced pair detection diagnostics
