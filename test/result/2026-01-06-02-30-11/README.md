# Multi-Seed Test Results
**Date:** 2026-01-06 02:30:11  
**Test Type:** 5 Random Seed Generation and Render Test

## Test Seeds
1. **Seed 431775** - Generation: 2711.70ms | Render: 215.30ms | Total: 2927.00ms
   - Grid cells: 9975 | Pack cells: 9347
   - States: 19 | Burgs: 118 | Rivers: 27
   - Features: 59 | Cultures: 13 | Biomes: 7

2. **Seed 454561** - Generation: 1924.80ms | Render: 151.10ms | Total: 2075.90ms
   - Grid cells: 9975 | Pack cells: 10025
   - States: 19 | Burgs: 118 | Rivers: 20
   - Features: 31 | Cultures: 13 | Biomes: 6

3. **Seed 241916** - Generation: 5887.80ms | Render: 159.40ms | Total: 6047.20ms
   - Grid cells: 9975 | Pack cells: 9361
   - States: 19 | Burgs: 118 | Rivers: 31
   - Features: 60 | Cultures: 13 | Biomes: 7

4. **Seed 407365** - Generation: 2897.10ms | Render: 176.10ms | Total: 3073.20ms
   - Grid cells: 9975 | Pack cells: 9895
   - States: 19 | Burgs: 118 | Rivers: 22
   - Features: 39 | Cultures: 13 | Biomes: 7

5. **Seed 445706** - Generation: 2902.30ms | Render: 138.10ms | Total: 3040.40ms
   - Grid cells: 9975 | Pack cells: 10087
   - States: 19 | Burgs: 118 | Rivers: 38
   - Features: 55 | Cultures: 13 | Biomes: 7

## Visual Features Verified
- ✅ Ocean depth gradients and atmospheric fog
- ✅ Advanced 3-way biome color blending (height, moisture, temperature)
- ✅ Fantasy state and burg names (e.g., "Kingdom of Norseholm", "Yamotowick")
- ✅ Curved black bold labels with white halo on `<textPath>`
- ✅ Relief icons (mountains/hills) using Poisson sampling
- ✅ Complete coastline borders
- ✅ Smoothed rivers (Catmull-Rom curves)
- ✅ Routes/roads (orange dashed lines) when data present
- ✅ Markers/anchors when data present

## Screenshots
- `multi-seed-test-full.png` - Full page screenshot with all 5 tests
- `test-seed-431775.png` - Viewport screenshot of test 1

## Notes
All tests completed successfully. Generation times varied from ~1.9s to ~5.9s, with rendering consistently fast (~150-220ms). All maps show proper fantasy naming, curved labels, and full rendering pipeline features.
