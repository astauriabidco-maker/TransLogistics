/**
 * Auth API Routes
 *
 * Public endpoints for user authentication.
 * All endpoints are rate-limited but do not require prior authentication.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AuthService, AuthError } from '../services/auth.service';
import { requireAuth, getAdminRole } from '../middleware/auth.middleware';

const router = Router();
const authService = new AuthService(prisma as any);

// ==================================================
// HELPERS
// ==================================================

function meta(req: Request) {
    return { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() };
}

// ==================================================
// POST /register — Public registration
// ==================================================

router.post('/register', async (req: Request, res: Response) => {
    try {
        const { phone, email, password, firstName, lastName, role } = req.body;

        // Validation
        if (!phone || !password || !firstName || !lastName) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'phone, password, firstName, and lastName are required' },
                meta: meta(req),
            });
            return;
        }

        if (password.length < 8) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' },
                meta: meta(req),
            });
            return;
        }

        // Only PLATFORM_ADMIN can create non-CUSTOMER accounts
        const allowedSelfRoles = ['CUSTOMER'];
        if (role && !allowedSelfRoles.includes(role)) {
            res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Cannot self-register with elevated role' },
                meta: meta(req),
            });
            return;
        }

        const result = await authService.register({
            phone,
            email: email || undefined,
            password,
            firstName,
            lastName,
            role: role || 'CUSTOMER',
        });

        res.status(201).json({
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
            },
            meta: meta(req),
        });
    } catch (error) {
        if (error instanceof AuthError) {
            const status = error.code === 'PHONE_ALREADY_REGISTERED' || error.code === 'EMAIL_ALREADY_REGISTERED' ? 409 : 400;
            res.status(status).json({
                error: { code: error.code, message: error.message },
                meta: meta(req),
            });
            return;
        }
        logger.error({ error }, 'Registration failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Registration failed' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /login — User login
// ==================================================

router.post('/login', async (req: Request, res: Response) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'phone and password are required' },
                meta: meta(req),
            });
            return;
        }

        const result = await authService.login({ phone, password });

        res.json({
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
            },
            meta: meta(req),
        });
    } catch (error) {
        if (error instanceof AuthError) {
            const status = error.code === 'ACCOUNT_SUSPENDED' ? 403 : 401;
            res.status(status).json({
                error: { code: error.code, message: error.message },
                meta: meta(req),
            });
            return;
        }
        logger.error({ error }, 'Login failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Login failed' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /refresh — Refresh access token
// ==================================================

router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required' },
                meta: meta(req),
            });
            return;
        }

        const result = await authService.refresh(refreshToken);

        res.json({
            data: {
                accessToken: result.accessToken,
                expiresIn: result.expiresIn,
            },
            meta: meta(req),
        });
    } catch (error) {
        if (error instanceof AuthError) {
            res.status(401).json({
                error: { code: error.code, message: error.message },
                meta: meta(req),
            });
            return;
        }
        logger.error({ error }, 'Token refresh failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Token refresh failed' },
            meta: meta(req),
        });
    }
});

// ==================================================
// GET /me — Authenticated user profile
// ==================================================

router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = await authService.getUserById(req.user!.id);

        if (!user) {
            res.status(404).json({
                error: { code: 'USER_NOT_FOUND', message: 'User not found' },
                meta: meta(req),
            });
            return;
        }

        res.json({
            data: {
                user,
                adminRole: getAdminRole(req),
            },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch user profile');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user profile' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /logout — Revoke refresh token
// ==================================================

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
        await authService.logout(req.user!.id);

        res.json({
            data: { loggedOut: true },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Logout failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Logout failed' },
            meta: meta(req),
        });
    }
});

export default router;
