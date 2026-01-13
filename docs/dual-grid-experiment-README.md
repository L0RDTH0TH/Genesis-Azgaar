# Dual-Grid Politics Experiment
Branch: experiment/dual-grid-politics
Date started: January 12, 2026

Purpose:
- Experimental parallel implementation of Townscaper-inspired dual-grid / irregular-quad-grid for states, provinces, and burgs
- Goal: More organic, artistic political layers with rounded corners, chunk patterns, variants, and grid relaxation
- Approach: Parallel path (keep Voronoi politics as fallback)
- Key features to prototype: quad grid generation, state assignment via chunks, relaxation algorithm
- Integration: Toggle via new option useDualGridPolitics: true
- References: Audit report "Azgaar-Genesis Fork Audit Report – January 12, 2026"

Next steps (planned):
1. Research Stålberg dual-grid / relaxation techniques
2. Design data structures for quads, chunks, hierarchy
3. Implement minimal quad grid + simple state assignment phase
4. Test partial regeneration compatibility
