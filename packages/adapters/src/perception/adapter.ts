/**
 * AI Perception Adapter
 *
 * Captures periodic screenshots and uses a multimodal LLM
 * to infer the user's activity, then updates the pet state.
 *
 * Requires PerceptionConfig with API endpoint and key.
 */

import { BaseAdapter, type AgentCapabilities } from '../adapter.js';
import type { PetState } from '@unipet/core';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

/** Configuration for the perception adapter */
export interface PerceptionConfig {
  /** Multimodal LLM API endpoint (e.g. https://api.openai.com/v1/chat/completions) */
  endpoint?: string;
  /** API key for the multimodal LLM */
  apiKey?: string;
  /** Model name (default: gpt-4o) */
  model?: string;
  /** How often to process screenshots, in seconds (default: 30) */
  captureIntervalSec?: number;
  /** Local HTTP port to receive screenshot uploads (default: 23335) */
  listenPort?: number;
}

/** The expected shape of the LLM's JSON response */
interface LLMPerceptionResult {
  /** Inferred activity keyword */
  activity: string;
  /** Optional description of what the user is doing */
  description?: string;
  /** Confidence score 0-1 */
  confidence?: number;
}

/** Map LLM activity keywords to valid PetState values */
const ACTIVITY_STATE_MAP: Record<string, PetState> = {
  coding: 'working',
  writing: 'working',
  editing: 'working',
  reading: 'thinking',
  reviewing: 'thinking',
  browsing: 'thinking',
  thinking: 'thinking',
  debugging: 'thinking',
  analyzing: 'thinking',
  idle: 'idle',
  inactive: 'idle',
  away: 'idle',
  error: 'error',
  crashed: 'error',
  broken: 'error',
  testing: 'testing',
  running_tests: 'testing',
  celebrating: 'celebrating',
  done: 'celebrating',
  notification: 'notification',
};

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_CAPTURE_INTERVAL_SEC = 30;
const DEFAULT_LISTEN_PORT = 23335;
const LLM_TIMEOUT_MS = 15_000;

/**
 * Read the full request body as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    const MAX_BODY = 20 * 1024 * 1024; // 20 MB limit for base64 screenshots

    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body exceeds 20 MB limit'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON POST request using node:http or node:https.
 */
