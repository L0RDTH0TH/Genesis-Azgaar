# ID Propagation Audit Report – Why Frontend Tooltips Show "No ID (fallback)"

**Date:** 2026-01-15  
**Author:** Diagnostic Audit (via Cursor analysis)  
**Status:** Pure Investigation – No Fixes Implemented

---

## Executive Summary

This audit traces the data flow of shape IDs (`id`, `lineage`, `centroid`) from backend assignment through serialization to frontend rendering. **Root cause identified:** IDs are assigned correctly in the backend but are systematically stripped during serialization at multiple `.map()` operations that only copy specific properties (`type`, `verts`, `i`, `center`) and exclude ID-related fields.

**Key Finding:** IDs disappear at **5 distinct serialization points** between backend generation and frontend rendering, all due to selective property copying in `.map()` operations.

---

## 1. Backend Confirmation (src/core/dualGridStates.js)

### 1.1 ID Assignment Locations

**Triangles (Triangulation):**
- **Function:** `triangulateFromPointsWithDelaunator()` (lines ~1495-1500)
- **Function:** `triangulateFromPointsSimple()` (similar logic)
- **Assignment:** `triangle.id = generateID('tri')` when `useIDs === true`
- **Format:** `"tri-0000"`, `"tri-0001"`, etc. (sequential) or `"tri-uuid..."` (UUID mode)
- **Lineage:** `triangle.lineage = []` (empty for originals)
- **Centroid:** `triangle.centroid = null` (placeholder)

**Quads (Dissolution/Merge):**
- **Function:** `mergeTrianglesToQuad()` (lines ~2019-2033)
- **Assignment:** `quad.id = getQuadId()` when `useIDs === true`
- **Format:** `"quad-0000"`, `"quad-0001"`, etc. (sequential) or `"quad-uuid..."` (UUID mode)
- **Lineage:** Inherited from parent triangles: `[...tri1Lineage, tri1Id, ...tri2Lineage, tri2Id]`
- **Centroid:** `quad.centroid = null` (placeholder)

**Sub-quads (Subdivision):**
- **Function:** `subdivideTriangleIntoThreeQuads()` (lines ~3384-3395)
- **Assignment:** `subQuad.id = getSubQuadId()` when `useIDs === true`
- **Format:** `"sub-0000"`, `"sub-0001"`, etc. (sequential) or `"sub-uuid..."` (UUID mode)
- **Lineage:** Inherited from parent triangle: `[...triangle.lineage, triangle.id]`
- **Centroid:** `subQuad.centroid = null` (placeholder)

### 1.2 Backend Validation Results

**After Triangulation:**
```
[ID VALIDATION] After Triangulation (sequential mode): 234 unique IDs, 0 missing, 0 duplicates
```

**After Dissolution:**
```
[ID VALIDATION] After Dissolution - Merged Quads (sequential mode): 104 unique IDs, 0 missing, 0 duplicates
[ID VALIDATION] After Dissolution - Survivors (sequential mode): 26 unique IDs, 0 missing, 0 duplicates
```

**Conclusion:** IDs are present and valid in the backend immediately after assignment. All shapes have `id`, `lineage`, and `centroid` properties set correctly.

### 1.3 Sample Backend Shape (Before Serialization)

**From audit logs:**
```
[AUDIT LOG] stage2_triangles BEFORE map: sample triangle has id=tri-0000, lineage=[], centroid=null
[AUDIT LOG] stage3_quads BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] stage3_quads BEFORE map: sample triangle has id=tri-0015, lineage=[]
[AUDIT LOG] stage4_subdividedTriangles BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] level0Quads BEFORE map: sample quad from allQuads has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
```

**Evidence:** IDs and lineage are present on all shapes in the backend before any serialization occurs.

---

## 2. Data Serialization / Export Points

### 2.1 Serialization Point #1: `pipelineStages.stage2_triangles`

**Location:** `src/core/dualGridStates.js` lines ~597-600

**Code:**
```javascript
pipelineStages.stage2_triangles = triangles.map(t => ({
  type: t.type,
  verts: [...t.verts],
}));
```

**Audit Log Evidence:**
```
[AUDIT LOG] stage2_triangles BEFORE map: sample triangle has id=tri-0000, lineage=[], centroid=null
[AUDIT LOG] stage2_triangles AFTER map: sample triangle has id=undefined, lineage=undefined, centroid=null
```

