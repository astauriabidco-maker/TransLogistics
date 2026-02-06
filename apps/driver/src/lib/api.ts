/**
 * API Client for Driver App
 * 
 * Handles:
 * - Auth token attachment
 * - Offline detection
 * - Error normalization
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ApiError {
    code: string;
    message: string;
}

export class OfflineError extends Error {
    constructor() {
        super('Vous êtes hors ligne');
        this.name = 'OfflineError';
    }
}

export class ApiRequestError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
        super(message);
        this.name = 'ApiRequestError';
        this.code = code;
        this.status = status;
    }
}

async function request<T>(
    endpoint: string,
    options: RequestInit = {},
    token?: string
): Promise<T> {
    // Check if online
    if (!navigator.onLine) {
        throw new OfflineError();
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let error: ApiError = { code: 'UNKNOWN', message: 'Une erreur est survenue' };
        try {
            error = await response.json();
        } catch {
            // Ignore JSON parse errors
        }
        throw new ApiRequestError(error.code, error.message, response.status);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
        return {} as T;
    }

    return JSON.parse(text) as T;
}

// ==================================================
// AUTH
// ==================================================

export interface LoginResponse {
    driver: {
        id: string;
        userId: string;
        name: string;
        phone: string;
    };
    token: string;
    expiresAt: string;
}

export async function login(phone: string, pin: string): Promise<LoginResponse> {
    return request<LoginResponse>('/api/driver/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
    });
}

export async function getMe(token: string): Promise<LoginResponse['driver']> {
    return request<LoginResponse['driver']>('/api/driver/auth/me', {}, token);
}

// ==================================================
// ROUTE
// ==================================================

export interface NavigationLinks {
    googleMaps: string | null;
    waze: string | null;
    appleMaps: string | null;
}

export interface ApiRoutePlan {
    id: string;
    planDate: string;
    status: string;
    vehicle: {
        type: string;
    };
    hub: {
        name: string;
        address: string;
    };
    tasks: Array<{
        id: string;
        status: string;
        deliveryAddress: string;
        deliveryLat?: number;
        deliveryLng?: number;
        navigation?: NavigationLinks;
        recipientName: string;
        recipientPhone: string;
        notes?: string;
        deliveries: Array<{
            id: string;
            shipmentId: string;
            status: string;
        }>;
    }>;
}

export async function getActiveRoutePlan(token: string): Promise<ApiRoutePlan | null> {
    try {
        return await request<ApiRoutePlan>('/api/driver/route-plan/active', {}, token);
    } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) {
            return null;
        }
        throw error;
    }
}

// ==================================================
// TASK ACTIONS
// ==================================================

export async function startTaskPickup(
    token: string,
    taskId: string,
    lat?: number,
    lng?: number
): Promise<void> {
    await request(`/api/driver/tasks/${taskId}/start-pickup`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng }),
    }, token);
}

export async function confirmTaskPickup(
    token: string,
    taskId: string,
    pickedUpShipmentIds: string[],
    photoUrls?: string[]
): Promise<void> {
    await request(`/api/driver/tasks/${taskId}/confirm-pickup`, {
        method: 'POST',
        body: JSON.stringify({ pickedUpShipmentIds, photoUrls }),
    }, token);
}

export async function startTaskDelivery(
    token: string,
    taskId: string
): Promise<void> {
    await request(`/api/driver/tasks/${taskId}/start-delivery`, {
        method: 'POST',
    }, token);
}

// ==================================================
// DELIVERY PROOF
// ==================================================

export interface SubmitProofInput {
    proofType: 'PHOTO' | 'SIGNATURE' | 'OTP';
    photoUrls?: string[];
    signatureUrl?: string;
    otpCode?: string;
    recipientName: string;
    lat: number;
    lng: number;
    notes?: string;
}

export async function submitDeliveryProof(
    token: string,
    shipmentDeliveryId: string,
    input: SubmitProofInput
): Promise<void> {
    await request(`/api/driver/deliveries/${shipmentDeliveryId}/proof`, {
        method: 'POST',
        body: JSON.stringify(input),
    }, token);
}

export async function recordFailedAttempt(
    token: string,
    shipmentDeliveryId: string,
    reason: string,
    photoUrls?: string[],
    lat?: number,
    lng?: number
): Promise<void> {
    await request(`/api/driver/deliveries/${shipmentDeliveryId}/failed`, {
        method: 'POST',
        body: JSON.stringify({ reason, photoUrls, lat, lng }),
    }, token);
}

// ==================================================
// SYNC
// ==================================================

export interface SyncPayload {
    actions: Array<{
        id: string;
        type: string;
        payload: Record<string, unknown>;
    }>;
}

export async function batchSync(token: string, payload: SyncPayload): Promise<void> {
    await request('/api/driver/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
    }, token);
}
