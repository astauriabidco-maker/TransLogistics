'use client';

/**
 * Quote Flow Page
 * 
 * Multi-step quote flow:
 * 1. Select Route (Hub → Hub)
 * 2. Enter Shipment Details
 * 3. Enter Dimensions
 * 4. View & Confirm Quote
 */

import { useState, useEffect } from 'react';
import styles from './quote.module.css';
import * as api from '../../lib/quote-api';
import type { Hub, Route, Quote, Dimensions } from '../../lib/types';

// ==================================================
// TYPES
// ==================================================

type Step = 'route' | 'details' | 'dimensions' | 'confirm' | 'success';

interface ShipmentDetails {
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
}

interface FormState {
    originHubId: string;
    destinationHubId: string;
    routeId: string;
    details: ShipmentDetails;
    dimensions: Dimensions;
    weightKg: number;
}

// ==================================================
// INITIAL STATE
// ==================================================

const initialDetails: ShipmentDetails = {
    senderName: '',
    senderPhone: '',
    senderAddress: '',
    recipientName: '',
    recipientPhone: '',
    recipientAddress: '',
};

const initialDimensions: Dimensions = {
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
};

// ==================================================
// COMPONENT
// ==================================================

export default function QuotePage() {
    // Navigation
    const [step, setStep] = useState<Step>('route');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data
    const [hubs, setHubs] = useState<Hub[]>([]);
    const [routes, setRoutes] = useState<Route[]>([]);
    const [shipmentId, setShipmentId] = useState<string | null>(null);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [trackingCode, setTrackingCode] = useState<string | null>(null);

    // Form
    const [form, setForm] = useState<FormState>({
        originHubId: '',
        destinationHubId: '',
        routeId: '',
        details: initialDetails,
        dimensions: initialDimensions,
        weightKg: 0,
    });

    // Load hubs on mount
    useEffect(() => {
        async function loadHubs() {
            try {
                const data = await api.getHubs();
                setHubs(data.filter(h => h.isActive));
            } catch (err) {
                setError('Failed to load hubs');
            }
        }
        loadHubs();
    }, []);

    // Load routes when origin changes
    useEffect(() => {
        if (!form.originHubId) {
            setRoutes([]);
            return;
        }

        async function loadRoutes() {
            try {
                const data = await api.getRoutes(form.originHubId);
                setRoutes(data.filter(r => r.isActive));
            } catch (err) {
                setError('Failed to load routes');
            }
        }
        loadRoutes();
    }, [form.originHubId]);

    // ==================================================
    // HANDLERS
    // ==================================================

    const handleOriginChange = (hubId: string) => {
        setForm(prev => ({
            ...prev,
            originHubId: hubId,
            destinationHubId: '',
            routeId: '',
        }));
        setError(null);
    };

    const handleDestinationChange = (hubId: string) => {
        const route = routes.find(
            r => r.originHubId === form.originHubId && r.destinationHubId === hubId
        );
        setForm(prev => ({
            ...prev,
            destinationHubId: hubId,
            routeId: route?.id ?? '',
        }));
        setError(null);
    };

    const handleDetailsChange = (field: keyof ShipmentDetails, value: string) => {
        setForm(prev => ({
            ...prev,
            details: { ...prev.details, [field]: value },
        }));
        setError(null);
    };

    const handleDimensionChange = (field: keyof Dimensions, value: number) => {
        setForm(prev => ({
            ...prev,
            dimensions: { ...prev.dimensions, [field]: value },
        }));
        setError(null);
    };

    const handleWeightChange = (value: number) => {
        setForm(prev => ({ ...prev, weightKg: value }));
        setError(null);
    };

    // ==================================================
    // STEP HANDLERS
    // ==================================================

    const handleRouteNext = () => {
        if (!form.routeId) {
            setError('Please select origin and destination');
            return;
        }
        setStep('details');
    };

    const handleDetailsNext = async () => {
        const { details } = form;
        if (!details.senderName || !details.senderPhone || !details.recipientName || !details.recipientPhone) {
            setError('Please fill in required fields');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const shipment = await api.createShipment({
                routeId: form.routeId,
                ...details,
            });
            setShipmentId(shipment.id);
            setTrackingCode(shipment.trackingCode);
            setStep('dimensions');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create shipment');
        } finally {
            setLoading(false);
        }
    };

    const handleDimensionsNext = async () => {
        const { dimensions, weightKg } = form;
        if (dimensions.lengthCm <= 0 || dimensions.widthCm <= 0 || dimensions.heightCm <= 0) {
            setError('Please enter valid dimensions');
            return;
        }
        if (weightKg <= 0) {
            setError('Please enter a valid weight');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Declare manual dimensions
            await api.declareManualDimensions({
                shipmentId: shipmentId!,
                dimensions,
                weightKg,
                declaredBy: 'USER',
            });

            // Create quote
            const quoteData = await api.createQuote({
                shipmentId: shipmentId!,
                dimensions,
                weightKg,
            });
            setQuote(quoteData);
            setStep('confirm');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to calculate quote');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptQuote = async () => {
        if (!quote) return;

        setLoading(true);
        setError(null);

        try {
            await api.acceptQuote(quote.id);
            setStep('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to accept quote');
        } finally {
            setLoading(false);
        }
    };

    const handleRejectQuote = async () => {
        if (!quote) return;

        setLoading(true);
        setError(null);

        try {
            await api.rejectQuote(quote.id);
            // Reset to start
            setStep('route');
            setForm({
                originHubId: '',
                destinationHubId: '',
                routeId: '',
                details: initialDetails,
                dimensions: initialDimensions,
                weightKg: 0,
            });
            setShipmentId(null);
            setQuote(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reject quote');
        } finally {
            setLoading(false);
        }
    };

    const handleNewQuote = () => {
        setStep('route');
        setForm({
            originHubId: '',
            destinationHubId: '',
            routeId: '',
            details: initialDetails,
            dimensions: initialDimensions,
            weightKg: 0,
        });
        setShipmentId(null);
        setQuote(null);
        setTrackingCode(null);
        setError(null);
    };

    // ==================================================
    // RENDER
    // ==================================================

    const stepNumber = (s: Step) => {
        const order: Step[] = ['route', 'details', 'dimensions', 'confirm', 'success'];
        return order.indexOf(s) + 1;
    };

    const currentStepNum = stepNumber(step);

    const destinationHubs = routes
        .filter(r => r.originHubId === form.originHubId)
        .map(r => hubs.find(h => h.id === r.destinationHubId))
        .filter(Boolean) as Hub[];

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>TransLogistics</h1>
                <p className={styles.subtitle}>Get a shipping quote</p>
            </header>

            {/* Progress Steps */}
            {step !== 'success' && (
                <div className={styles.steps}>
                    {['Route', 'Details', 'Dimensions', 'Confirm'].map((label, i) => (
                        <div key={label} className={styles.step}>
                            <div
                                className={`${styles.stepNumber} ${i + 1 < currentStepNum ? styles.completed : ''
                                    } ${i + 1 === currentStepNum ? styles.active : ''}`}
                            >
                                {i + 1 < currentStepNum ? '✓' : i + 1}
                            </div>
                            <span className={styles.stepLabel}>{label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && <div className={styles.error}>{error}</div>}

            {/* Loading */}
            {loading && <div className={styles.loading}>Processing...</div>}

            {/* Step: Route */}
            {step === 'route' && !loading && (
                <div className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Origin Hub</label>
                        <select
                            className={styles.select}
                            value={form.originHubId}
                            onChange={e => handleOriginChange(e.target.value)}
                        >
                            <option value="">Select origin...</option>
                            {hubs.map(hub => (
                                <option key={hub.id} value={hub.id}>
                                    {hub.name} ({hub.city})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Destination Hub</label>
                        <select
                            className={styles.select}
                            value={form.destinationHubId}
                            onChange={e => handleDestinationChange(e.target.value)}
                            disabled={!form.originHubId}
                        >
                            <option value="">Select destination...</option>
                            {destinationHubs.map(hub => (
                                <option key={hub.id} value={hub.id}>
                                    {hub.name} ({hub.city})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.button} ${styles.buttonPrimary}`}
                            onClick={handleRouteNext}
                            disabled={!form.routeId}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Details */}
            {step === 'details' && !loading && (
                <div className={styles.form}>
                    <h3>Sender Information</h3>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Name</label>
                        <input
                            className={styles.input}
                            value={form.details.senderName}
                            onChange={e => handleDetailsChange('senderName', e.target.value)}
                            placeholder="Sender name"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Phone</label>
                        <input
                            className={styles.input}
                            value={form.details.senderPhone}
                            onChange={e => handleDetailsChange('senderPhone', e.target.value)}
                            placeholder="+225 XX XX XX XX"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Address</label>
                        <input
                            className={styles.input}
                            value={form.details.senderAddress}
                            onChange={e => handleDetailsChange('senderAddress', e.target.value)}
                            placeholder="Street address"
                        />
                    </div>

                    <h3>Recipient Information</h3>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Name</label>
                        <input
                            className={styles.input}
                            value={form.details.recipientName}
                            onChange={e => handleDetailsChange('recipientName', e.target.value)}
                            placeholder="Recipient name"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Phone</label>
                        <input
                            className={styles.input}
                            value={form.details.recipientPhone}
                            onChange={e => handleDetailsChange('recipientPhone', e.target.value)}
                            placeholder="+225 XX XX XX XX"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Address</label>
                        <input
                            className={styles.input}
                            value={form.details.recipientAddress}
                            onChange={e => handleDetailsChange('recipientAddress', e.target.value)}
                            placeholder="Street address"
                        />
                    </div>

                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            onClick={() => setStep('route')}
                        >
                            Back
                        </button>
                        <button
                            className={`${styles.button} ${styles.buttonPrimary}`}
                            onClick={handleDetailsNext}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Dimensions */}
            {step === 'dimensions' && !loading && (
                <div className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Dimensions (cm)</label>
                        <div className={styles.dimensionRow}>
                            <input
                                className={styles.input}
                                type="number"
                                value={form.dimensions.lengthCm || ''}
                                onChange={e => handleDimensionChange('lengthCm', Number(e.target.value))}
                                placeholder="Length"
                                min="1"
                            />
                            <input
                                className={styles.input}
                                type="number"
                                value={form.dimensions.widthCm || ''}
                                onChange={e => handleDimensionChange('widthCm', Number(e.target.value))}
                                placeholder="Width"
                                min="1"
                            />
                            <input
                                className={styles.input}
                                type="number"
                                value={form.dimensions.heightCm || ''}
                                onChange={e => handleDimensionChange('heightCm', Number(e.target.value))}
                                placeholder="Height"
                                min="1"
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={`${styles.label} ${styles.required}`}>Weight (kg)</label>
                        <input
                            className={styles.input}
                            type="number"
                            value={form.weightKg || ''}
                            onChange={e => handleWeightChange(Number(e.target.value))}
                            placeholder="Weight in kg"
                            min="0.1"
                            step="0.1"
                        />
                    </div>

                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            onClick={() => setStep('details')}
                        >
                            Back
                        </button>
                        <button
                            className={`${styles.button} ${styles.buttonPrimary}`}
                            onClick={handleDimensionsNext}
                        >
                            Get Quote
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Confirm */}
            {step === 'confirm' && !loading && quote && (
                <div className={styles.form}>
                    <div className={styles.quoteSummary}>
                        <div className={styles.priceRow}>
                            <span>Base price</span>
                            <span className={styles.priceAmount}>
                                {quote.breakdown.basePriceXof.toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className={styles.priceRow}>
                            <span>Weight ({quote.weightKg} kg)</span>
                            <span className={styles.priceAmount}>
                                {quote.breakdown.weightPriceXof.toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className={styles.priceRow}>
                            <span>Volume ({(quote.volumeCm3 / 1000).toFixed(1)} L)</span>
                            <span className={styles.priceAmount}>
                                {quote.breakdown.volumePriceXof.toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className={`${styles.priceRow} ${styles.priceTotal}`}>
                            <span>Total</span>
                            <span className={styles.priceAmount}>
                                {quote.breakdown.totalPriceXof.toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className={styles.validity}>
                            Valid until {new Date(quote.validUntil).toLocaleString()}
                        </div>
                    </div>

                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            onClick={handleRejectQuote}
                        >
                            Cancel
                        </button>
                        <button
                            className={`${styles.button} ${styles.buttonPrimary}`}
                            onClick={handleAcceptQuote}
                        >
                            Accept Quote
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Success */}
            {step === 'success' && (
                <div className={styles.success}>
                    <div className={styles.successIcon}>✅</div>
                    <h2>Quote Accepted!</h2>
                    <p>Your shipment has been confirmed.</p>
                    <div className={styles.trackingCode}>{trackingCode}</div>
                    <p className={styles.subtitle}>Save this tracking code</p>
                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.button} ${styles.buttonPrimary}`}
                            onClick={handleNewQuote}
                        >
                            New Quote
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
