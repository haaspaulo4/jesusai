/**
 * Mock DB helper — mocks mysql2/promise pool
 * Usage: const { mockPool, mockExecute } = require('../helpers/mockDb');
 */

const mockExecute = jest.fn().mockResolvedValue([[], []]);
const mockGetConnection = jest.fn();

const mockConnection = {
  execute: jest.fn().mockResolvedValue([[], []]),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
};

mockGetConnection.mockResolvedValue(mockConnection);

const mockPool = {
  execute: mockExecute,
  getConnection: mockGetConnection,
  query: jest.fn().mockResolvedValue([[], []]),
  end: jest.fn().mockResolvedValue(undefined),
};

// Auto-mock the db module
jest.mock('../../src/db', () => ({
  pool: mockPool,
  getPool: () => mockPool,
}));

function resetMocks() {
  mockExecute.mockReset().mockResolvedValue([[], []]);
  mockConnection.execute.mockReset().mockResolvedValue([[], []]);
  mockConnection.beginTransaction.mockReset().mockResolvedValue(undefined);
  mockConnection.commit.mockReset().mockResolvedValue(undefined);
  mockConnection.rollback.mockReset().mockResolvedValue(undefined);
  mockConnection.release.mockReset();
  mockGetConnection.mockReset().mockResolvedValue(mockConnection);
}

module.exports = { mockPool, mockExecute, mockConnection, mockGetConnection, resetMocks };
