<!-- ⚠️ SYNC WARNING: This file must remain identical to azgaar-fork-rules.mdc (excluding .mdc frontmatter) ⚠️ -->

# ╔═══════════════════════════════════════════════════════════
# ║ AZGAAR FORK RULES – ITERATION 2
# ║ GENESIS MYTHOS – CUSTOM AZGAAR FANTASY MAP GENERATOR LIBRARY FORK
# ║ Valid for Cursor (and Grok if assisting on JS) – major changes require explicit approval
# ╚═══════════════════════════════════════════════════════════

**UPDATE 2026-01-12:** Iteration 2 – Added support for modular partial/surgical generation (phase skipping, caching, fallbacks). Extends Iteration 1's modularity for better UX in World Builder (targeted re-gens, dependency handling).

## 1. Master Goals (never compromise)

- Create a **modular, importable JavaScript library** from a fork of Azgaar's Fantasy Map Generator (https://github.com/Azgaar/Fantasy-Map-Generator).
- Core purpose: Seamless integration into Genesis Mythos' WebView-based world builder GUI (godot_wry + Alpine.js).
- Enable full programmatic control: Set parameters directly in JS, generate maps on-demand, render previews to a provided `<canvas>` element, and export structured data (JSON/SVG) for Godot consumption.
- Support optional "headless" mode (data-only generation without DOM rendering where possible) and full visual previews.
- Maintain fidelity to original Azgaar output while removing unnecessary UI elements.
- Keep the fork lightweight, performant, and easy to maintain/merge upstream changes.
- MIT license preserved; consider contributing modular improvements back upstream if feasible.
- Enable partial/surgical generation: Allow skipping/re-running specific phases (e.g., terrain-only or politics-only) with dependency fallbacks and caching for efficiency and live feedback in World Builder.

## 2. Repository Setup

- Fork the original repo: https://github.com/Azgaar/Fantasy-Map-Generator → Your fork: https://github.com/L0RDTH0TH/azgaar-genesis-fork (or similar).
- Clone locally into a separate folder (e.g., `tools/azgaar_fork/` or dedicated repo).
- Keep `main` branch in sync with upstream master via periodic merges.
- Work on feature branches (e.g., `feat/modular-core`, `feat/headless-export`).

## 3. Folder Structure (TARGET STATE – evolve with approval)

```
azgaar-genesis-fork/
├── src/                 # NEW: Refactored core library code (ES6 modules)
│   ├── core/            # Generation logic (heightmap, biomes, cultures, etc.)
│   ├── rendering/       # Canvas/SVG rendering functions
│   ├── utils/           # Shared utilities
│   ├── options.js       # Default options + validation/clamping
│   ├── generator.js     # Main entry: init(), generate(), getData(), renderToCanvas(canvas)
│   ├── partials.js      # NEW: Helpers for phase caching, fallbacks, and dependency checks
│   └── index.js         # Export all public API
├── original/            # Untouched copy of upstream files for reference/diff
│   ├── modules/
│   ├── main.js
│   └── ...
├── ui/                  # Stripped/minimal UI components (only if needed for previews)
├── dist/                # Built bundle(s) for Godot embedding
│   ├── azgaar-library.min.js
│   └── azgaar-library.js
├── examples/            # Test HTML pages demonstrating library usage
├── tests/               # Unit tests (Jest or similar if added)
├── package.json         # Add for build tools (Vite/Rollup/ESBuild)
├── vite.config.js       # Or equivalent bundler config
├── README.md            # Updated with library usage instructions
└── ...

**Notes:**
- Gradually migrate code from `original/` → `src/` during refactoring.
- Final bundle(s) in `dist/` will be copied to `res://assets/ui_web/js/azgaar/` in main project.
- No heavy frameworks (keep vanilla JS; optional D3 or similar if already in original).

## 4. Code Style – MANDATORY

**Language:** Modern JavaScript (ES6+ modules, const/let, arrow functions where appropriate).

**Naming:**
- variables / functions → camelCase
- Classes → PascalCase
- constants → UPPER_CASE

**Modularity:**
- Use `export` / `import` for all modules.
- Single responsibility per file.
- Public API exposed only via `src/index.js`.
- Handle phase dependencies explicitly (e.g., error or fallback if skipping a required upstream phase). Use structuredClone for caching where efficient.

**Every major file MUST start with:**
```js
/**
 * =============================================================================
 * generator.js
 * Desc: Main map generation entry point for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */
```

