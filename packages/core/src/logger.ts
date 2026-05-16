export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(context: string): Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  minLevel: LogLevel = 'info',
  prefix: string = 'unipet',
): Logger {
  const shouldLog = (level: LogLevel): boolean =>
    LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];

  const format = (level: LogLevel, context: string, message: string): string =>
    `[${new Date().toISOString()}] [${level.toUpperCase()}] [${prefix}:${context}] ${message}`;

  const createChildLogger = (context: string): Logger => ({
    debug: (msg, ...args) => {
      if (shouldLog('debug')) console.debug(format('debug', context, msg), ...args);
    },
    info: (msg, ...args) => {
      if (shouldLog('info')) console.info(format('info', context, msg), ...args);
    },
    warn: (msg, ...args) => {
      if (shouldLog('warn')) console.warn(format('warn', context, msg), ...args);
    },
    error: (msg, ...args) => {
      if (shouldLog('error')) console.error(format('error', context, msg), ...args);
    },
    child: (childContext: string) =>
      createChildLogger(`${context}:${childContext}`),
  });

  return createChildLogger('root');
}
