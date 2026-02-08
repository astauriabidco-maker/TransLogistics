/**
 * AuthService
 *
 * Handles user registration, login, JWT token generation/verification,
 * and refresh token management via Redis.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';

// ==================================================
// TYPES
// ==================================================

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface JwtPayload {
    userId: string;
    role: string;
    hubId: string | null;
}

export interface RegisterInput {
    phone: string;
    email?: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
}

export interface LoginInput {
    phone: string;
    password: string;
}

export interface AuthUser {
    id: string;
    phone: string;
    email: string | null;
    firstName: string;
    lastName: string;
    role: string;
    hubId: string | null;
}

// ==================================================
// CONSTANTS
// ==================================================

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh:';

// ==================================================
// SERVICE
// ==================================================

export class AuthService {
    private readonly log = logger.child({ service: 'auth' });
    private readonly jwtSecret: string;
    private readonly accessTokenExpiry: number;
    private readonly refreshTokenExpiry: number;

    constructor(private readonly prisma: PrismaClient) {
        this.jwtSecret = process.env['AUTH_JWT_SECRET'] || 'dev-jwt-secret-change-in-production';
        this.accessTokenExpiry = parseInt(process.env['AUTH_JWT_EXPIRY_SECONDS'] || '3600', 10);
        this.refreshTokenExpiry = parseInt(process.env['AUTH_REFRESH_TOKEN_EXPIRY_SECONDS'] || '604800', 10);

        if (this.jwtSecret === 'dev-jwt-secret-change-in-production' && process.env['NODE_ENV'] === 'production') {
            throw new Error('AUTH_JWT_SECRET must be set in production');
        }
    }

    // ==================================================
    // REGISTER
    // ==================================================

    async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
        // Check for existing user
        const existing = await this.prisma.user.findUnique({
            where: { phone: input.phone },
        });

        if (existing) {
            throw new AuthError('PHONE_ALREADY_REGISTERED', 'A user with this phone number already exists');
        }

        if (input.email) {
            const emailExists = await this.prisma.user.findUnique({
                where: { email: input.email },
            });
            if (emailExists) {
                throw new AuthError('EMAIL_ALREADY_REGISTERED', 'A user with this email already exists');
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

        // Create user
        const user = await this.prisma.user.create({
            data: {
                phone: input.phone,
                email: input.email || null,
                passwordHash,
                firstName: input.firstName,
                lastName: input.lastName,
                role: (input.role as any) || 'CUSTOMER',
            },
        });

        // Generate tokens
        const tokens = await this.generateTokens({
            userId: user.id,
            role: user.role,
            hubId: user.hubId,
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                entityType: 'USER',
                entityId: user.id,
                action: 'USER_REGISTERED',
                performedById: user.id,
                performedByRole: user.role,
                changes: { phone: user.phone, role: user.role },
            },
        });

        this.log.info({ userId: user.id, role: user.role }, 'User registered');

        return {
            user: this.toAuthUser(user),
            tokens,
        };
    }

    // ==================================================
    // LOGIN
    // ==================================================

    async login(input: LoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
        const user = await this.prisma.user.findUnique({
            where: { phone: input.phone },
        });

        if (!user) {
            throw new AuthError('INVALID_CREDENTIALS', 'Invalid phone number or password');
        }

        if (user.status !== 'ACTIVE') {
            throw new AuthError('ACCOUNT_SUSPENDED', 'Account is suspended or deleted');
        }

        // Verify password
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
            throw new AuthError('INVALID_CREDENTIALS', 'Invalid phone number or password');
        }

        // Update last login
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        // Generate tokens
        const tokens = await this.generateTokens({
            userId: user.id,
            role: user.role,
            hubId: user.hubId,
        });

        this.log.info({ userId: user.id, role: user.role }, 'User logged in');

        return {
            user: this.toAuthUser(user),
            tokens,
        };
    }

    // ==================================================
    // REFRESH TOKEN
    // ==================================================

    async refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
        // Validate refresh token format
        let payload: JwtPayload;
        try {
            payload = jwt.verify(refreshToken, this.jwtSecret, {
                algorithms: ['HS256'],
            }) as JwtPayload & { type?: string };
        } catch {
            throw new AuthError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
        }

        // Check if refresh token exists in Redis (not revoked)
        const stored = await getRedis().get(`${REFRESH_TOKEN_PREFIX}${payload.userId}`);
        if (!stored || stored !== refreshToken) {
            throw new AuthError('REFRESH_TOKEN_REVOKED', 'Refresh token has been revoked');
        }

        // Generate new access token
        const accessToken = jwt.sign(
            { userId: payload.userId, role: payload.role, hubId: payload.hubId },
            this.jwtSecret,
            { algorithm: 'HS256', expiresIn: this.accessTokenExpiry },
        );

        return { accessToken, expiresIn: this.accessTokenExpiry };
    }

    // ==================================================
    // VERIFY ACCESS TOKEN
    // ==================================================

    verifyAccessToken(token: string): JwtPayload {
        try {
            const decoded = jwt.verify(token, this.jwtSecret, {
                algorithms: ['HS256'],
            }) as JwtPayload;
            return decoded;
        } catch {
            throw new AuthError('INVALID_TOKEN', 'Access token is invalid or expired');
        }
    }

    // ==================================================
    // GET USER BY ID
    // ==================================================

    async getUserById(userId: string): Promise<AuthUser | null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        return user ? this.toAuthUser(user) : null;
    }

    // ==================================================
    // LOGOUT (Revoke refresh token)
    // ==================================================

    async logout(userId: string): Promise<void> {
        await getRedis().del(`${REFRESH_TOKEN_PREFIX}${userId}`);
        this.log.info({ userId }, 'User logged out — refresh token revoked');
    }

    // ==================================================
    // INTERNAL
    // ==================================================

    private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
        const accessToken = jwt.sign(
            { userId: payload.userId, role: payload.role, hubId: payload.hubId },
            this.jwtSecret,
            { algorithm: 'HS256', expiresIn: this.accessTokenExpiry },
        );

        const refreshToken = jwt.sign(
            { userId: payload.userId, role: payload.role, hubId: payload.hubId, type: 'refresh' },
            this.jwtSecret,
            { algorithm: 'HS256', expiresIn: this.refreshTokenExpiry },
        );

        // Store refresh token in Redis with TTL
        await getRedis().set(
            `${REFRESH_TOKEN_PREFIX}${payload.userId}`,
            refreshToken,
            'EX',
            this.refreshTokenExpiry,
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: this.accessTokenExpiry,
        };
    }

    private toAuthUser(user: {
        id: string;
        phone: string;
        email: string | null;
        firstName: string;
        lastName: string;
        role: string;
        hubId: string | null;
    }): AuthUser {
        return {
            id: user.id,
            phone: user.phone,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            hubId: user.hubId,
        };
    }
}

// ==================================================
// AUTH ERROR
// ==================================================

export class AuthError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'AuthError';
    }
}
