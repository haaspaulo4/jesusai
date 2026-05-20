/**
 * Mock Settings helper — mocks src/settings/index.js
 * Usage: const { mockGetSetting, setMockSettings } = require('../helpers/mockSettings');
 */

const settingsStore = {};

const mockGetSetting = jest.fn(async (key, defaultValue = null) => {
  return settingsStore[key] !== undefined ? settingsStore[key] : defaultValue;
});

const mockSetSetting = jest.fn(async (key, value) => {
  settingsStore[key] = value;
});

function setMockSettings(settings) {
  Object.keys(settingsStore).forEach(k => delete settingsStore[k]);
  Object.assign(settingsStore, settings);
}

function resetSettings() {
  Object.keys(settingsStore).forEach(k => delete settingsStore[k]);
  mockGetSetting.mockClear();
  mockSetSetting.mockClear();
}

jest.mock('../../src/settings', () => ({
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
  loadSettings: jest.fn().mockResolvedValue({}),
}));

module.exports = { mockGetSetting, mockSetSetting, setMockSettings, resetSettings };
