# Testing the Random Map Generator

## Quick Launch

To launch the random map generator test page, use one of these methods:

### Method 1: npm script (Recommended)
```bash
npm run test:launch
```

This will:
1. Build the library if needed
2. Start Vite dev server
3. Open the test page in your browser

### Method 2: Shell script
```bash
./launch-test.sh
```

### Method 3: Manual
```bash
# Build the library
npm run build:dev

# Start Vite dev server
npx vite --open test-random-map.html
```

## What the Test Does

The test page (`test-random-map.html`) will:
1. Automatically generate a random map on page load
2. Display the map on a canvas element
3. Provide a button to generate new random maps
4. Show status messages during generation
5. Display generation statistics (seed, cell count, time)

## Troubleshooting

### Module Loading Issues
- The test uses import maps to resolve the `delaunator` dependency
- Make sure you're using a modern browser that supports import maps
- If you see module loading errors, check the browser console

### Build Issues
- Run `npm run build:dev` to ensure the dist files are up to date
- Check that `dist/azgaar-genesis.esm.js` exists

### Port Already in Use
- Vite defaults to port 5173
- If the port is in use, Vite will automatically try the next available port
- Check the terminal output for the actual URL
