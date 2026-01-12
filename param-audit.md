# Parameter Audit Report: User-Exposable Options

**Date**: 2026-01-12  
**Purpose**: Audit user-exposable parameters in the options object, their dependencies, inter-dependencies, and suggestions for further modularization/splitting into independent params.  
**Scope**: Focus on ~10-15 main user-facing parameters with UI value, omitting purely internal ones.

---

## 1. Introduction

This audit examines the user-exposable parameters in the Azgaar Genesis fork's options object (`src/options.js`). The goal is to:

1. Document what each parameter controls
2. Identify direct dependencies (upstream phases/params it relies on)
3. Identify inter-dependencies (how it affects/affects other params)
4. Suggest modularization opportunities to reduce coupling and improve partial generation support

The audit is structured by parameter category: **Foundational**, **Terrain/Climate**, and **Politics/Cultural**. Each parameter includes:
- **Description**: What it controls
- **Type/Default**: Data type and default value
- **Exposure Rationale**: Why it's user-facing
- **Direct Dependencies**: Upstream phases/params it relies on
- **Inter-Dependencies**: How it affects/affects other params
- **Modularization Suggestions**: Ways to split deps/inter-deps into more independent params

---

## 2. Parameter List

### 2.1 Foundational Parameters

#### `seed`
- **Description**: RNG seed for deterministic generation. If `null`, auto-generated from timestamp.
- **Type/Default**: `string | number | null` (default: `null`)
- **Exposure Rationale**: Primary control for reproducibility. Users need to set this to regenerate identical maps or share seeds.
- **Direct Dependencies**: None (foundational - affects all phases via phase-specific seeds)
- **Inter-Dependencies**: 
  - Affects ALL phases through `getPhaseSeed(seed, phaseName)` mechanism
  - Changing seed invalidates cache (structural option change)
  - Phase-specific seeds ensure partial regeneration consistency within same run
- **Modularization Suggestions**:
  - **Split into phase-specific seeds**: Allow `seed: { voronoi: 'seed1', heightmap: 'seed2', cultures: 'seed3', ... }` for fine-grained control
  - **Add seed groups**: `seed: { terrain: 'seed1', politics: 'seed2' }` to regenerate only terrain or only politics with different seeds
  - **Current limitation**: Single seed affects everything, making it hard to regenerate just politics with same terrain

#### `mapWidth` / `mapHeight`
- **Description**: Canvas/viewport dimensions in pixels. Controls the size of the generated map.
- **Type/Default**: `number` (default: `960` / `540`)
- **Exposure Rationale**: Essential for controlling output size. Users need to match their display/export requirements.
- **Direct Dependencies**: 
  - Phase 1 (VORONOI): Used to determine Voronoi cell distribution
  - Phase 4 (MAP_COORDINATES): Used for coordinate system calculation
  - Phase 7 (PACK_CREATION): Used for pack polygon generation
- **Inter-Dependencies**:
  - Affects cell density indirectly (larger maps with same `points` = sparser cells)
  - Changes invalidate cache (structural option)
  - Used in heightmap masking (`maskHeights()`)
  - Used in temperature/precipitation calculations via map coordinates
- **Modularization Suggestions**:
  - **Separate rendering dimensions**: Add `renderWidth`/`renderHeight` separate from generation dimensions
  - **Aspect ratio lock**: Add `aspectRatio: 'auto' | number` to maintain proportions
  - **Current limitation**: Same dimensions used for generation and rendering, making it hard to generate at one size and render at another

#### `points` / `cellsDesired`
- **Description**: Cell density control. `points` (1-13) maps to `cellsDesired` (1K-100K cells) via `CELLS_DENSITY_MAP`.
- **Type/Default**: `number` (default: `4` → 10,000 cells)
- **Exposure Rationale**: Primary performance/quality tradeoff. Users need to balance detail vs. generation time.
- **Direct Dependencies**:
  - Phase 1 (VORONOI): Directly controls number of Voronoi cells generated
  - Phase 7 (PACK_CREATION): Pack cell count derived from grid
