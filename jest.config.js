module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  testMatch: ['**/?(*.)+(spec|test).+(ts|tsx)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
  ],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/node_modules/react-native/jest/setup.js',
    '\\.(jpg|jpeg|png|gif|mp3|wav|mp4)$': '<rootDir>/scripts/ci/__mocks__/fileMock.js',
  },
  // Coverage threshold scoped only to files that already have tests,
  // so CI doesn't fail as contributors add new untested files
  coverageThreshold: {
    'src/utils/timestampParser.ts': {
      lines: 80,
    },
  },
};
