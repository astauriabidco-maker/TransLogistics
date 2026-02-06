/**
 * Offline Storage Layer
 * 
 * Uses localForage (IndexedDB) to persist:
 * - Driver session/auth token
 * - Active route plan
 * - Pending actions (to sync when online)
 * - Proof files (photos/signatures as base64)
 */

import localforage from 'localforage';

// Configure stores
const authStore = localforage.createInstance({
    name: 'driver-app',
    storeName: 'auth',
});

const routeStore = localforage.createInstance({
    name: 'driver-app',
    storeName: 'route',
});

const syncStore = localforage.createInstance({
    name: 'driver-app',
    storeName: 'sync',
});

const proofStore = localforage.createInstance({
    name: 'driver-app',
    storeName: 'proofs',
});

// ==================================================
// TYPES
// ==================================================

export interface DriverSession {
    driverId: string;
    userId: string;
    name: string;
    phone: string;
    token: string;
    expiresAt: string;
}

export interface StopInfo {
    id: string;
    taskId: string;
    shipmentId: string;
    sequence: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'DELIVERED' | 'FAILED';
    recipientName: string;
    recipientPhone: string;
    address: string;
    landmark?: string;
    lat?: number;
    lng?: number;
    navigation?: {
        googleMaps: string | null;
        waze: string | null;
        appleMaps: string | null;
    };
}

export interface RoutePlan {
    id: string;
    planDate: string;
    status: 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED';
    vehicleType: string;
    stops: StopInfo[];
    hubName: string;
    hubAddress: string;
    lastSynced: string;
}

export interface PendingAction {
    id: string;
    type: 'START_PICKUP' | 'CONFIRM_PICKUP' | 'START_DELIVERY' | 'SUBMIT_PROOF' | 'FAILED_ATTEMPT';
    payload: Record<string, unknown>;
    createdAt: string;
    retries: number;
}

export interface StoredProof {
    id: string;
    shipmentDeliveryId: string;
    proofType: 'PHOTO' | 'SIGNATURE' | 'OTP';
    photoBase64?: string;
    signatureBase64?: string;
    recipientName: string;
    lat: number;
    lng: number;
    createdAt: string;
}

// ==================================================
// AUTH STORE
// ==================================================

export async function saveSession(session: DriverSession): Promise<void> {
    await authStore.setItem('session', session);
}

export async function getSession(): Promise<DriverSession | null> {
    return authStore.getItem<DriverSession>('session');
}

export async function clearSession(): Promise<void> {
    await authStore.removeItem('session');
}

// ==================================================
// ROUTE STORE
// ==================================================

export async function saveRoutePlan(plan: RoutePlan): Promise<void> {
    await routeStore.setItem('activePlan', plan);
}

export async function getRoutePlan(): Promise<RoutePlan | null> {
    return routeStore.getItem<RoutePlan>('activePlan');
}

export async function clearRoutePlan(): Promise<void> {
    await routeStore.removeItem('activePlan');
}

export async function updateStopStatus(
    stopId: string,
    status: StopInfo['status']
): Promise<void> {
    const plan = await getRoutePlan();
    if (!plan) return;

    const stopIndex = plan.stops.findIndex(s => s.id === stopId);
    if (stopIndex >= 0) {
        plan.stops[stopIndex].status = status;
        await saveRoutePlan(plan);
    }
}

// ==================================================
// SYNC QUEUE
// ==================================================

export async function queueAction(action: Omit<PendingAction, 'id' | 'createdAt' | 'retries'>): Promise<void> {
    const pending: PendingAction = {
        ...action,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        retries: 0,
    };

    const queue = await getPendingActions();
    queue.push(pending);
    await syncStore.setItem('pendingActions', queue);
}

export async function getPendingActions(): Promise<PendingAction[]> {
    return (await syncStore.getItem<PendingAction[]>('pendingActions')) || [];
}

export async function removePendingAction(actionId: string): Promise<void> {
    const queue = await getPendingActions();
    const filtered = queue.filter(a => a.id !== actionId);
    await syncStore.setItem('pendingActions', filtered);
}

export async function clearPendingActions(): Promise<void> {
    await syncStore.setItem('pendingActions', []);
}

export async function incrementRetry(actionId: string): Promise<void> {
    const queue = await getPendingActions();
    const actionIndex = queue.findIndex(a => a.id === actionId);
    if (actionIndex >= 0) {
        queue[actionIndex].retries += 1;
        await syncStore.setItem('pendingActions', queue);
    }
}

// ==================================================
// PROOF STORE
// ==================================================

export async function saveProof(proof: StoredProof): Promise<void> {
    await proofStore.setItem(proof.id, proof);
}

export async function getProof(proofId: string): Promise<StoredProof | null> {
    return proofStore.getItem<StoredProof>(proofId);
}

export async function getAllProofs(): Promise<StoredProof[]> {
    const proofs: StoredProof[] = [];
    await proofStore.iterate<StoredProof, void>((value) => {
        proofs.push(value);
    });
    return proofs;
}

export async function removeProof(proofId: string): Promise<void> {
    await proofStore.removeItem(proofId);
}

export async function clearAllProofs(): Promise<void> {
    await proofStore.clear();
}
