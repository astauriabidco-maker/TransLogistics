/**
 * Sync Service
 * 
 * Handles background synchronization of offline actions:
 * - Detects online/offline state
 * - Processes pending action queue
 * - Uploads proof files
 */

import {
    getPendingActions,
    removePendingAction,
    incrementRetry,
    getAllProofs,
    removeProof,
    getSession,
    type StoredProof,
    type PendingAction,
} from './offlineStore';
import {
    startTaskPickup,
    confirmTaskPickup,
    startTaskDelivery,
    submitDeliveryProof,
    recordFailedAttempt,
    OfflineError,
} from './api';

const MAX_RETRIES = 3;

type SyncCallback = (status: 'syncing' | 'done' | 'error', pendingCount: number) => void;

let syncCallback: SyncCallback | null = null;
let isSyncing = false;

export function setSyncCallback(callback: SyncCallback | null) {
    syncCallback = callback;
}

export async function syncPendingActions(): Promise<void> {
    if (isSyncing || !navigator.onLine) return;

    const session = await getSession();
    if (!session) return;

    isSyncing = true;
    const pending = await getPendingActions();

    if (pending.length === 0) {
        isSyncing = false;
        return;
    }

    syncCallback?.('syncing', pending.length);

    for (const action of pending) {
        try {
            await processAction(session.token, action);
            await removePendingAction(action.id);
        } catch (error) {
            if (error instanceof OfflineError) {
                // Stop syncing, we're offline
                break;
            }

            // Increment retry count
            if (action.retries < MAX_RETRIES) {
                await incrementRetry(action.id);
            } else {
                // Max retries reached, remove (could log to server later)
                console.error('Max retries reached for action:', action);
                await removePendingAction(action.id);
            }
        }
    }

    // Sync proofs
    await syncProofs(session.token);

    const remaining = await getPendingActions();
    syncCallback?.(remaining.length > 0 ? 'error' : 'done', remaining.length);
    isSyncing = false;
}

async function processAction(token: string, action: PendingAction): Promise<void> {
    const { type, payload } = action;

    switch (type) {
        case 'START_PICKUP':
            await startTaskPickup(
                token,
                payload.taskId as string,
                payload.lat as number | undefined,
                payload.lng as number | undefined
            );
            break;

        case 'CONFIRM_PICKUP':
            await confirmTaskPickup(
                token,
                payload.taskId as string,
                payload.pickedUpShipmentIds as string[],
                payload.photoUrls as string[] | undefined
            );
            break;

        case 'START_DELIVERY':
            await startTaskDelivery(token, payload.taskId as string);
            break;

        case 'FAILED_ATTEMPT':
            await recordFailedAttempt(
                token,
                payload.shipmentDeliveryId as string,
                payload.reason as string,
                payload.photoUrls as string[] | undefined,
                payload.lat as number | undefined,
                payload.lng as number | undefined
            );
            break;

        default:
            console.warn('Unknown action type:', type);
    }
}

async function syncProofs(token: string): Promise<void> {
    const proofs = await getAllProofs();

    for (const proof of proofs) {
        try {
            await uploadProof(token, proof);
            await removeProof(proof.id);
        } catch (error) {
            if (error instanceof OfflineError) {
                break;
            }
            console.error('Failed to sync proof:', proof.id, error);
        }
    }
}

async function uploadProof(token: string, proof: StoredProof): Promise<void> {
    // In production, photos would be uploaded to S3/Cloudinary first
    // For now, we pass base64 directly (small images)

    const photoUrls = proof.photoBase64 ? [proof.photoBase64] : undefined;
    const signatureUrl = proof.signatureBase64;

    await submitDeliveryProof(token, proof.shipmentDeliveryId, {
        proofType: proof.proofType,
        photoUrls,
        signatureUrl,
        recipientName: proof.recipientName,
        lat: proof.lat,
        lng: proof.lng,
    });
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('Back online, starting sync...');
        syncPendingActions();
    });
}