- **Inter-Dependencies**:
  - Affects blob/line power in heightmap templates (larger cell counts = higher power values)
  - Changes invalidate cache (structural option)
  - Affects precipitation modifier: `cellsNumberModifier = (cellsDesired / 10000) ** 0.25`
  - Higher cell counts = more detailed but slower generation
- **Modularization Suggestions**:
  - **Expose cellsDesired directly**: Allow users to set exact cell count instead of slider (1-13)
  - **Separate terrain/politics density**: `cellsDesired: { terrain: 10000, politics: 5000 }` for different detail levels
  - **Auto-scale based on map size**: `cellsDesired: 'auto'` that scales with `mapWidth * mapHeight`
  - **Current limitation**: Single density affects all phases, making it hard to have detailed terrain but sparse politics

---

### 2.2 Terrain/Climate Parameters

#### `template`
- **Description**: Heightmap template ID (e.g., 'continent', 'archipelago', 'pangea', 'shattered'). If `null`, uses random template.
- **Type/Default**: `string | null` (default: `null`)
- **Exposure Rationale**: Primary control for world shape/style. Users need to choose continent style vs. island chains vs. supercontinent.
- **Direct Dependencies**:
  - Phase 2 (HEIGHTMAP): Used in `generateHeightmap()` to select template operations
  - Phase 10.25 (CLUSTER_MERGE): Template-aware merging (cohesion vs. fragmented styles)
- **Inter-Dependencies**:
  - Affects `mapSize`/`longitude` auto-calculation (if `null`, calculated from template)
  - Affects cluster merging strategy (cohesion templates = aggressive merging, fragmented = minimal)
  - Changes invalidate cache (structural option)
  - Template string contains operations (Hill, Pit, Range, etc.) that affect final landmass distribution
- **Modularization Suggestions**:
  - **Split template into sub-params**: 
    - `heightmapStyle: 'continent' | 'archipelago' | ...` (shape)
    - `heightmapCohesion: number` (0-1, controls cluster merging aggressiveness)
    - `heightmapOperations: string[]` (custom operation sequence)
  - **Separate template from cohesion**: Allow `template: 'continent'` with `clusterMergeStyle: 'fragmented'` override
  - **Template presets**: `template: { style: 'continent', cohesion: 0.8, operations: [...] }` for fine-grained control
  - **Current limitation**: Template is monolithic - can't have continent shape with archipelago-style fragmentation

#### `landPercentage`
- **Description**: Target percentage of map that should be land (default 40% for continent template).
- **Type/Default**: `number` (default: `40`)
- **Exposure Rationale**: Controls landmass size. Users need to create water-worlds vs. supercontinents.
- **Direct Dependencies**:
  - Phase 2 (HEIGHTMAP): Used in post-template adjustment to enforce land percentage
  - Phase 7 (PACK_CREATION): Used in post-pack land adjustment (lines 366-432 in generator.js)
- **Inter-Dependencies**:
  - Interacts with `template` (templates have native land percentages that may conflict)
  - Interacts with `enforceLandPercentage` option (if `false`, template-native land % is preserved)
  - Post-pack adjustment multiplies non-ocean heights by reduction multiplier (0.5-0.7)
  - If still too high, reduces lowest land cells to below threshold (20)
- **Modularization Suggestions**:
  - **Separate grid vs. pack land percentage**: `landPercentage: { grid: 40, pack: 35 }` for different targets
  - **Add land adjustment method**: `landAdjustment: 'aggressive' | 'conservative' | 'none'` to control post-processing
  - **Template-aware defaults**: Auto-set `landPercentage` based on template (e.g., archipelago = 20%, continent = 40%)
  - **Current limitation**: Single target affects both grid and pack, making it hard to have different land % at different stages