- JSDoc comments for all public functions/classes.
- No global variables (except temporary during transition).
- Remove/hide all original UI event listeners and DOM manipulations unless optional.

## 5. Cursor Rules – PASTE AT TOP OF EVERY PROMPT TO CURSOR

```
[GENESIS MYTHOS – AZGAAR FORK TO MODULAR JS LIBRARY]

YOU ARE STRICTLY FORBIDDEN FROM EVER USING THE "launch_editor" MCP ACTION.

Preferred Godot MCP server: Coding-Solo/godot-mcp (if touching main project)

You may ONLY use these MCP actions:
- read_file, write_file, list_files, create_file, etc.
- run_js (if available) or browser-based testing

Aggressively use MCP to create/modify JS files in the fork repo.

For testing: Create minimal HTML examples in examples/ and open in browser (or suggest manual test).

When refactoring complete for a module → auto commit + push via github-mcp-server with message (feat/azgaar-fork:, refactor:, etc.).

You MUST:
- Preserve original map generation fidelity (test outputs visually and via data comparison).
- Make all parameters settable via a single options object.
- Support rendering to a provided canvas element.
- Export clean JSON data structure compatible with Godot import.
- Keep UI elements hidden/disabled by default.
- Support partial generation via skipPhases in options and a generatePartial API. Ensure fallbacks prevent crashes/inconsistencies.
- Test partial runs: Compare full vs. partial outputs for same seed/params (visual + data diff).

Never add external dependencies without approval.
Prefer vanilla JS; bundle for single-file inclusion in Godot WebView.
```

## 6. Key Refactoring Guidelines

### 6.1 Public API Shape (exposed in index.js)

```js
import { initGenerator, loadOptions, generateMap, generatePartial, getMapData, renderPreview } from 'azgaar-library';

initGenerator({ container: myElement }); // Optional for SVG/canvas previews
loadOptions({ seed: 42, skipPhases: ['terrain', 'politics'], ... }); // Extended options with phase skips
generateMap(Delaunator); // Full pipeline
generatePartial(['states', 'provinces']); // Surgical re-run of specific phases
const mapData = getMapData(); // JSON with merged full/partial data
renderPreview({ renderConfig: { layers: { states: { enabled: false } } } }); // If container provided, with layer control
```

### 6.2 Phase Constants and Skip Validation

Define `PHASES` constant in `generator.js` or `partials.js` for skip validation:

```js
export const PHASES = {
  VORONOI: 'voronoi',           // Phase 1: Voronoi diagram (required for all)
  HEIGHTMAP: 'heightmap',       // Phase 2: Heightmap generation
  BIOMES: 'biomes',             // Phase 3: Biome assignment
  RIVERS: 'rivers',              // Phase 4: River generation
  CULTURES: 'cultures',          // Phase 11: Culture generation
  BURGS: 'burgs',                // Phase 12: Settlement generation
  STATES: 'states',              // Phase 13: State generation
  PROVINCES: 'provinces',        // Phase 14: Province generation
  RELIGIONS: 'religions',        // Phase 15: Religion generation (conditional)
  // ... other phases
};

// Usage in skip validation
function validateSkipPhases(skipPhases, cached) {
  if (skipPhases.includes(PHASES.STATES) && !cached[PHASES.BURGS]) {
    throw new Error(`Cannot skip ${PHASES.STATES} without cached ${PHASES.BURGS}`);
  }
  // ... dependency checks
}
```

### 6.3 Caching Strategy

Use internal `state.cached` for skipped phase fallbacks. Implement efficient deep copying:

