# Archived Files

Vestigial files from the original Azgaar/Fantasy-Map-Generator upstream and early fork stages.

**Archived on:** 2026-01-08  
**Purpose:** Cleanliness while preserving history/reference

These files are no longer part of the active modular library.

## Directory Structure

- **`audits/`** - Phase completion reports, investigation reports, audit documents, and alignment reports
- **`tests/`** - Test output files, test HTML/JS scripts, and testing reports
- **`ui/`** - Full upstream UI example (full-azgaar-ui) with all original UI components
- **`jsons/`** - Sample JSON output files from testing
- **`svgs/`** - Sample SVG output files from testing
- **`misc/`** - Temporary files, backups, and other miscellaneous artifacts

## Contents

### Audits (`audits/`)
- Phase completion reports (PHASE3_COMPLETE.md, PHASE4_*, PHASE5_*)
- Investigation reports (RENDERING_INVESTIGATION_REPORT.md, SVG_RENDERING_INVESTIGATION.md)
- Audit reports (PHASE5_GENERATION_AUDIT.md, PHASE5_SVG_AUDIT.md)
- Reference alignment reports (SEED42_*, SEED43_*)
- Bundle and rendering configuration reports
- Original audit/ directory contents

### Tests (`tests/`)
- Test output files (test-output-seed42.json, test-output-seed42.svg)
- Test HTML/JS scripts (test-random-map.html, test-svg-*.js)
- Launch scripts (launch-test.sh)
- Testing reports directory (testing-reports/)

### UI (`ui/`)
- Complete upstream UI example (full-azgaar-ui/)
  - Original index.html, index.css, icons.css
  - All original modules, utils, components
  - Original styles, heightmaps, images
  - Service worker (sw.js), manifest (manifest.webmanifest)

### JSONs (`jsons/`)
- Large test output JSON files (e.g., test-output-seed42.json ~13MB)

### SVGs (`svgs/`)
- Test output SVG files (e.g., test-output-seed42.svg ~1.9MB)

### Misc (`misc/`)
- Temporary files, backups, and other artifacts

## Note

These files are preserved for reference but are not required for the core library functionality. The active codebase is in `src/`, examples are in `examples/`, and documentation is in `docs/`.