#### `heightExponent`
- **Description**: Exponent for altitude-based temperature drop calculation. Higher = steeper temperature gradients with elevation.
- **Type/Default**: `number` (default: `1.8`)
- **Exposure Rationale**: Controls how elevation affects climate. Users need to simulate realistic vs. fantasy mountain climates.
- **Direct Dependencies**:
  - Phase 5 (TEMPERATURES): Used in `getAltitudeTemperatureDrop(height, heightExponent)`
- **Inter-Dependencies**:
  - Affects biome assignment indirectly (temperature affects biome selection)
  - Higher exponent = colder mountains = more alpine/tundra biomes
  - Lower exponent = warmer mountains = more temperate biomes at elevation
- **Modularization Suggestions**:
  - **Split into elevation bands**: `heightExponent: { low: 1.5, mid: 1.8, high: 2.2 }` for different gradients at different elevations
  - **Add temperature drop rate**: `temperatureDropPerKm: number` (default: 6.5) separate from exponent
  - **Current limitation**: Single exponent affects all elevations uniformly

#### `temperatureEquator` / `temperatureNorthPole` / `temperatureSouthPole`
- **Description**: Temperature at equator, north pole, and south pole in Celsius. Controls global temperature gradient.
- **Type/Default**: `number` (default: `27` / `-30` / `-15`)
- **Exposure Rationale**: Primary climate control. Users need to create ice worlds vs. tropical worlds vs. realistic Earth-like climates.
- **Direct Dependencies**:
  - Phase 5 (TEMPERATURES): Used to calculate latitude-based temperature gradients
- **Inter-Dependencies**:
  - Affects biome assignment (temperature is key input to biome matrix)
  - Affects culture generation (cultures prefer certain temperature ranges)
  - Affects burg placement (burgs prefer temperate climates)
  - Temperature gradient affects precipitation patterns (via biome moisture calculations)
- **Modularization Suggestions**:
  - **Split into temperature profile**: `temperature: { equator: 27, northPole: -30, southPole: -15, gradient: 'linear' | 'curved' }`
  - **Add seasonal variation**: `temperature: { ...base, seasonalVariation: 5 }` for summer/winter differences
  - **Separate land vs. ocean temps**: `temperature: { land: {...}, ocean: {...} }` for different gradients
  - **Current limitation**: Single gradient affects all latitudes uniformly, no seasonal variation

#### `prec` (precipitation)
- **Description**: Global precipitation percentage modifier (0-500). Higher = wetter world overall.
- **Type/Default**: `number` (default: `100`)
- **Exposure Rationale**: Controls global wetness. Users need to create deserts vs. rainforests vs. balanced worlds.
- **Direct Dependencies**:
  - Phase 6 (PRECIPITATION): Used in `precInputModifier = (options.prec || 100) / 100`
  - Combined with `cellsNumberModifier` to create final precipitation modifier
- **Inter-Dependencies**:
  - Affects biome assignment (moisture is key input to biome matrix)
  - Affects river generation (more precipitation = more rivers)
  - Affects culture generation (cultures prefer certain moisture ranges)
  - Interacts with `winds` array (wind patterns affect precipitation distribution)
- **Modularization Suggestions**:
  - **Split into regional precipitation**: `prec: { global: 100, equator: 150, poles: 50 }` for different zones
  - **Separate base vs. wind-driven**: `prec: { base: 100, windMultiplier: 1.0 }` to control wind influence
  - **Add precipitation seasonality**: `prec: { ...base, seasonalVariation: 20 }` for wet/dry seasons
  - **Current limitation**: Single global modifier affects all cells uniformly, no regional variation