```js
// In partials.js or generator.js
const state = {
  data: { /* current map data */ },
  cached: {},  // Phase cache: { [phaseName]: deepCopyOfRelevantData }
  options: {},
  seed: 0
};

/**
 * Efficient deep copy of phase-relevant data for caching.
 * Uses structuredClone for modern browsers, falls back to JSON for compatibility.
 * For large typed arrays (heightmaps, cell data), prefer direct array copying.
 */
function efficientDeepCopyOfRelevantData(phaseName, data) {
  const phaseData = getPhaseData(phaseName, data);
  
  // Use structuredClone if available (faster, handles more types)
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(phaseData);
  }
  
  // Fallback: JSON round-trip (slower, but compatible)
  return JSON.parse(JSON.stringify(phaseData));
}

/**
 * Extract phase-specific data subset for caching.
 * Minimizes memory footprint by only storing what's needed.
 */
function getPhaseData(phaseName, fullData) {
  switch (phaseName) {
    case PHASES.VORONOI:
      return {
        grid: { cells: fullData.grid.cells, vertices: fullData.grid.vertices },
        pack: { cells: { i: fullData.pack.cells.i } }  // Only indices
      };
    case PHASES.HEIGHTMAP:
      return {
        pack: { cells: { h: fullData.pack.cells.h } }  // Heightmap as Uint8Array
      };
    case PHASES.BIOMES:
      return {
        pack: { cells: { biome: fullData.pack.cells.biome } }
      };
    case PHASES.BURGS:
      return {
        pack: { burgs: fullData.pack.burgs }
      };
    // ... other phases
    default:
      return fullData;  // Full copy if phase-specific extraction not defined
  }
}

// Cache phase data before skipping
function cachePhase(phaseName, data) {
  state.cached[phaseName] = efficientDeepCopyOfRelevantData(phaseName, data);
}

// Restore from cache when phase is skipped
function restoreFromCache(phaseName) {
  if (!state.cached[phaseName]) {
    throw new Error(`No cache available for phase: ${phaseName}`);
  }
  return state.cached[phaseName];
}
```

### 6.4 Fallback Defaults

When a phase is skipped and no cache exists, provide sensible defaults to prevent crashes:

```js
/**
 * Get fallback data for a skipped phase when cache is unavailable.
 * Ensures generation can continue without crashing, but may produce incomplete maps.
 */
function getFallbackForPhase(phaseName) {
  switch (phaseName) {
    case PHASES.BIOMES:
      // Default: Ocean biome for all cells
      return { pack: { cells: { biome: new Array(pack.cells.i.length).fill(0) } } };
    case PHASES.STATES:
      // Default: Single state covering entire map
      return { pack: { states: [{ i: 0, name: 'Default State', cells: pack.cells.i }] } };
    case PHASES.BURGS:
      // Default: Empty burgs array
      return { pack: { burgs: [] } };
    // ... other fallbacks
    default:
      console.warn(`No fallback defined for phase: ${phaseName}`);
      return {};
  }
}
```

### 6.5 RNG Consistency for Partial Generation

For partial runs, derive phase-specific seeds from the main seed to ensure reproducibility:

```js
/**
 * Generate phase-specific seed from main seed and phase name.
 * Ensures same seed + phase name always produces same RNG sequence.
 * Formula: phaseSeed = hash(mainSeed + phaseName)
 */
function getPhaseSeed(mainSeed, phaseName) {
  // Simple hash: combine seed and phase name
  let hash = mainSeed;
  for (let i = 0; i < phaseName.length; i++) {
    hash = ((hash << 5) - hash) + phaseName.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Usage in phase execution
function executePhase(phaseName, options) {
  const phaseSeed = getPhaseSeed(options.seed, phaseName);
  const rng = new SeededRandom(phaseSeed);  // Use phase-specific seed
  
  // Execute phase with phase-specific RNG
  switch (phaseName) {
    case PHASES.HEIGHTMAP:
      generateHeightmap(rng, options);
      break;
    // ... other phases
  }
}
```

### 6.6 Dependency-Aware Execution

Validate phase dependencies before execution and provide clear error messages:

