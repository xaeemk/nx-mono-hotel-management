const { workspaceRoot } = require('@nx/devkit');

// Reading the SWC compilation config and remove the "exclude"
// for the test files to be compiled by SWC
const { exclude: _, ...swcJestConfig } = require('@nx/js/swc/jest');

// disable .swcrc look-up by SWC core because we specify the config here.
process.env.SWC_NODE_IGNORE_DYNAMIC = 'true';

/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */
module.exports = {
  testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
  transform: {
    '^.+\\.(ts|js|html)$': ['@swc/jest', swcJestConfig],
  },
  resolver: '@nx/jest/plugins/resolver',
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageReporters: ['html'],
  passWithNoTests: true,
  collectCoverageFrom: [
    '**/*.{ts,tsx,js,jsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/*.config.{js,ts}',
    '!**/coverage/**',
  ],
};