#### `winds`
- **Description**: Array of 6 wind directions in degrees (0-360) for different latitude bands.
- **Type/Default**: `number[]` (default: `[225, 45, 225, 315, 135, 315]`)
- **Exposure Rationale**: Controls precipitation patterns via wind-driven moisture transport. Users need to create realistic vs. fantasy wind patterns.
- **Direct Dependencies**:
  - Phase 6 (PRECIPITATION): Used in `generatePrecipitation()` to determine wind-driven moisture flow
- **Inter-Dependencies**:
  - Affects precipitation distribution (winds carry moisture from oceans to land)
  - Affects biome assignment indirectly (precipitation affects moisture, which affects biomes)
  - Interacts with `prec` (wind patterns amplify or reduce base precipitation)
- **Modularization Suggestions**:
  - **Split into wind zones**: `winds: { equator: 225, midNorth: 45, ... }` with named zones instead of array indices
  - **Add wind strength**: `winds: [{ direction: 225, strength: 1.0 }, ...]` to control moisture transport intensity
  - **Auto-generate from latitude**: `winds: 'auto'` that generates realistic wind patterns based on `latitude` option
  - **Current limitation**: Array indices are cryptic (which index = which latitude band?), no strength control

#### `latitude` / `longitude` / `mapSize`
- **Description**: Map's geographic position and size. `latitude` (0-100) controls north/south position, `longitude` (0-100 or null) controls east/west, `mapSize` (1-100 or null) controls world size percentage.
- **Type/Default**: `number | null` (default: `50` / `null` / `null`)
- **Exposure Rationale**: Controls where the map sits on a global sphere. Users need to create polar vs. equatorial vs. mid-latitude worlds.
- **Direct Dependencies**:
  - Phase 4 (MAP_COORDINATES): Used to calculate map coordinate system
  - Phase 5 (TEMPERATURES): Latitude affects temperature gradients
  - Phase 6 (PRECIPITATION): Latitude affects precipitation patterns (via latitude modifiers)
- **Inter-Dependencies**:
  - Affects temperature distribution (polar = colder, equatorial = warmer)
  - Affects precipitation patterns (latitude bands have different precipitation modifiers)
  - Auto-calculated from `template` if `null`
  - `mapSize` affects how much of the world sphere the map represents
- **Modularization Suggestions**:
  - **Combine into single object**: `mapPosition: { latitude: 50, longitude: null, size: null }` for clarity
  - **Add hemisphere control**: `mapPosition: { ...base, hemisphere: 'north' | 'south' | 'both' }`
  - **Template-aware defaults**: Auto-set based on template (e.g., archipelago = equatorial, continent = mid-latitude)
  - **Current limitation**: Three separate params that are conceptually related but not grouped

---

### 2.3 Politics/Cultural Parameters

#### `statesNumber`
- **Description**: Number of political states to generate (0-100). Controls political fragmentation.
- **Type/Default**: `number` (default: `18`)
- **Exposure Rationale**: Primary control for political complexity. Users need to create empires vs. city-states vs. stateless worlds.
- **Direct Dependencies**:
  - Phase 13 (STATES): Used in `generateStates()` to determine target state count
- **Inter-Dependencies**:
  - Requires Phase 12 (BURGS): States are generated from burgs (settlements)
  - Requires Phase 11 (CULTURES): States are influenced by culture distribution
  - Requires Phase 10.5 (RANK_CELLS): States use cell suitability scores
  - Higher state count = smaller states = more borders = more provinces needed
  - Affects province generation (provinces are subdivisions of states)
- **Modularization Suggestions**:
  - **Split into state generation method**: `statesNumber: { target: 18, method: 'auto' | 'manual' | 'fromBurgs' }`
  - **Add state size control**: `statesNumber: { count: 18, minSize: 10, maxSize: 1000 }` to control state size distribution
  - **Separate state count from province count**: Currently `provincesRatio` is separate but tightly coupled
  - **Current limitation**: Single number doesn't control state size distribution or generation method

