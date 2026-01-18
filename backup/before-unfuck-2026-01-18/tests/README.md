# Test Suite

This directory contains unit and integration tests for the Azgaar Genesis Fork.

## Test Structure

- `utils.test.js` - Tests for utility functions (RNG, math, arrays, etc.)
- `core/*.test.js` - Tests for core generation modules
- `generator.test.js` - Integration tests for the main generator

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Seeds

All tests use fixed seeds for reproducibility:
- Default test seed: `12345`
- Alternative test seed: `42`

## Comparison Script

Use the comparison script to validate refactored generator against original:

```bash
npm run compare [seed]
```

This will generate a detailed report comparing key metrics between the original and refactored generators.
