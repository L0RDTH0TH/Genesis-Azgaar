# Azgaar Genesis Library - Deployment Guide

Quick reference for deploying the library to Genesis Mythos project.

## Quick Deployment

### Using Deployment Script

```bash
cd azgaar-genesis-fork
./scripts/deploy-to-godot.sh /path/to/genesis-mythos-project
```

### Manual Deployment

1. **Copy bundle files** to Genesis Mythos project:
   ```bash
   mkdir -p /path/to/genesis-mythos/res/assets/ui_web/js/azgaar
   cp dist/azgaar-genesis.esm.js /path/to/genesis-mythos/res/assets/ui_web/js/azgaar/
   cp dist/azgaar-genesis.min.js /path/to/genesis-mythos/res/assets/ui_web/js/azgaar/
   ```

2. **Include Delaunator dependency**:
   
   **Option A: Use CDN (Recommended)**
   ```javascript
   import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
   ```
   
   **Option B: Download locally**
   ```bash
   curl -o /path/to/genesis-mythos/res/assets/ui_web/js/azgaar/delaunator.esm.js \
     https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm
   ```

## Target Directory Structure

After deployment, your Genesis Mythos project should have:

```
res/
└── assets/
    └── ui_web/
        └── js/
            └── azgaar/
                ├── azgaar-genesis.esm.js      # Main library (ES Module)
                ├── azgaar-genesis.min.js      # Minified version (optional)
                ├── azgaar-genesis.umd.js      # UMD version (optional)
                └── delaunator.esm.js          # Peer dependency (if using local)
```

## Bundle Selection

- **`azgaar-genesis.esm.js`** (Recommended): ES Module format, works with `import` statements
- **`azgaar-genesis.min.js`**: Minified version, smaller file size
- **`azgaar-genesis.umd.js`**: UMD format, works as global variable or with require()

For Godot WebView with ES6 modules, use **`.esm.js`** version.

## File Sizes

- `azgaar-genesis.esm.js`: ~133KB (uncompressed), ~31KB (gzipped)
- `azgaar-genesis.min.js`: ~92KB (uncompressed), ~27KB (gzipped)
- `azgaar-genesis.umd.js`: ~141KB (uncompressed), ~32KB (gzipped)

## Verification

After deployment, verify files exist:

```bash
ls -lh /path/to/genesis-mythos/res/assets/ui_web/js/azgaar/
```

You should see the bundle files listed.

## Next Steps

After deployment, follow **Sub-Phase 4.2** in `PHASE4_IMPLEMENTATION_PLAN.md` to integrate into your HTML/WebView.
