/**
 * State Machine
 * 
 * Defines valid state transitions and guards.
 * Enforces strict flow: no skipping states.
 */

import type { WhatsAppState, SessionStateData } from './types';

// ==================================================
// STATE TRANSITIONS
// ==================================================

/**
 * Valid state transitions.
 * Key: current state, Value: allowed next states.
 */
export const STATE_TRANSITIONS: Record<WhatsAppState, WhatsAppState[]> = {
    INIT: ['CHOIX_SERVICE'],
    CHOIX_SERVICE: ['SCAN_PHOTO', 'SUIVI'], // SUIVI for tracking lookup
    SCAN_PHOTO: ['CALCUL_PRIX'],
    CALCUL_PRIX: ['CONFIRMATION'],
    CONFIRMATION: ['PAIEMENT', 'INIT'], // INIT for rejection
    PAIEMENT: ['SUIVI'],
    SUIVI: ['INIT'], // Can start over
};

/**
 * Terminal states (conversation ends here).
 */
export const TERMINAL_STATES: WhatsAppState[] = ['SUIVI'];

/**
 * States that can timeout to INIT.
 */
export const TIMEOUT_STATES: WhatsAppState[] = [
    'CHOIX_SERVICE',
    'SCAN_PHOTO',
    'CALCUL_PRIX',
    'CONFIRMATION',
    'PAIEMENT',
];

// ==================================================
// TRANSITION VALIDATION
// ==================================================

export function isValidTransition(
    from: WhatsAppState,
    to: WhatsAppState
): boolean {
    const allowedTransitions = STATE_TRANSITIONS[from];
    return allowedTransitions.includes(to);
}

export function getNextStates(current: WhatsAppState): WhatsAppState[] {
    return STATE_TRANSITIONS[current] ?? [];
}

export function isTerminalState(state: WhatsAppState): boolean {
    return TERMINAL_STATES.includes(state);
}

// ==================================================
// TRANSITION GUARDS
// ==================================================

export interface TransitionGuard {
    from: WhatsAppState;
    to: WhatsAppState;
    check: (data: SessionStateData) => boolean;
    errorMessage: string;
}

/**
 * Guards that must pass before a transition is allowed.
 */
export const TRANSITION_GUARDS: TransitionGuard[] = [
    {
        from: 'SCAN_PHOTO',
        to: 'CALCUL_PRIX',
        check: (data) => !!data.scanResultId,
        errorMessage: 'Scan result required before price calculation',
    },
    {
        from: 'CALCUL_PRIX',
        to: 'CONFIRMATION',
        check: (data) => !!data.quoteId && data.quotePriceXof !== undefined,
        errorMessage: 'Quote required before confirmation',
    },
    {
        from: 'CONFIRMATION',
        to: 'PAIEMENT',
        check: (data) => data.quoteAccepted === true,
        errorMessage: 'Quote must be accepted before payment',
    },
    {
        from: 'PAIEMENT',
        to: 'SUIVI',
        check: (data) => !!data.paymentId,
        errorMessage: 'Payment must be initiated before tracking',
    },
];

export function checkTransitionGuards(
    from: WhatsAppState,
    to: WhatsAppState,
    data: SessionStateData
): { allowed: boolean; error?: string } {
    const guards = TRANSITION_GUARDS.filter(
        (g) => g.from === from && g.to === to
    );

    for (const guard of guards) {
        if (!guard.check(data)) {
            return { allowed: false, error: guard.errorMessage };
        }
    }

    return { allowed: true };
}

// ==================================================
// STATE MACHINE
// ==================================================

export interface TransitionResult {
    success: boolean;
    newState?: WhatsAppState;
    error?: string;
}

export function attemptTransition(
    currentState: WhatsAppState,
    targetState: WhatsAppState,
    stateData: SessionStateData
): TransitionResult {
    // Check if transition is valid
    if (!isValidTransition(currentState, targetState)) {
        return {
            success: false,
            error: `Invalid transition: ${currentState} → ${targetState}`,
        };
    }

    // Check guards
    const guardResult = checkTransitionGuards(currentState, targetState, stateData);
    if (!guardResult.allowed) {
        return {
            success: false,
            error: guardResult.error,
        };
    }

    return {
        success: true,
        newState: targetState,
    };
}

// ==================================================
// STATE FLOW UTILITIES
// ==================================================

/**
 * Get the index of a state in the flow.
 */
export function getStateIndex(state: WhatsAppState): number {
    const order: WhatsAppState[] = [
        'INIT',
        'CHOIX_SERVICE',
        'SCAN_PHOTO',
        'CALCUL_PRIX',
        'CONFIRMATION',
        'PAIEMENT',
        'SUIVI',
    ];
    return order.indexOf(state);
}

/**
 * Check if state A comes before state B in the flow.
 */
export function isStateBefore(a: WhatsAppState, b: WhatsAppState): boolean {
    return getStateIndex(a) < getStateIndex(b);
}

/**
 * Get the previous state in the flow (for back navigation).
 */
export function getPreviousState(state: WhatsAppState): WhatsAppState | null {
    const order: WhatsAppState[] = [
        'INIT',
        'CHOIX_SERVICE',
        'SCAN_PHOTO',
        'CALCUL_PRIX',
        'CONFIRMATION',
        'PAIEMENT',
        'SUIVI',
    ];
    const index = order.indexOf(state);
    return index > 0 ? order[index - 1] : null;
}
