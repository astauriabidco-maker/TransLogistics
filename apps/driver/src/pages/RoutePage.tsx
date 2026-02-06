/**
 * Route Page
 * 
 * Daily route view with:
 * - Ordered stop list
 * - Status badges
 * - Navigation to delivery
 * - Offline support
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    type RoutePlan,
    type StopInfo,
    getRoutePlan,
    saveRoutePlan,
    queueAction,
    // updateStopStatus, // unused for now
} from '../lib/offlineStore';
import {
    getActiveRoutePlan,
    startTaskPickup,
    startTaskDelivery,
    type ApiRoutePlan,
    OfflineError,
} from '../lib/api';
import StatusBanner from '../components/StatusBanner';

// Convert API response to local format
function mapApiToLocal(api: ApiRoutePlan): RoutePlan {
    const stops: StopInfo[] = [];
    let sequence = 1;

    for (const task of api.tasks) {
        for (const delivery of task.deliveries) {
            stops.push({
                id: delivery.id,
                taskId: task.id,
                shipmentId: delivery.shipmentId,
                sequence: sequence++,
                status: mapDeliveryStatus(delivery.status),
                recipientName: task.recipientName,
                recipientPhone: task.recipientPhone,
                address: task.deliveryAddress,
                lat: task.deliveryLat,
                lng: task.deliveryLng,
            });
        }
    }

    return {
        id: api.id,
        planDate: api.planDate,
        status: api.status as RoutePlan['status'],
        vehicleType: api.vehicle.type,
        stops,
        hubName: api.hub.name,
        hubAddress: api.hub.address,
        lastSynced: new Date().toISOString(),
    };
}

function mapDeliveryStatus(status: string): StopInfo['status'] {
    switch (status) {
        case 'DELIVERED':
            return 'DELIVERED';
        case 'PENDING_RETRY':
        case 'RETURNED_TO_HUB':
        case 'EXCEPTION':
            return 'FAILED';
        case 'IN_TRANSIT':
        case 'DELIVERY_ATTEMPT':
            return 'IN_PROGRESS';
        default:
            return 'PENDING';
    }
}

export default function RoutePage() {
    const navigate = useNavigate();
    const { session, logout } = useAuth();
    const [route, setRoute] = useState<RoutePlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // Track online status
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load route (from cache first, then refresh)
    const loadRoute = useCallback(async (forceRefresh = false) => {
        if (!session) return;

        try {
            // Try cache first
            if (!forceRefresh) {
                const cached = await getRoutePlan();
                if (cached) {
                    setRoute(cached);
                }
            }

            // Refresh from API if online
            if (navigator.onLine) {
                setIsRefreshing(true);
                const apiRoute = await getActiveRoutePlan(session.token);
                if (apiRoute) {
                    const mapped = mapApiToLocal(apiRoute);
                    await saveRoutePlan(mapped);
                    setRoute(mapped);
                }
            }
        } catch (error) {
            if (!(error instanceof OfflineError)) {
                console.error('Failed to load route:', error);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [session]);

    useEffect(() => {
        loadRoute();
    }, [loadRoute]);

    // Start pickup for current task (keep for future use)
    // @ts-ignore - Available for future use
    const _handleStartPickup = async (taskId: string) => {
        if (!session) return;

        // Get current location
        let lat: number | undefined;
        let lng: number | undefined;

        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        } catch {
            // Location unavailable, continue without
        }

        try {
            if (navigator.onLine) {
                await startTaskPickup(session.token, taskId, lat, lng);
            } else {
                await queueAction({
                    type: 'START_PICKUP',
                    payload: { taskId, lat, lng },
                });
            }
            // Update local state
            await loadRoute(true);
        } catch (error) {
            if (error instanceof OfflineError) {
                await queueAction({
                    type: 'START_PICKUP',
                    payload: { taskId, lat, lng },
                });
            } else {
                console.error('Failed to start pickup:', error);
            }
        }
    };

    // Start delivery (keep for future use)
    // @ts-ignore - Available for future use
    const _handleStartDelivery = async (taskId: string) => {
        if (!session) return;

        try {
            if (navigator.onLine) {
                await startTaskDelivery(session.token, taskId);
            } else {
                await queueAction({
                    type: 'START_DELIVERY',
                    payload: { taskId },
                });
            }
            await loadRoute(true);
        } catch (error) {
            if (error instanceof OfflineError) {
                await queueAction({
                    type: 'START_DELIVERY',
                    payload: { taskId },
                });
            }
        }
    };

    // Navigate to delivery page
    const handleStopClick = (stop: StopInfo) => {
        if (stop.status === 'DELIVERED' || stop.status === 'FAILED') return;
        navigate(`/delivery/${stop.id}`);
    };

    // Open in maps (prefer Google Maps, then Waze, then fallback to building URL)
    const handleNavigate = (stop: StopInfo) => {
        // Use API-provided navigation links if available
        if (stop.navigation?.googleMaps) {
            window.open(stop.navigation.googleMaps, '_blank');
            return;
        }
        if (stop.navigation?.waze) {
            window.open(stop.navigation.waze, '_blank');
            return;
        }

        // Fallback: build URL locally
        const query = stop.lat && stop.lng
            ? `${stop.lat},${stop.lng}`
            : encodeURIComponent(stop.address);
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
    };

    if (isLoading) {
        return (
            <div className="app-container">
                <div className="page flex items-center justify-center">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    const pendingStops = route?.stops.filter(s => s.status === 'PENDING') || [];
    const inProgressStops = route?.stops.filter(s => s.status === 'IN_PROGRESS') || [];
    const completedStops = route?.stops.filter(s => s.status === 'DELIVERED') || [];

    return (
        <div className="app-container">
            <StatusBanner isOffline={isOffline} />

            {/* Header */}
            <div className="page-header">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="page-title">Ma tournée</h1>
                        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                            {route ? new Date(route.planDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Aucune tournée'}
                        </p>
                    </div>
                    <button onClick={logout} className="btn btn-outline btn-icon" style={{ width: 'auto', minWidth: '48px' }}>
                        ⏻
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="page gap-md">
                {!route ? (
                    <div className="card text-center p-lg">
                        <p style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--spacing-sm)' }}>📭</p>
                        <p>Aucune tournée assignée</p>
                        <button
                            className="btn btn-outline"
                            style={{ marginTop: 'var(--spacing-md)' }}
                            onClick={() => loadRoute(true)}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Progress summary */}
                        <div className="card">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Progression</p>
                                    <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                                        {completedStops.length} / {route.stops.length}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Véhicule</p>
                                    <p style={{ fontWeight: 600 }}>{route.vehicleType}</p>
                                </div>
                            </div>
                        </div>

                        {/* Active stop (if any) */}
                        {inProgressStops.length > 0 && (
                            <div>
                                <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-sm)' }}>
                                    En cours
                                </h2>
                                {inProgressStops.map(stop => (
                                    <div
                                        key={stop.id}
                                        className="stop-item"
                                        style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-primary)' }}
                                        onClick={() => handleStopClick(stop)}
                                    >
                                        <div className="stop-number" style={{ background: 'var(--color-primary)' }}>
                                            {stop.sequence}
                                        </div>
                                        <div className="stop-details">
                                            <p className="stop-address">{stop.address}</p>
                                            <p className="stop-recipient">{stop.recipientName} • {stop.recipientPhone}</p>
                                        </div>
                                        <button
                                            className="btn btn-outline btn-icon"
                                            style={{ width: '48px', flexShrink: 0 }}
                                            onClick={(e) => { e.stopPropagation(); handleNavigate(stop); }}
                                        >
                                            🧭
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pending stops */}
                        {pendingStops.length > 0 && (
                            <div>
                                <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-sm)' }}>
                                    À faire ({pendingStops.length})
                                </h2>
                                <div className="flex flex-col gap-sm">
                                    {pendingStops.map(stop => (
                                        <div
                                            key={stop.id}
                                            className="stop-item"
                                            onClick={() => handleStopClick(stop)}
                                        >
                                            <div className="stop-number">{stop.sequence}</div>
                                            <div className="stop-details">
                                                <p className="stop-address">{stop.address}</p>
                                                <p className="stop-recipient">{stop.recipientName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Completed stops */}
                        {completedStops.length > 0 && (
                            <div>
                                <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-sm)', color: 'var(--color-text-muted)' }}>
                                    Terminées ({completedStops.length})
                                </h2>
                                <div className="flex flex-col gap-sm">
                                    {completedStops.map(stop => (
                                        <div
                                            key={stop.id}
                                            className="stop-item"
                                            style={{ opacity: 0.6 }}
                                        >
                                            <div className="stop-number complete">✓</div>
                                            <div className="stop-details">
                                                <p className="stop-address">{stop.address}</p>
                                                <p className="stop-recipient">{stop.recipientName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Refresh button */}
            {route && (
                <div className="action-bar">
                    <button
                        className="btn btn-outline"
                        onClick={() => loadRoute(true)}
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? 'Actualisation...' : '🔄 Actualiser la tournée'}
                    </button>
                </div>
            )}
        </div>
    );
}
