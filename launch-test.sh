#!/bin/bash

# Launch script for random map generator test
# This script starts a local server and opens the test page in a browser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if dist files exist
if [ ! -f "dist/azgaar-genesis.esm.js" ]; then
    echo "⚠️  Build files not found. Building library..."
    npm run build:dev
fi

# Check if vite is available (via npx)
echo "🚀 Starting Vite dev server..."
echo "📝 Test page will be available at: http://localhost:5173/test-random-map.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Use vite dev server (better for development with hot reload)
npx vite --open test-random-map.html
