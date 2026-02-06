import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
    name: env.SERVICE_NAME,
    level: env.LOG_LEVEL,
    transport:
        env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            }
            : undefined,
    base: {
        env: env.NODE_ENV,
        service: env.SERVICE_NAME,
    },
});

export function createChildLogger(context: Record<string, unknown>) {
    return logger.child(context);
}
