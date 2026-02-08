/**
 * API Client
 * 
 * Centralized API client for communicating with the backend.
 * Uses fetch with proper error handling, type safety, and JWT auth.
 */

const API_BASE_URL =
    typeof window !== 'undefined'
        ? (window as unknown as { ENV?: { API_URL?: string } }).ENV?.API_URL ?? 'http://localhost:3001'
        : 'http://localhost:3001';

interface ApiResponse<T> {
    data: T;
    meta: {
        requestId: string;
        timestamp: string;
    };
}

interface ApiError {
    error: {
        code: string;
        message: string;
    };
    meta: {
        requestId: string;
        timestamp: string;
    };
}

// ==================================================
// TOKEN MANAGEMENT
// ==================================================

const TOKEN_KEY = 'tl_access_token';
const REFRESH_KEY = 'tl_refresh_token';

export function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
    return !!getAccessToken();
}

// ==================================================
// API CLIENT
// ==================================================

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private getHeaders(): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        const token = getAccessToken();
        if (token) {
            (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    private async handleUnauthorized(response: Response): Promise<void> {
        if (response.status === 401 && typeof window !== 'undefined') {
            // Try refreshing the token
            const refreshToken = getRefreshToken();
            if (refreshToken) {
                try {
                    const refreshResponse = await fetch(`${this.baseUrl}/api/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken }),
                    });

                    if (refreshResponse.ok) {
                        const result = await refreshResponse.json();
                        localStorage.setItem(TOKEN_KEY, result.data.accessToken);
                        return; // Token refreshed — caller should retry
                    }
                } catch {
                    // Refresh failed — fall through to redirect
                }
            }

            // No valid refresh token — redirect to login
            clearTokens();
            window.location.href = '/admin/login';
        }
    }

    async get<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.getHeaders(),
        });

        if (response.status === 401) {
            await this.handleUnauthorized(response);
            // Retry after token refresh
            const retryResponse = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            if (!retryResponse.ok) {
                const error: ApiError = await retryResponse.json();
                throw new Error(error.error.message);
            }
            const result: ApiResponse<T> = await retryResponse.json();
            return result.data;
        }

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.error.message);
        }

        const result: ApiResponse<T> = await response.json();
        return result.data;
    }

    async post<T, D>(path: string, data: D): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data),
        });

        if (response.status === 401) {
            await this.handleUnauthorized(response);
            const retryResponse = await fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data),
            });
            if (!retryResponse.ok) {
                const error: ApiError = await retryResponse.json();
                throw new Error(error.error.message);
            }
            const result: ApiResponse<T> = await retryResponse.json();
            return result.data;
        }

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.error.message);
        }

        const result: ApiResponse<T> = await response.json();
        return result.data;
    }

    async patch<T, D>(path: string, data: D): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            if (response.status === 401) {
                await this.handleUnauthorized(response);
            }
            const error: ApiError = await response.json();
            throw new Error(error.error.message);
        }

        const result: ApiResponse<T> = await response.json();
        return result.data;
    }
}

export const apiClient = new ApiClient();
export { ApiClient };
