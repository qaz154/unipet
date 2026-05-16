import { describe, it, expect } from 'vitest';
import { createMCPServer } from './server.js';

describe('MCP Server', () => {
  it('creates server instance', () => {
    const server = createMCPServer();
    expect(server).toBeDefined();
  });

  it('creates server with config', () => {
    const server = createMCPServer({ petId: 'my-pet' });
    expect(server).toBeDefined();
  });
});
