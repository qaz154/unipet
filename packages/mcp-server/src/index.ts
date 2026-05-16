#!/usr/bin/env node

export { createMCPServer, startMCPServer, type MCPServerConfig } from './server.js';

// Auto-start when run directly
const isMainModule = process.argv[1] && import.meta.url.endsWith((process.argv[1] ?? '').replace(/\\/g, '/'));
if (isMainModule || process.argv[1]?.includes('unipet-mcp')) {
  const { startMCPServer } = await import('./server.js');
  startMCPServer().catch(() => {
    process.exit(1);
  });
}
