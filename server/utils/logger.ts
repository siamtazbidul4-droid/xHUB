import pino from 'pino';
import { isProduction } from '../config/env.js';

const transport = isProduction()
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction() ? 'info' : 'debug'),
  transport,
  base: {
    service: 'kinetix-video-platform',
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}