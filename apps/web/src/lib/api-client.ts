/**
 * API Client
 * 
 * Centralized API client for communicating with the backend.
 * Uses fetch with proper error handling and type safety.
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

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    async get<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.error.message);
        }

        const result: ApiResponse<T> = await response.json();
        return result.data;
    }
}

export const apiClient = new ApiClient();
export { ApiClient };
