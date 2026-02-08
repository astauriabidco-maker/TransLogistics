/**
 * Authentication & Authorization Middleware
 *
 * Extracts JWT from Authorization header, verifies it,
 * and attaches the authenticated user to the request.
 *
 * Role hierarchy:
 *   PLATFORM_ADMIN → full access (ADMIN)
 *   HUB_ADMIN      → hub-scoped admin (OPERATOR)
 *   HUB_OPERATOR   → hub-scoped read/write (OPERATOR)
 *   DRIVER          → limited mobile access
 *   CUSTOMER        → self-service only
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface AuthenticatedUser {
    id: string;
    role: string;
    hubId: string | null;
}

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export type AdminRole = 'ADMIN' | 'OPERATOR' | 'READ_ONLY';

// ==================================================
// ROLE MAPPING
// ==================================================

/**
 * Maps UserRole (Prisma enum) to AdminRole for backward compatibility.
 */
function toAdminRole(userRole: string): AdminRole {
    switch (userRole) {
        case 'PLATFORM_ADMIN':
            return 'ADMIN';
        case 'HUB_ADMIN':
        case 'HUB_OPERATOR':
            return 'OPERATOR';
        default:
            return 'READ_ONLY';
    }
}

// ==================================================
// AUTHENTICATE — Extract and verify JWT
// ==================================================

/**
 * Extracts the JWT from the Authorization header and attaches
 * the decoded user to `req.user`. If no token is present,
 * the request continues without a user (for optional auth).
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token — continue without user (unauthenticated)
        next();
        return;
    }

    const token = authHeader.slice(7);
    const secret = process.env['AUTH_JWT_SECRET'] || 'dev-jwt-secret-change-in-production';

    try {
        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as {
            userId: string;
            role: string;
            hubId: string | null;
        };

        req.user = {
            id: decoded.userId,
            role: decoded.role,
            hubId: decoded.hubId,
        };
    } catch (error) {
        // Invalid token — log but don't block (requireAuth will block if needed)
        logger.debug({ error: (error as Error).message }, 'JWT verification failed');
    }

    next();
}

// ==================================================
// REQUIRE AUTH — Block unauthenticated requests
// ==================================================

/**
 * Rejects the request if the user is not authenticated.
 * Must be used after `authenticate` middleware.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() },
        });
        return;
    }
    next();
}

// ==================================================
// REQUIRE ROLE — Check user role
// ==================================================

/**
 * Checks if the authenticated user has one of the required admin roles.
 * Maps UserRole → AdminRole for backward compatibility with existing code.
 *
 * Usage:
 *   router.post('/sensitive', requireRole('ADMIN'), handler);
 *   router.get('/data', requireRole('ADMIN', 'OPERATOR'), handler);
 */
export function requireRole(...roles: AdminRole[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() },
            });
            return;
        }

        const adminRole = toAdminRole(req.user.role);
        if (!roles.includes(adminRole)) {
            res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() },
            });
            return;
        }

        next();
    };
}

/**
 * Helper to get the admin role from the request.
 * Used by route handlers that need to log the role.
 */
export function getAdminRole(req: Request): AdminRole {
    if (!req.user) return 'READ_ONLY';
    return toAdminRole(req.user.role);
}