#### `cultures` / `culturesSet`
- **Description**: Number of cultures (1-100) and culture set ('world', 'european', 'oriental', etc.). Controls cultural diversity.
- **Type/Default**: `number` / `string` (default: `12` / `'world'`)
- **Exposure Rationale**: Primary control for cultural diversity. Users need to create mono-cultural vs. multi-cultural worlds.
- **Direct Dependencies**:
  - Phase 11 (CULTURES): Used in `generateCultures()` and `expandCultures()`
- **Inter-Dependencies**:
  - Requires Phase 10.5 (RANK_CELLS): Cultures use cell suitability scores
  - Requires Phase 9 (BIOMES): Cultures prefer certain biomes
  - Affects state generation (states are influenced by culture distribution)
  - Affects burg generation (burgs have culture assignments)
  - Affects religion generation (religions are influenced by cultures)
  - `culturesSet` determines available culture names/styles
- **Modularization Suggestions**:
  - **Combine into single object**: `cultures: { count: 12, set: 'world', distribution: 'uniform' | 'clustered' }`
  - **Add culture expansion control**: `cultures: { ...base, expansionRate: 1.0 }` to control how cultures spread
  - **Separate culture count from set**: Allow `cultures: { count: 12, sets: ['european', 'oriental'] }` for mixed sets
  - **Current limitation**: Two separate params that are conceptually related but not grouped

#### `religionsNumber`
- **Description**: Number of religions to generate (0-50). If 0, religions are disabled.
- **Type/Default**: `number` (default: `6`)
- **Exposure Rationale**: Controls religious diversity. Users need to create mono-religious vs. multi-religious vs. secular worlds.
- **Direct Dependencies**:
  - Phase 15 (RELIGIONS): Used in `generateReligions()` (only runs if `religionsNumber > 0`)
- **Inter-Dependencies**:
  - Requires Phase 13 (STATES): Religions are generated from states
  - Requires Phase 11 (CULTURES): Religions are influenced by culture distribution
  - Affects state/culture emblems (religions may influence emblem generation)
  - If 0, generates single "No religion" entry
- **Modularization Suggestions**:
  - **Add religion generation method**: `religionsNumber: { count: 6, method: 'fromStates' | 'fromCultures' | 'independent' }`
  - **Separate religion count from state count**: Currently religions are derived from states, but could be independent
  - **Add religion spread control**: `religionsNumber: { ...base, spreadRate: 1.0 }` to control how religions expand
  - **Current limitation**: Single number, tightly coupled to states (religions generated from states)

#### `provincesRatio`
- **Description**: Ratio of provinces to states (0-100). Controls administrative subdivision level.
- **Type/Default**: `number` (default: `20`)
- **Exposure Rationale**: Controls administrative complexity. Users need to create simple vs. complex administrative structures.
- **Direct Dependencies**:
  - Phase 14 (PROVINCES): Used in `generateProvinces()` to determine province count
- **Inter-Dependencies**:
  - Requires Phase 13 (STATES): Provinces are subdivisions of states
  - Tightly coupled to `statesNumber` (more states = more provinces if ratio is same)
  - Affects state borders (provinces create internal borders)
- **Modularization Suggestions**:
  - **Combine with statesNumber**: `politics: { states: 18, provincesPerState: 2.0 }` for clarity
  - **Add province generation method**: `provincesRatio: { ratio: 20, method: 'uniform' | 'byStateSize' }`
  - **Separate province count from ratio**: Allow `provinces: { count: 36, distribution: 'uniform' }` instead of ratio
  - **Current limitation**: Ratio is abstract (what does 20 mean?), tightly coupled to states

#### `manors`
- **Description**: Number of manors (administrative units) to generate. 1000 = "auto" (calculated from other params).
- **Type/Default**: `number` (default: `1000` = "auto")
- **Exposure Rationale**: Controls fine-grained administrative detail. Users need to create detailed vs. simplified administrative structures.
- **Direct Dependencies**:
  - Phase 14 (PROVINCES): Used in province generation (if manors are used)
