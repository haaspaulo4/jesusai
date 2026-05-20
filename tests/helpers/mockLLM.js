/**
 * Mock LLM helper — mocks src/llm/integrationManager.js
 * Usage: const { mockCallLLM, setLLMResponse } = require('../helpers/mockLLM');
 */

let llmResponse = { content: 'Mock LLM response', tool_calls: [] };

const mockCallLLM = jest.fn(async () => {
  return { ...llmResponse };
});

const mockNormalize = jest.fn((data) => {
  return { content: data?.content || '', tool_calls: data?.tool_calls || [] };
});

function setLLMResponse(response) {
  llmResponse = response;
}

function resetLLM() {
  llmResponse = { content: 'Mock LLM response', tool_calls: [] };
  mockCallLLM.mockClear();
  mockNormalize.mockClear();
}

jest.mock('../../src/llm/integrationManager', () => ({
  callLLM: mockCallLLM,
  normalizeLLMResponse: mockNormalize,
  loadRegistry: jest.fn().mockResolvedValue([]),
  getIntegrations: jest.fn().mockReturnValue([]),
}));

module.exports = { mockCallLLM, mockNormalize, setLLMResponse, resetLLM };