**Observation:** Only `type` and `verts` are copied. `id`, `lineage`, and `centroid` are excluded.

---

### 2.2 Serialization Point #2: `pipelineStages.stage3_quads`

**Location:** `src/core/dualGridStates.js` lines ~691-694

**Code:**
```javascript
pipelineStages.stage3_quads = quads.map(q => ({
  type: q.type,
  verts: [...q.verts],
}));
```

**Audit Log Evidence:**
```
[AUDIT LOG] stage3_quads BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] stage3_quads BEFORE map: sample triangle has id=tri-0015, lineage=[]
[AUDIT LOG] stage3_quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

**Observation:** Only `type` and `verts` are copied. `id`, `lineage`, and `centroid` are excluded.

---

### 2.3 Serialization Point #3: `pipelineStages.stage4_subdividedTriangles`

**Location:** `src/core/dualGridStates.js` lines ~1004-1007

**Code:**
```javascript
pipelineStages.stage4_subdividedTriangles = allQuads.map(q => ({
  type: q.type,
  verts: [...q.verts],
}));
```

**Audit Log Evidence:**
```
[AUDIT LOG] stage4_subdividedTriangles BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] stage4_subdividedTriangles AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

**Observation:** Only `type` and `verts` are copied. `id`, `lineage`, and `centroid` are excluded.

---

### 2.4 Serialization Point #4: `level0Quads` Creation

**Location:** `src/core/dualGridStates.js` lines ~1025-1034

**Code:**
```javascript
const level0Quads = allQuads.map((q, i) => ({
  i: i,
  level: 0,
  verts: q.verts,
  center: calculateQuadCenter(q.verts, points),
  parentQuadId: null,
  childQuadIds: [],
  stateId: -1,
  provinceId: -1,
}));
```

**Audit Log Evidence:**
```
[AUDIT LOG] level0Quads BEFORE map: sample quad from allQuads has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

**Observation:** Only `i`, `level`, `verts`, `center`, `parentQuadId`, `childQuadIds`, `stateId`, and `provinceId` are copied. `id`, `lineage`, and `centroid` are excluded.

**Critical Note:** This is the primary data structure returned in `buildStalbergQuadGrid()` result object (`result.level0Quads`). IDs are lost at this point for all subsequent operations.

---

### 2.5 Serialization Point #5: `pipelineStages.stage6_final.level0Quads`

**Location:** `src/core/dualGridStates.js` lines ~1153-1156

**Code:**
```javascript
pipelineStages.stage6_final = {
  points: points.map(p => ({ x: p.x, y: p.y })),
  dualPoints: dualPoints.map(p => ({ x: p.x, y: p.y })),
  level0Quads: level0Quads.map(q => ({
    verts: [...q.verts],
    center: { x: q.center.x, y: q.center.y },
  })),
};
```

**Audit Log Evidence:**
```
[AUDIT LOG] stage6_final level0Quads BEFORE map: sample quad has id=undefined, lineage=undefined, centroid=null
[AUDIT LOG] stage6_final level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

