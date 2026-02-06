/**
 * Quote API Service
 * 
 * API calls for the quote flow.
 */

import { apiClient } from './api-client';
import type {
    Hub,
    Route,
    Quote,
    Shipment,
    CreateShipmentRequest,
    CreateQuoteRequest,
    DeclareManualDimensionsRequest,
} from './types';

// ==================================================
// HUBS & ROUTES
// ==================================================

export async function getHubs(): Promise<Hub[]> {
    return apiClient.get<Hub[]>('/api/hubs');
}

export async function getRoutes(originHubId?: string): Promise<Route[]> {
    const query = originHubId ? `?originHubId=${originHubId}` : '';
    return apiClient.get<Route[]>(`/api/routes${query}`);
}

export async function getRouteById(routeId: string): Promise<Route> {
    return apiClient.get<Route>(`/api/routes/${routeId}`);
}

// ==================================================
// SHIPMENTS
// ==================================================

export async function createShipment(data: CreateShipmentRequest): Promise<Shipment> {
    return apiClient.post<Shipment, CreateShipmentRequest>('/api/shipments', data);
}

export async function getShipmentById(shipmentId: string): Promise<Shipment> {
    return apiClient.get<Shipment>(`/api/shipments/${shipmentId}`);
}

export async function getShipmentByTracking(trackingCode: string): Promise<Shipment> {
    return apiClient.get<Shipment>(`/api/shipments/track/${trackingCode}`);
}

// ==================================================
// SCANS (Manual Stub)
// ==================================================

export async function declareManualDimensions(
    data: DeclareManualDimensionsRequest
): Promise<{ id: string }> {
    return apiClient.post<{ id: string }, DeclareManualDimensionsRequest>(
        '/api/scans/manual',
        data
    );
}

// ==================================================
// QUOTES
// ==================================================

export async function createQuote(data: CreateQuoteRequest): Promise<Quote> {
    return apiClient.post<Quote, CreateQuoteRequest>('/api/quotes', data);
}

export async function getQuoteById(quoteId: string): Promise<Quote> {
    return apiClient.get<Quote>(`/api/quotes/${quoteId}`);
}

export async function getQuoteByShipmentId(shipmentId: string): Promise<Quote | null> {
    try {
        return await apiClient.get<Quote>(`/api/shipments/${shipmentId}/quote`);
    } catch {
        return null;
    }
}

export async function acceptQuote(quoteId: string): Promise<Quote> {
    return apiClient.post<Quote, Record<string, never>>(`/api/quotes/${quoteId}/accept`, {});
}

export async function rejectQuote(quoteId: string): Promise<Quote> {
    return apiClient.post<Quote, Record<string, never>>(`/api/quotes/${quoteId}/reject`, {});
}
