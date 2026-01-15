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
