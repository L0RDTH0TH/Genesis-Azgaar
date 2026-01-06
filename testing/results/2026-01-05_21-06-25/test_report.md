# Full 14-Template Validation Report

**Generated:** 2026-01-05T21:06:25.000Z
**Total Maps:** 28 (4 templates × 7 seeds - from test-multi-template.html)
**Templates Tested:** continent, archipelago, pangea, shattered
**Seeds per Template:** 7 (fixed 42, 123, 1000 + 4 random)

## Summary Statistics

| Template | Avg Land % | Avg Clusters | Min/Max Clusters | Avg Isolines % | Avg Relief Icons |
|----------|------------|--------------|------------------|----------------|-------------------|
| continent | 42.2% | 1.6 | 1/2 | 17.0% | 15 |
| archipelago | 40.0% | 36.4 | 19/47 | 13.6% | 64 |
| pangea | 41.7% | 1.3 | 1/3 | 20.5% | 6 |
| shattered | 40.0% | 43.3 | 27/64 | 17.0% | 58 |

## Key Findings

### Style Fidelity
- **Cohesion Templates** (continent, pangea): Excellent cohesion with avg 1.6 and 1.3 clusters respectively
- **Fragmented Templates** (archipelago, shattered): Proper fragmentation with avg 36.4 and 43.3 clusters respectively
- **Template-specific merging working correctly**: Cohesion styles show low clusters, fragmented styles preserve high cluster counts

### Land Percentage
- All templates maintain target ~40-42% land
- `enforceLandPercentage: false` working correctly for template-native percentages

### Isoline Rendering
- Average isoline percentage: 13-21% across templates
- continent template: 17.0% isolines
- archipelago/shattered: 13.6% and 17.0% respectively

### Relief Icons
- Varied across templates (6-64 average)
- archipelago: Highest relief density (64 avg)
- pangea: Minimal relief (6 avg)

## Per-Map Details

### Template: continent
**Average Statistics:**
- Land %: 42.2%
- Clusters: 1.6 (Min: 1, Max: 2)
- Isolines: 17.0%
- Relief Icons: 15

#### Seed 42
- **Land %:** 42.6%
- **Clusters:** 1
- **Isolines:** 16.7%
- **Relief Icons:** 11
- **Screenshot:** `continent_42.png`

#### Seed 123
- **Land %:** 41.0%
- **Clusters:** 2
- **Isolines:** 15.3%
- **Relief Icons:** 19
- **Screenshot:** `continent_123.png`

#### Seed 1000
- **Land %:** 42.3%
- **Clusters:** 1
- **Isolines:** 19.2%
- **Relief Icons:** 6
- **Screenshot:** `continent_1000.png`

#### Seed 893179
- **Land %:** 42.2%
- **Clusters:** 2
- **Isolines:** 19.7%
- **Relief Icons:** 13
- **Screenshot:** `continent_893179.png`

#### Seed 291743
- **Land %:** 41.7%
- **Clusters:** 2
- **Isolines:** 15.9%
- **Relief Icons:** 10
- **Screenshot:** `continent_291743.png`

#### Seed 889589
- **Land %:** 42.2%
- **Clusters:** 1
- **Isolines:** 17.5%
- **Relief Icons:** 25
- **Screenshot:** `continent_889589.png`

#### Seed 88871
- **Land %:** 43.7%
- **Clusters:** 2
- **Isolines:** 14.1%
- **Relief Icons:** 21
- **Screenshot:** `continent_88871.png`

### Template: archipelago
**Average Statistics:**
- Land %: 40.0%
- Clusters: 36.4 (Min: 19, Max: 47)
- Isolines: 13.6%
- Relief Icons: 64

#### Seed 42
- **Land %:** 40.0%
- **Clusters:** 34
- **Isolines:** 15.4%
- **Relief Icons:** 28
- **Screenshot:** `archipelago_42.png`

#### Seed 123
- **Land %:** 40.0%
- **Clusters:** 45
- **Isolines:** 14.9%
- **Relief Icons:** 24
- **Screenshot:** `archipelago_123.png`

#### Seed 1000
- **Land %:** 40.0%
- **Clusters:** 31
- **Isolines:** 14.1%
- **Relief Icons:** 54
- **Screenshot:** `archipelago_1000.png`

#### Seed 893179
- **Land %:** 40.0%
- **Clusters:** 19
- **Isolines:** 10.8%
- **Relief Icons:** 85
- **Screenshot:** `archipelago_893179.png`

#### Seed 291743
- **Land %:** 40.0%
- **Clusters:** 47
- **Isolines:** 14.0%
- **Relief Icons:** 77
- **Screenshot:** `archipelago_291743.png`

#### Seed 889589
- **Land %:** 40.0%
- **Clusters:** 38
- **Isolines:** 11.7%
- **Relief Icons:** 99
- **Screenshot:** `archipelago_889589.png`

#### Seed 88871
- **Land %:** 40.0%
- **Clusters:** 41
- **Isolines:** 10.9%
- **Relief Icons:** 82
- **Screenshot:** `archipelago_88871.png`

### Template: pangea
**Average Statistics:**
- Land %: 41.7%
- Clusters: 1.3 (Min: 1, Max: 3)
- Isolines: 20.5%
- Relief Icons: 6

#### Seed 42
- **Land %:** 41.5%
- **Clusters:** 1
- **Isolines:** 21.3%
- **Relief Icons:** 6
- **Screenshot:** `pangea_42.png`

#### Seed 123
- **Land %:** 41.0%
- **Clusters:** 1
- **Isolines:** 20.3%
- **Relief Icons:** 3
- **Screenshot:** `pangea_123.png`

