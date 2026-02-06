import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}

/**
 * Global Error Handler
 * 
 * Converts errors to consistent API response format.
 */
export function errorHandler(
    error: ApiError,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? 'INTERNAL_ERROR';

    // Log error (skip for expected client errors)
    if (statusCode >= 500) {
        logger.error(
            {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    code,
                },
                request: {
                    method: req.method,
                    url: req.url,
                },
            },
            'Server error'
        );
    }

    res.status(statusCode).json({
        error: {
            code,
            message: error.message,
            ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack }),
        },
        meta: {
            requestId: req.headers['x-request-id'] ?? 'unknown',
            timestamp: new Date().toISOString(),
        },
    });
}

/**
 * 404 Handler
 */
export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.url} not found`,
        },
        meta: {
            requestId: req.headers['x-request-id'] ?? 'unknown',
            timestamp: new Date().toISOString(),
        },
    });
}