**Observation:** IDs are already lost from `level0Quads` (see Serialization Point #4). This mapping only copies `verts` and `center`, further confirming the loss.

---

### 2.6 Export Serialization: `exportData.level0Quads`

**Location:** `scripts/generate-interactive-terrain.js` lines ~110-114

**Code:**
```javascript
const exportData = {
  points: points.map(p => ({ x: p.x, y: p.y })),
  dualPoints: dualPoints ? dualPoints.map(p => ({ x: p.x, y: p.y })) : null,
  level0Quads: level0Quads.map(q => ({
    i: q.i,
    verts: q.verts,
    center: q.center,
  })),
  // ... other properties
};
```

**Audit Log Evidence:**
```
[AUDIT LOG] exportData level0Quads BEFORE map: sample quad has id=undefined, lineage=undefined, centroid=null
[AUDIT LOG] exportData level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

**Observation:** IDs are already lost from `level0Quads` (see Serialization Point #4). This mapping only copies `i`, `verts`, and `center`.

**Data Flow:** `exportData` is embedded in the generated HTML via `JSON.stringify(pipelineStages, null, 2)` in `generateInteractiveHTML()` (line ~282).

---

## 3. Frontend Data Receipt (scripts/generate-interactive-terrain.js)

### 3.1 Data Source

**Location:** `scripts/generate-interactive-terrain.js` line ~282

**Code:**
```javascript
const PIPELINE_STAGES = ${pipelineStages ? JSON.stringify(pipelineStages, null, 2) : 'null'};
```

**Observation:** `pipelineStages` is stringified and embedded directly in the HTML. The data structure matches what was serialized in the backend (see Section 2).

---

### 3.2 Stage Data Access

**Location:** `scripts/generate-interactive-terrain.js` lines ~531-560

**Code:**
```javascript
function renderPipelineStage(stageKey) {
  const stages = {
    '2': { 
      data: PIPELINE_STAGES.stage2_triangles, 
      points: PIPELINE_STAGES.stage2_points, 
      label: 'Stage 2: After Triangulation', 
      color: '#888',
      type: 'triangles'
    },
    '3': { 
      data: PIPELINE_STAGES.stage3_quads, 
      points: PIPELINE_STAGES.stage3_points, 
      label: 'Stage 3: After Dissolution/Cull', 
      color: '#4488ff',
      type: 'quads'
    },
    // ... other stages
  };
  
  const stage = stages[stageKey];
  // ... rendering logic uses stage.data
}
```

**Observation:** Frontend receives `PIPELINE_STAGES.stage3_quads` (and other stage data) directly from the embedded JSON. No transformation occurs at this point.

**Expected Data Structure (from backend serialization):**
```javascript
stage.data = [
  { type: 'quad', verts: [48, 92, 94, 117] },
  { type: 'triangle', verts: [85, 47, 51] },
  // ... no id, lineage, or centroid properties
]
```

---

### 3.3 Frontend Rendering Loop

**Location:** `scripts/generate-interactive-terrain.js` lines ~678-730

**Code:**
```javascript
if (Array.isArray(stage.data)) {
  stage.data.forEach((quad, quadIdx) => {
    if (quad && quad.verts && Array.isArray(quad.verts) && quad.verts.length >= 3) {
      // ... vertex processing ...
      
      const vertCount = quad.verts?.length ?? 0;
      const detectedType = quad.type ?? 'missing';
      const isTriangle = vertCount === 3;
      
      // ID SPECIFICATION v1.0: Enhanced debug title with ID and lineage
      const idStr = quad.id ? 'ID: ' + quad.id : 'No ID (fallback)';
      const lineageStr = quad.lineage?.length ? 'Lineage: [' + quad.lineage.join(', ') + ']' : 'Original';
      const titleAttr = ` title="${idStr}, Type: ${detectedType}, Verts: ${vertCount}, ${lineageStr}, Indices: [${quad.verts?.join(',') || '—'}]"`;
      
      // ... render path ...
    }
  });
}
```

**Observation:** The rendering code correctly checks for `quad.id` and `quad.lineage`, but these properties are `undefined` because they were never serialized (see Section 2).

**Result:** Tooltips show `"No ID (fallback)"` because `quad.id` is `undefined`.

---

## 4. Key Observations & Contradictions

### 4.1 Data Flow Summary

```
Backend Assignment (✅ IDs present)
  ↓
Serialization Point #1: pipelineStages.stage2_triangles (❌ IDs lost)
  ↓
Serialization Point #2: pipelineStages.stage3_quads (❌ IDs lost)
  ↓
Serialization Point #3: pipelineStages.stage4_subdividedTriangles (❌ IDs lost)
  ↓
Serialization Point #4: level0Quads creation (❌ IDs lost) ← PRIMARY BREAKAGE POINT
  ↓
Serialization Point #5: pipelineStages.stage6_final.level0Quads (❌ IDs already lost)
  ↓
Export: exportData.level0Quads (❌ IDs already lost)
  ↓
Frontend: PIPELINE_STAGES (❌ IDs missing)
  ↓
Rendering: quad.id === undefined → "No ID (fallback)"
```

### 4.2 Root Cause

**All serialization `.map()` operations use selective property copying:**

1. **Stage 2/3/4 pipeline stages:** Only copy `type` and `verts`
2. **level0Quads creation:** Only copy `i`, `level`, `verts`, `center`, `parentQuadId`, `childQuadIds`, `stateId`, `provinceId`
3. **Stage 6 final:** Only copy `verts` and `center`
4. **Export data:** Only copy `i`, `verts`, and `center`

**None of these operations include `id`, `lineage`, or `centroid` in the copied properties.**

### 4.3 No Anomalies Found

- **All shapes affected equally:** Triangles, quads, and sub-quads all lose IDs at the same serialization points
- **No partial loss:** Either IDs are present (before serialization) or completely absent (after serialization)
- **No property name changes:** Properties are simply omitted, not renamed
- **No deep copying issues:** The `.map()` operations create new objects, but only with selected properties
- **No filtering:** No filtering operations drop shapes with IDs; all shapes lose IDs uniformly

### 4.4 Validation Confirmation

**Backend validation confirms IDs are present:**
- After Triangulation: 234 unique IDs, 0 missing, 0 duplicates
- After Dissolution (Merged Quads): 104 unique IDs, 0 missing, 0 duplicates
- After Dissolution (Survivors): 26 unique IDs, 0 missing, 0 duplicates

**Frontend rendering confirms IDs are missing:**
- All tooltips show `"No ID (fallback)"`
- Console logs show `[RENDER TRIANGLE] No ID (fallback), ...`

---

## 5. Raw Logs / Samples Collected During Audit

### 5.1 Backend Validation Logs

```
[ID VALIDATION] After Triangulation (sequential mode): 234 unique IDs, 0 missing, 0 duplicates
[ID VALIDATION] After Dissolution - Merged Quads (sequential mode): 104 unique IDs, 0 missing, 0 duplicates
[ID VALIDATION] After Dissolution - Survivors (sequential mode): 26 unique IDs, 0 missing, 0 duplicates
```

### 5.2 Serialization Audit Logs

```
[AUDIT LOG] stage2_triangles BEFORE map: sample triangle has id=tri-0000, lineage=[], centroid=null
[AUDIT LOG] stage2_triangles AFTER map: sample triangle has id=undefined, lineage=undefined, centroid=null

[AUDIT LOG] stage3_quads BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] stage3_quads BEFORE map: sample triangle has id=tri-0015, lineage=[]
[AUDIT LOG] stage3_quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null

