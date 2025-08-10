module.exports = {
  displayName: 'api-tests',
  preset: '../../jest.preset.js',
  testMatch: ['<rootDir>/tests/api-tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/api-tests/test-setup.ts'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'apps/**/src/**/*.ts',
    '!apps/**/src/**/*.spec.ts',
    '!apps/**/src/**/*.d.ts',
  ],
  coverageDirectory: '../../coverage/api-tests',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'api-tests-results.xml',
      },
    ],
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
