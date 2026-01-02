#!/bin/bash
# Deployment script for Azgaar Genesis library to Genesis Mythos project
# Usage: ./scripts/deploy-to-godot.sh <path-to-genesis-mythos-project>

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-genesis-mythos-project>"
    echo "Example: $0 ../genesis-mythos"
    exit 1
fi

GODOT_PROJECT="$1"
TARGET_DIR="${GODOT_PROJECT}/res/assets/ui_web/js/azgaar"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Azgaar Genesis Library Deployment Script"
echo "========================================"
echo "Fork directory: $FORK_DIR"
echo "Target directory: $TARGET_DIR"
echo ""

# Check if target directory exists
if [ ! -d "$GODOT_PROJECT" ]; then
    echo "Error: Genesis Mythos project directory not found: $GODOT_PROJECT"
    exit 1
fi

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Copy bundle files
echo "Copying bundle files..."
cp "${FORK_DIR}/dist/azgaar-genesis.esm.js" "${TARGET_DIR}/"
cp "${FORK_DIR}/dist/azgaar-genesis.min.js" "${TARGET_DIR}/"
cp "${FORK_DIR}/dist/azgaar-genesis.umd.js" "${TARGET_DIR}/"

echo "✅ Bundle files copied"

# Check if Delaunator needs to be downloaded
DELAUNATOR_FILE="${TARGET_DIR}/delaunator.esm.js"
if [ ! -f "$DELAUNATOR_FILE" ]; then
    echo ""
    echo "Delaunator dependency not found."
    echo "Options:"
    echo "  1. Download from CDN (recommended for development)"
    echo "  2. Use CDN URL directly in HTML (no download needed)"
    echo ""
    echo "For production, you can download Delaunator:"
    echo "  curl -o ${DELAUNATOR_FILE} https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm"
    echo ""
    echo "Or use CDN in your HTML:"
    echo "  import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';"
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Files deployed to: $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. Update world_builder.html to load the library"
echo "  2. Include Delaunator (CDN or local file)"
echo "  3. Follow Sub-Phase 4.2 in PHASE4_IMPLEMENTATION_PLAN.md"
echo ""
