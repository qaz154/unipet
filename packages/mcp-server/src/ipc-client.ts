/**
 * IPC Client for communicating with the UniPet desktop app.
 *
 * Reads the discovery file to find the HTTP server port,
 * then sends requests via HTTP (not raw sockets).
 * The desktop app runs an HTTP server on localhost that
 * accepts the same API as the MCP tools.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { request } from 'node:http';

interface DiscoveryInfo {
  httpPort: number;
  pid: number;
  startedAt: string;
  version: string;
}

interface IPCResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

function readDiscoveryFile(socketPath?: string): DiscoveryInfo | null {
  const paths = socketPath
    ? [socketPath]
    : [
        join(homedir(), '.local', 'state', 'unipet', 'ipc.json'),
        join(homedir(), 'AppData', 'Local', 'unipet', 'ipc.json'),
      ];
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (data.httpPort) return data as DiscoveryInfo;
    } catch {
      // Try next path
    }
  }
  return null;
}

function readAuthToken(): string {
  try {
    return readFileSync(join(homedir(), '.unipet', 'auth-token'), 'utf-8').trim();
  } catch {
    return '';
  }
}

function authHeader(): Record<string, string> {
  const token = readAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CallIPCOptions {
  /** Override discovery file path (e.g. for tests or custom deployments) */
  socketPath?: string;
}

export async function callIPC(
  method: string,
  params: Record<string, unknown>,
  opts?: CallIPCOptions,
): Promise<IPCResponse> {
  const discovery = readDiscoveryFile(opts?.socketPath);
  if (!discovery) {
    return {
      success: false,
      error: 'UniPet desktop app is not running. Please start it first.',
    };
  }

  const endpointMap: Record<string, { path: string; method: string }> = {
    'status': { path: '/api/status', method: 'GET' },
    'pet.react': { path: '/api/state', method: 'POST' },
    'pet.say': { path: '/api/speech', method: 'POST' },
    'pet.move': { path: '/api/move', method: 'POST' },
  };

  const endpoint = endpointMap[method];
  if (!endpoint) {
    return { success: false, error: `Unknown method: ${method}` };
  }

  return new Promise((resolve) => {
    const postData = endpoint.method === 'POST' ? JSON.stringify(params) : '';
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (3s)' });
    }, 3000);

    const req = request(
      {
        hostname: '127.0.0.1',
        port: discovery.httpPort,
        path: endpoint.path,
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...authHeader(),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ success: false, error: 'Invalid response from UniPet' });
          }
        });
      },
    );

    req.on('error', () => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: 'Cannot connect to UniPet desktop app. Is it running?',
      });
    });

    if (postData) req.write(postData);
    req.end();
  });
}