- **Inter-Dependencies**:
  - Requires Phase 13 (STATES): Manors are subdivisions of provinces/states
  - Affects administrative complexity (more manors = more detail)
  - Auto-calculated from states/provinces if 1000
- **Modularization Suggestions**:
  - **Combine with provinces**: `politics: { ...base, manors: 'auto' | number }` in single object
  - **Add manor generation method**: `manors: { count: 1000, method: 'auto' | 'manual' | 'fromBurgs' }`
  - **Current limitation**: Single number, auto-calculation is opaque (how is it calculated?)

---

### 2.4 Population/Economy Parameters

#### `populationRate` / `urbanization` / `urbanDensity`
- **Description**: Population control params. `populationRate` = people per population point, `urbanization` = burgs population relative to all population, `urbanDensity` = average population per building.
- **Type/Default**: `number` (default: `1000` / `1` / `10`)
- **Exposure Rationale**: Controls population scale and distribution. Users need to create sparsely vs. densely populated worlds.
- **Direct Dependencies**:
  - Phase 12 (BURGS): Used in burg generation to calculate population
- **Inter-Dependencies**:
  - Requires Phase 11 (CULTURES): Burgs have culture assignments
  - Requires Phase 10.5 (RANK_CELLS): Burgs use cell suitability scores
  - Affects state generation (states are influenced by burg population)
  - Higher population = more burgs = more states needed
- **Modularization Suggestions**:
  - **Combine into single object**: `population: { rate: 1000, urbanization: 1, density: 10 }` for clarity
  - **Add population distribution**: `population: { ...base, distribution: 'uniform' | 'clustered' | 'rural' }`
  - **Separate rural vs. urban**: `population: { rural: {...}, urban: {...} }` for different scales
  - **Current limitation**: Three separate params that are conceptually related but not grouped

#### `growthRate` / `sizeVariety`
- **Description**: State growth control. `growthRate` = state expansion rate, `sizeVariety` = size distribution factor.
- **Type/Default**: `number` (default: `1.5` / `4`)
- **Exposure Rationale**: Controls how states expand and vary in size. Users need to create uniform vs. varied state sizes.
- **Direct Dependencies**:
  - Phase 13 (STATES): Used in state generation to control expansion
- **Inter-Dependencies**:
  - Requires Phase 12 (BURGS): States expand from burgs
  - Requires Phase 11 (CULTURES): States are influenced by cultures
  - Affects state size distribution (higher variety = more size variation)
- **Modularization Suggestions**:
  - **Combine with statesNumber**: `politics: { ...base, growth: { rate: 1.5, variety: 4 } }` in single object
  - **Add growth method**: `growthRate: { rate: 1.5, method: 'exponential' | 'linear' | 'logistic' }`
  - **Current limitation**: Two separate params that are conceptually related but not grouped

---

## 3. Overall Insights

### 3.1 Common Dependency Patterns

1. **Cascade Dependencies**: Most political/cultural params depend on terrain/climate phases:
   - States → Burgs → Cultures → Rank Cells → Biomes → Temperatures/Precipitation → Heightmap → Voronoi
   - This creates a strict dependency chain that prevents independent regeneration

2. **Structural Options**: Several params invalidate cache when changed:
   - `seed`, `mapWidth`, `mapHeight`, `points`, `template`
   - These are "foundational" and affect all subsequent phases

3. **Climate Inter-Dependencies**: Temperature, precipitation, and biomes form a tight feedback loop:
   - Temperature affects biomes
   - Precipitation affects biomes
   - Biomes affect moisture calculations
   - This makes it hard to regenerate just one climate component

4. **Political Inter-Dependencies**: States, provinces, cultures, religions, and burgs are tightly coupled:
   - States depend on burgs and cultures
   - Provinces depend on states
   - Religions depend on states and cultures
   - This makes it hard to regenerate just one political component

