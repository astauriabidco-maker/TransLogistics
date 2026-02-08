'use client';

import { createContext, useContext, ReactNode } from 'react';
import fr from './fr.json';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

type NestedKeyOf<T, Prefix extends string = ''> = T extends Record<string, unknown>
    ? {
        [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? NestedKeyOf<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
    : never;

type TranslationKey = NestedKeyOf<typeof fr>;

type Locale = 'fr'; // Extend with 'en', 'ar', etc. later

// ──────────────────────────────────────────────────
// Translations registry
// ──────────────────────────────────────────────────

const translations: Record<Locale, typeof fr> = {
    fr,
};

// ──────────────────────────────────────────────────
// Helper: resolve nested key "nav.dashboard" → value
// ──────────────────────────────────────────────────

function resolve(obj: Record<string, unknown>, path: string): string {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return path; // fallback: return key if not found
        }
    }
    return typeof current === 'string' ? current : path;
}

// ──────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────

interface I18nContextValue {
    locale: Locale;
    t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'fr',
    t: (key) => key,
});

// ──────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────

interface TranslationProviderProps {
    locale?: Locale;
    children: ReactNode;
}

export function TranslationProvider({ locale = 'fr', children }: TranslationProviderProps) {
    const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
        let value = resolve(translations[locale] as unknown as Record<string, unknown>, key);

        // Simple {{param}} interpolation
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
            }
        }

        return value;
    };

    return (
        <I18nContext.Provider value={{ locale, t }}>
            {children}
        </I18nContext.Provider>
    );
}

// ──────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────

export function useTranslation() {
    return useContext(I18nContext);
}

// Direct t function for non-component usage
export function t(key: string, params?: Record<string, string | number>): string {
    let value = resolve(fr as unknown as Record<string, unknown>, key);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
        }
    }
    return value;
}