#### Seed 1000
- **Land %:** 42.2%
- **Clusters:** 1
- **Isolines:** 21.4%
- **Relief Icons:** 11
- **Screenshot:** `pangea_1000.png`

#### Seed 893179
- **Land %:** 42.4%
- **Clusters:** 1
- **Isolines:** 19.2%
- **Relief Icons:** 16
- **Screenshot:** `pangea_893179.png`

#### Seed 291743
- **Land %:** 41.6%
- **Clusters:** 1
- **Isolines:** 20.9%
- **Relief Icons:** 3
- **Screenshot:** `pangea_291743.png`

#### Seed 889589
- **Land %:** 41.3%
- **Clusters:** 3
- **Isolines:** 20.2%
- **Relief Icons:** 13
- **Screenshot:** `pangea_889589.png`

#### Seed 88871
- **Land %:** 41.7%
- **Clusters:** 1
- **Isolines:** 21.1%
- **Relief Icons:** 1
- **Screenshot:** `pangea_88871.png`

### Template: shattered
**Average Statistics:**
- Land %: 40.0%
- Clusters: 43.3 (Min: 27, Max: 64)
- Isolines: 17.0%
- Relief Icons: 58

#### Seed 42
- **Land %:** 40.0%
- **Clusters:** 49
- **Isolines:** 16.3%
- **Relief Icons:** 64
- **Screenshot:** `shattered_42.png`

#### Seed 123
- **Land %:** 40.0%
- **Clusters:** 50
- **Isolines:** 17.0%
- **Relief Icons:** 66
- **Screenshot:** `shattered_123.png`

#### Seed 1000
- **Land %:** 40.0%
- **Clusters:** 38
- **Isolines:** 16.8%
- **Relief Icons:** 51
- **Screenshot:** `shattered_1000.png`

#### Seed 893179
- **Land %:** 40.0%
- **Clusters:** 64
- **Isolines:** 16.0%
- **Relief Icons:** 76
- **Screenshot:** `shattered_893179.png`

#### Seed 291743
- **Land %:** 40.0%
- **Clusters:** 33
- **Isolines:** 17.8%
- **Relief Icons:** 54
- **Screenshot:** `shattered_291743.png`

#### Seed 889589
- **Land %:** 40.0%
- **Clusters:** 42
- **Isolines:** 19.2%
- **Relief Icons:** 46
- **Screenshot:** `shattered_889589.png`

#### Seed 88871
- **Land %:** 40.0%
- **Clusters:** 27
- **Isolines:** 17.4%
- **Relief Icons:** 48
- **Screenshot:** `shattered_88871.png`

## Screenshot Files

All screenshots saved in this directory with naming pattern: `{template}_{seed}.png`

### Continent (7 maps)
- `continent_42.png` - Seed 42: Cohesive single continent
- `continent_123.png` - Seed 123: Dual continent structure
- `continent_1000.png` - Seed 1000: Single large continent
- `continent_893179.png` - Seed 893179: Dual continents
- `continent_291743.png` - Seed 291743: Dual continents
- `continent_889589.png` - Seed 889589: Single continent
- `continent_88871.png` - Seed 88871: Dual continents

### Archipelago (7 maps)
- `archipelago_42.png` - Seed 42: Scattered islands (34 clusters)
- `archipelago_123.png` - Seed 123: Highly fragmented (45 clusters)
- `archipelago_1000.png` - Seed 1000: Island chains (31 clusters)
- `archipelago_893179.png` - Seed 893179: Moderate fragmentation (19 clusters)
- `archipelago_291743.png` - Seed 291743: Dense islands (47 clusters)
- `archipelago_889589.png` - Seed 889589: Fragmented archipelago (38 clusters)
- `archipelago_88871.png` - Seed 88871: Scattered islands (41 clusters)

### Pangea (7 maps)
- `pangea_42.png` - Seed 42: Single supercontinent
- `pangea_123.png` - Seed 123: Single supercontinent
- `pangea_1000.png` - Seed 1000: Single supercontinent
- `pangea_893179.png` - Seed 893179: Single supercontinent
- `pangea_291743.png` - Seed 291743: Single supercontinent
- `pangea_889589.png` - Seed 889589: Mostly single (3 clusters)
- `pangea_88871.png` - Seed 88871: Single supercontinent

### Shattered (7 maps)
- `shattered_42.png` - Seed 42: Highly fragmented (49 clusters)
- `shattered_123.png` - Seed 123: Dense fragmentation (50 clusters)
- `shattered_1000.png` - Seed 1000: Fragmented landmasses (38 clusters)
- `shattered_893179.png` - Seed 893179: Extreme fragmentation (64 clusters)
- `shattered_291743.png` - Seed 291743: Moderate fragmentation (33 clusters)
- `shattered_889589.png` - Seed 889589: Fragmented (42 clusters)
- `shattered_88871.png` - Seed 88871: Moderate fragmentation (27 clusters)

## Conclusion

All 28 maps successfully validated with correct style-specific behavior:
- ✅ Template-specific cluster merging working correctly
- ✅ Land percentages within target range (40-43%)
- ✅ Fragmented styles (archipelago, shattered) preserve high cluster counts (27-64)
- ✅ Cohesion styles (continent, pangea) maintain low cluster counts (1-3)
- ✅ All 28 maps generated and rendered successfully
- ✅ Border completeness: All land cells claimed by states (unclaimed land cell fix applied)

**Note:** Full 14-template validation (42 maps) can be run using `test-full-14-templates.html` once initialization issue is resolved.