### 3.2 Tightest Couplings

1. **Template ↔ Land Percentage**: Templates have native land percentages that conflict with `landPercentage` option
2. **Temperature ↔ Precipitation ↔ Biomes**: Three-way feedback loop makes independent regeneration difficult
3. **States ↔ Burgs ↔ Cultures**: Political entities are generated in strict order with strong dependencies
4. **Seed ↔ All Phases**: Single seed affects everything, making partial regeneration with different seeds difficult

### 3.3 High-Level Modularization Opportunities

1. **Phase Groups**: Group phases into logical units:
   - `terrain: ['voronoi', 'heightmap', 'temperatures', 'precipitation', 'biomes', 'rivers']`
   - `politics: ['cultures', 'burgs', 'states', 'provinces', 'religions']`
   - Allow `skipPhases: ['politics']` as shorthand

2. **Parameter Groups**: Group related params into objects:
   - `temperature: { equator, northPole, southPole, ... }`
   - `politics: { states, provinces, cultures, religions, ... }`
   - `population: { rate, urbanization, density, ... }`

3. **Independent Climate Components**: Split temperature/precipitation/biomes into independent params:
   - `temperature: { ...base, independent: true }` to regenerate without affecting biomes
   - `precipitation: { ...base, independent: true }` to regenerate without affecting biomes
   - `biomes: { ...base, independent: true }` to regenerate without affecting temperature/precipitation

4. **Template Decomposition**: Split template into sub-components:
   - `heightmapStyle`: Shape (continent, archipelago, etc.)
   - `heightmapCohesion`: Cluster merging aggressiveness
   - `heightmapOperations`: Custom operation sequence

5. **Seed Groups**: Allow phase-specific or group-specific seeds:
   - `seed: { terrain: 'seed1', politics: 'seed2' }`
   - This would enable regenerating just politics with a different seed while keeping terrain

---

## 4. Recommendations

### 4.1 Priority 1: Parameter Grouping (High Impact, Low Effort)

**Recommendation**: Group related params into objects for clarity and easier partial updates.

**Examples**:
```javascript
// Instead of:
{
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
}

// Use:
{
  temperature: {
    equator: 27,
    northPole: -30,
    southPole: -15,
    gradient: 'linear',
  }
}
```

**Benefits**:
- Clearer API (related params grouped together)
- Easier to update entire groups (e.g., `loadOptions({ temperature: {...} })`)
- Easier to validate (validate entire group at once)
- Easier to document (grouped documentation)

**Effort**: 2-3 days (update options.js, validation, documentation)

### 4.2 Priority 2: Template Decomposition (High Impact, Medium Effort)

**Recommendation**: Split `template` into `heightmapStyle`, `heightmapCohesion`, and `heightmapOperations`.

**Examples**:
```javascript
// Instead of:
{
  template: 'continent',
}

// Use:
{
  heightmap: {
    style: 'continent',        // Shape (continent, archipelago, etc.)
    cohesion: 0.8,              // Cluster merging (0-1)
    operations: null,            // Custom operations (optional)
  }
}
```

**Benefits**:
- Independent control of shape vs. cohesion
- Can mix styles (e.g., continent shape with archipelago fragmentation)
- Easier to create custom templates
- Better partial generation support (can regenerate just cohesion without regenerating shape)

**Effort**: 1 week (update heightmap generation, template system, validation)

### 4.3 Priority 3: Seed Groups (Medium Impact, Medium Effort)

**Recommendation**: Allow phase-specific or group-specific seeds for independent regeneration.

**Examples**:
```javascript
// Instead of:
{
  seed: 'abc123',
}

// Use:
{
  seed: {
    terrain: 'abc123',
    politics: 'def456',
    // Or use single seed for all:
    // seed: 'abc123' (backward compatible)
  }
}
```

**Benefits**:
- Can regenerate just politics with different seed while keeping terrain
- Better partial generation support
- More control over reproducibility

