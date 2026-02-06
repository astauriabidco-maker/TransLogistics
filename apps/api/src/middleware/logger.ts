import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

/**
 * HTTP Request Logging Middleware
 * 
 * Logs all incoming requests with relevant metadata.
 */
export const httpLogger = pinoHttp({
    logger,
    autoLogging: {
        ignore: (req) => req.url === '/health',
    },
    customProps: (req) => ({
        requestId: req.headers['x-request-id'] ?? generateRequestId(),
    }),
    customSuccessMessage: (req, res) => {
        return `${req.method} ${req.url} completed`;
    },
    customErrorMessage: (req, res) => {
        return `${req.method} ${req.url} failed`;
    },
});

/**
 * Error Logging Middleware
 * 
 * Catches unhandled errors and logs them.
 */
export function errorLogger(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    logger.error(
        {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
            request: {
                method: req.method,
                url: req.url,
                headers: req.headers,
            },
        },
        'Unhandled error'
    );
    next(error);
}

function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