```js
/**
 * Phase dependency graph (defines what phases require which others).
 * Used for validation and automatic dependency resolution.
 */
const PHASE_DEPENDENCIES = {
  [PHASES.HEIGHTMAP]: [PHASES.VORONOI],
  [PHASES.BIOMES]: [PHASES.HEIGHTMAP],
  [PHASES.RIVERS]: [PHASES.HEIGHTMAP],
  [PHASES.CULTURES]: [PHASES.BIOMES],
  [PHASES.BURGS]: [PHASES.CULTURES, PHASES.RIVERS],
  [PHASES.STATES]: [PHASES.BURGS],
  [PHASES.PROVINCES]: [PHASES.STATES],
  [PHASES.RELIGIONS]: [PHASES.STATES],
  // ... other dependencies
};

/**
 * Check if all dependencies for a phase are available (either executed or cached).
 */
function validatePhaseDependencies(phaseName, skipPhases, cached) {
  const deps = PHASE_DEPENDENCIES[phaseName] || [];
  
  for (const dep of deps) {
    // Check if dependency was skipped
    if (skipPhases.includes(dep)) {
      // Check if cached version exists
      if (!cached[dep]) {
        throw new Error(
          `Cannot execute ${phaseName}: dependency ${dep} is skipped but not cached. ` +
          `Either run ${dep} first or provide cached data.`
        );
      }
    }
  }
}

/**
 * Wrapper pattern for phase execution with skip checks, caching, and dependency validation.
 */
function executePhaseWithWrapper(phaseName, phaseFunction, options) {
  const skipPhases = options.skipPhases || [];
  
  // Check if phase should be skipped
  if (skipPhases.includes(phaseName)) {
    // Try to restore from cache
    if (state.cached[phaseName]) {
      console.log(`Skipping ${phaseName}, restoring from cache`);
      const cachedData = restoreFromCache(phaseName);
      mergePhaseData(phaseName, cachedData);
      return;
    }
    
    // Try fallback if no cache
    console.warn(`Skipping ${phaseName} without cache, using fallback`);
    const fallbackData = getFallbackForPhase(phaseName);
    mergePhaseData(phaseName, fallbackData);
    return;
  }
  
  // Validate dependencies before execution
  validatePhaseDependencies(phaseName, skipPhases, state.cached);
  
  // Execute phase with phase-specific seed
  const phaseSeed = getPhaseSeed(options.seed, phaseName);
  const rng = new SeededRandom(phaseSeed);
  
  // Run phase
  phaseFunction(rng, options);
  
  // Cache result for potential future skips
  cachePhase(phaseName, state.data);
}
```

### 6.7 Internal Invariants

Maintain these invariants throughout partial generation:

1. **Seed Consistency**: Same `mainSeed + phaseName` always produces same RNG sequence.
2. **Cache Validity**: Cached data must match the structure expected by dependent phases.
3. **Dependency Order**: Phases always execute in dependency order (topological sort).
4. **State Merging**: Partial data merges cleanly with existing state without overwriting unrelated fields.
5. **Fallback Safety**: Fallbacks never crash; they may produce incomplete data but generation continues.

### 6.8 Other Guidelines

- Separate concerns: Generation logic fully independent from rendering/UI.
- Use Web Workers if possible for long generations (future-proof).
- Hardware-aware clamping: Implement in JS (navigator.hardwareConcurrency, etc.).
- Preserve seed reproducibility.
- Test against original: Generate same seed/params → compare SVG/JSON output.

## 7. Implementation Phases

### ✅ Phase 1: Setup & Initial Fork
- Fork repo, add structure, bundle original as-is for baseline.

### ✅ Phase 2: Modularization
- Extract core generation to src/core/.
- Make options configurable without DOM.

### 🔄 Phase 2.5: Partial Generation (IN PROGRESS)
- Wrap phases in generator.js with skip checks + caching/fallbacks.
- Implement `PHASES` constant and dependency graph.
- Add `efficientDeepCopyOfRelevantData` and caching helpers in `partials.js`.
- Implement `getPhaseSeed` for RNG consistency.
- Add `validatePhaseDependencies` and `executePhaseWithWrapper` pattern.
- Add `generatePartial` export.
- Test: Full fidelity for skipped runs; perf gains (e.g., 50% faster for politics-only).
- Test: Compare full vs. partial outputs for same seed/params (visual + data diff).
- Integrate: Update WorldBuilder.js IPC for skipPhases.

### 🔄 Phase 3: Rendering Control
- Allow passing canvas for previews.
- Optional headless (skip rendering, output data only).

### 📋 Phase 4: Integration Testing
- Build dist/ bundle.
- Copy to main project ui_web/js/.
- Test in world_builder.html with Alpine.js wizard.

### 📋 Future
- Merge upstream changes periodically.
- Add custom Genesis Mythos extensions (e.g., tie to fantasy_archetypes.json).

## 8. Maintenance & Sync

- Monthly: Merge upstream master → resolve conflicts.
- Commit messages: `feat/azgaar-fork:`, `fix:`, `refactor:`, `chore:sync-upstream`
- Document differences in README.

**THESE RULES ARE CURRENT AND AUTHORITATIVE AS OF 2026-01-12. MAJOR CHANGES REQUIRE EXPLICIT APPROVAL.**

**UPDATE 2025-12-28:** Option 4 adopted – full fork to modular library. Focus on clean API for WebView embedding.

---

**Iteration 2: Partial generation support added for surgical workflows.**
