/**
 * =============================================================================
 * jest.config.js
 * Desc: Jest configuration for Azgaar Genesis Fork test suite
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/index.js', // Public API wrapper
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000, // Longer timeout for map generation tests
};