function jsonPost(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = transport(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        timeout: LLM_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch {
              reject(new Error(`Failed to parse LLM response as JSON: ${raw.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`LLM API returned status ${res.statusCode}: ${raw.slice(0, 500)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LLM API request timed out'));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * AI Perception Adapter
 *
 * Receives base64-encoded screenshots via HTTP POST,
 * sends them to a multimodal LLM, and maps the inferred
 * activity to a pet state.
 */
export class PerceptionAdapter extends BaseAdapter {
  readonly id = 'perception';
  readonly name = 'AI Perception';
  readonly capabilities: AgentCapabilities = {
    pushStates: true,
    mcpTools: false,
    permissionBubbles: false,
    subagentDetection: false,
    sessionEnd: false,
  };

  private httpServer: ReturnType<typeof createServer> | null = null;
  private perceptionTimer: ReturnType<typeof setInterval> | null = null;
  private lastScreenshot: string | null = null;
  private lastActivity: string | null = null;
  private processingActive = false;

  /** Extract perception-specific config from adapter overrides */
  private getConfig(): PerceptionConfig {
    const config = this.ctx.getConfig();
    return (config.overrides as PerceptionConfig | undefined) ?? {};
  }

  async start(ctx: import('../adapter.js').AdapterContext): Promise<void> {
    await super.start(ctx);

    const perceptionConfig = this.getConfig();

    if (!perceptionConfig.endpoint) {
      this.ctx.log.warn(
        `[${this.id}] No LLM endpoint configured. Screenshots will be accepted but not analyzed.`,
      );
    }

    const listenPort = perceptionConfig.listenPort ?? DEFAULT_LISTEN_PORT;
    this.startHttpServer(listenPort);

    this.ctx.log.info(
      `[${this.id}] Perception adapter listening on port ${listenPort}` +
      (perceptionConfig.endpoint ? ` (endpoint: ${perceptionConfig.endpoint})` : ' (no endpoint configured)'),
    );

    const intervalSec = perceptionConfig.captureIntervalSec ?? DEFAULT_CAPTURE_INTERVAL_SEC;
    this.startPeriodicProcessing(intervalSec);
  }

  async stop(): Promise<void> {
    if (this.perceptionTimer) {
      clearInterval(this.perceptionTimer);
      this.perceptionTimer = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.lastScreenshot = null;
    this.lastActivity = null;
    this.ctx?.log.info(`[${this.id}] Perception adapter stopped`);
  }

  async detect(): Promise<boolean> {
    const config = this.getConfig();
    return Boolean(config.endpoint && config.apiKey);
  }

  async health(): Promise<{ healthy: boolean; message: string; details?: Record<string, unknown> }> {
    const config = this.getConfig();
    const hasEndpoint = Boolean(config.endpoint);
    const hasApiKey = Boolean(config.apiKey);
    const serverRunning = this.httpServer !== null;

    if (!hasEndpoint) {
      return {
        healthy: false,
        message: 'LLM endpoint not configured',
        details: { serverRunning },
      };
    }

    if (!hasApiKey) {
      return {
        healthy: false,
        message: 'API key not configured',
        details: { endpoint: config.endpoint, serverRunning },
      };
    }

    return {
      healthy: serverRunning,
      message: serverRunning ? 'OK' : 'HTTP server not running',
      details: {
        endpoint: config.endpoint,
        model: config.model ?? DEFAULT_MODEL,
        lastActivity: this.lastActivity,
        captureIntervalSec: config.captureIntervalSec ?? DEFAULT_CAPTURE_INTERVAL_SEC,
      },
    };
  }

  /**
   * Start a small HTTP server to receive screenshot uploads.
   *
   * POST /api/perception/screenshot
   * Body: { "image": "<base64 data>" }
   */
  private startHttpServer(port: number): void {
    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/api/perception/screenshot') {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as { image?: string };

          if (!body.image || typeof body.image !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid "image" field (expected base64 string)' }));
            return;
          }

          this.lastScreenshot = body.image;
          this.ctx.log.debug(`[${this.id}] Screenshot received (${(body.image.length / 1024).toFixed(0)} KB base64)`);

          // Trigger analysis immediately if an endpoint is configured
          const config = this.getConfig();
          if (config.endpoint && config.apiKey) {
            this.analyzeScreenshot(body.image).catch((err: unknown) => {
              this.ctx.log.error(`[${this.id}] Screenshot analysis failed:`, err);
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.ctx.log.error(`[${this.id}] Failed to handle screenshot:`, message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    this.httpServer.listen(port, '127.0.0.1');
  }

  /**
   * Periodically re-analyze the last screenshot if no new one has arrived.
   */
  private startPeriodicProcessing(intervalSec: number): void {
    this.perceptionTimer = setInterval(async () => {
      if (!this.lastScreenshot || this.processingActive) return;

      const config = this.getConfig();
      if (!config.endpoint || !config.apiKey) return;

      try {
        await this.analyzeScreenshot(this.lastScreenshot);
      } catch (err: unknown) {
        this.ctx.log.error(`[${this.id}] Periodic analysis failed:`, err);
      }
    }, intervalSec * 1000);
  }

  /**
   * Send a screenshot to the multimodal LLM and emit a state event.
   */
  private async analyzeScreenshot(base64Image: string): Promise<void> {
    const config = this.getConfig();

    if (!config.endpoint || !config.apiKey) {
      this.ctx.log.warn(`[${this.id}] Cannot analyze: endpoint or API key missing`);
      return;
    }

    this.processingActive = true;

    try {
      const model = config.model ?? DEFAULT_MODEL;

      const payload = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Analyze this screenshot and determine what the user is currently doing.',
                  'Return a JSON object with exactly these fields:',
                  '  "activity": one of "coding", "reading", "writing", "debugging", "testing", "browsing", "idle", "error", "celebrating", "notification", "thinking", "reviewing", "editing", "analyzing"',
                  '  "description": a brief one-sentence description of what you see',
                  '  "confidence": a number between 0 and 1',
                  'Return ONLY the JSON object, no other text.',
                ].join('\n'),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 256,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      };

      const result = (await jsonPost(config.endpoint, payload, {
        Authorization: `Bearer ${config.apiKey}`,
      })) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = result?.choices?.[0]?.message?.content;
      if (!content) {
        this.ctx.log.warn(`[${this.id}] LLM returned empty response`);
        return;
      }

      const parsed = JSON.parse(content) as LLMPerceptionResult;
      const activity = parsed.activity?.toLowerCase().trim() ?? 'idle';

      if (activity === this.lastActivity) {
        this.ctx.log.debug(`[${this.id}] Activity unchanged: ${activity}`);
        return;
      }

      this.lastActivity = activity;

      const petState = this.mapActivityToState(activity);
      this.ctx.log.info(
        `[${this.id}] Detected activity: "${activity}" -> pet state: "${petState}"` +
        (parsed.description ? ` (${parsed.description})` : ''),
      );

      this.ctx.emit(
        this.stateEvent(petState, {
          activity,
          description: parsed.description,
          confidence: parsed.confidence,
          source: 'perception',
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.log.error(`[${this.id}] LLM analysis error: ${message}`);
      // Emit error state so the pet reflects the issue
      this.ctx.emit(this.stateEvent('error', { source: 'perception', error: message }));
    } finally {
      this.processingActive = false;
    }
  }

  /**
   * Map an LLM activity keyword to a valid PetState.
   * Falls back to 'idle' for unrecognized activities.
   */
  private mapActivityToState(activity: string): PetState {
    const normalized = activity.toLowerCase().replace(/[\s-]+/g, '_');
    return ACTIVITY_STATE_MAP[normalized] ?? 'idle';
  }
}