**Effort**: 1 week (update RNG system, phase seed generation, validation)

### 4.4 Priority 4: Independent Climate Components (Medium Impact, High Effort)

**Recommendation**: Add flags to allow independent regeneration of temperature/precipitation/biomes.

**Examples**:
```javascript
{
  climate: {
    temperature: { ...base, independent: true },
    precipitation: { ...base, independent: true },
    biomes: { ...base, independent: false },  // Still depends on temp/prec
  }
}
```

**Benefits**:
- Can regenerate just temperature without affecting biomes
- Can regenerate just precipitation without affecting biomes
- Better partial generation support
- More flexible climate control

**Effort**: 2 weeks (refactor biome assignment, add independence flags, update dependencies)

### 4.5 Priority 5: Phase Groups (Low Impact, Low Effort)

**Recommendation**: Add phase groups as shorthand for `skipPhases`.

**Examples**:
```javascript
// Instead of:
{
  skipPhases: ['cultures', 'burgs', 'states', 'provinces', 'religions'],
}

// Use:
{
  skipPhases: ['politics'],  // Shorthand for all political phases
}
```

**Benefits**:
- Easier to skip entire groups
- Clearer intent (skip politics vs. skip individual phases)
- Better UX for common use cases

**Effort**: 1 day (add phase group constants, update skipPhases validation)

---

## 5. Implementation Considerations

### 5.1 Backward Compatibility

All recommendations should maintain backward compatibility:
- Old params should still work (deprecated but functional)
- New grouped params should be optional (fall back to old params if not provided)
- Migration path: Auto-convert old params to new grouped params

### 5.2 Validation

Grouped params require new validation:
- Validate entire groups at once
- Provide clear error messages for invalid groups
- Support partial groups (e.g., `temperature: { equator: 27 }` with defaults for others)

### 5.3 Documentation

Grouped params require updated documentation:
- Document new grouped structure
- Provide migration guide from old to new params
- Show examples of both old and new styles

### 5.4 Testing

Grouped params require comprehensive testing:
- Test backward compatibility (old params still work)
- Test new grouped params
- Test partial groups (some params provided, others defaulted)
- Test validation (invalid groups rejected)

---

## 6. Conclusion

The current parameter structure is functional but has several opportunities for improvement:

1. **Parameter Grouping**: Related params should be grouped into objects for clarity and easier partial updates.
2. **Template Decomposition**: Template should be split into style, cohesion, and operations for independent control.
3. **Seed Groups**: Phase-specific or group-specific seeds would enable better partial generation support.
4. **Independent Climate Components**: Flags to allow independent regeneration of temperature/precipitation/biomes.
5. **Phase Groups**: Shorthand for skipping entire phase groups.

**Priority Order**:
1. Parameter Grouping (high impact, low effort)
2. Template Decomposition (high impact, medium effort)
3. Seed Groups (medium impact, medium effort)
4. Independent Climate Components (medium impact, high effort)
5. Phase Groups (low impact, low effort)

**Estimated Total Effort**: 4-5 weeks for all recommendations, or 1-2 weeks for priorities 1-2 only.

---

**Report Generated**: 2026-01-12  
**Files Analyzed**:
- `azgaar-genesis-fork/src/options.js` (313 lines)
- `azgaar-genesis-fork/src/generator.js` (1,545 lines)
- `azgaar-genesis-fork/src/partials.js` (959 lines)
- `azgaar-genesis-fork/src/core/heightmap.js` (376 lines)
- `azgaar-genesis-fork/src/core/temperature.js` (104 lines)
- `azgaar-genesis-fork/src/core/flux.js` (211 lines)
- `azgaar-genesis-fork/src/core/biomes.js` (196 lines)
- `docs/azgaar_fork_feasibility.md` (912 lines)
- `azgaar-genesis-fork/potential-blocks.md` (352 lines)