[AUDIT LOG] stage4_subdividedTriangles BEFORE map: sample quad has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] stage4_subdividedTriangles AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null

[AUDIT LOG] level0Quads BEFORE map: sample quad from allQuads has id=quad-0000, lineage=["tri-0138","tri-0152"], centroid=null
[AUDIT LOG] level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null

[AUDIT LOG] stage6_final level0Quads BEFORE map: sample quad has id=undefined, lineage=undefined, centroid=null
[AUDIT LOG] stage6_final level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null

[AUDIT LOG] exportData level0Quads BEFORE map: sample quad has id=undefined, lineage=undefined, centroid=null
[AUDIT LOG] exportData level0Quads AFTER map: sample quad has id=undefined, lineage=undefined, centroid=null
```

### 5.3 Frontend Rendering Logs

```
[RENDER TRIANGLE] No ID (fallback), verts=[85,47,51], type=triangle, Original
[RENDER TRIANGLE] No ID (fallback), verts=[113,27,53], type=triangle, Original
[RENDER TRIANGLE] No ID (fallback), verts=[46,19,57], type=triangle, Original
...
```

---

## 6. Conclusion

**Root Cause Identified:** IDs are systematically stripped during serialization at 5 distinct points, all due to selective property copying in `.map()` operations that exclude `id`, `lineage`, and `centroid`.

**Primary Breakage Point:** `level0Quads` creation (Serialization Point #4) is the most critical, as this is the primary data structure returned from `buildStalbergQuadGrid()` and used throughout the rest of the pipeline.

**Evidence Summary:**
- ✅ Backend: IDs assigned correctly, validated (0 missing, 0 duplicates)
- ❌ Serialization: IDs lost at 5 distinct `.map()` operations
- ❌ Frontend: IDs missing, tooltips show "No ID (fallback)"

**No other issues found:** No property name changes, no deep copying problems, no filtering, no partial loss. The issue is purely selective property copying during serialization.

---

**End of Audit Report**
