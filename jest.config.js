module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/db/**',
    '!src/server.js',
    '!src/knowledge/sources/**',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 50,
    },
  },
  testTimeout: 10000,
  clearMocks: true,
  restoreMocks: true,
};
