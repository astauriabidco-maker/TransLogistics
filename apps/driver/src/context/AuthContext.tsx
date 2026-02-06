/**
 * Authentication Context
 * 
 * Manages driver session with:
 * - Persistent login via IndexedDB
 * - Auto-restore on app open
 * - Token refresh (future)
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type DriverSession, saveSession, getSession, clearSession } from '../lib/offlineStore';
import { login as apiLogin, type LoginResponse } from '../lib/api';

interface AuthContextValue {
    session: DriverSession | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (phone: string, pin: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<DriverSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        async function restoreSession() {
            try {
                const stored = await getSession();
                if (stored) {
                    // Check if token is expired
                    const expiresAt = new Date(stored.expiresAt);
                    if (expiresAt > new Date()) {
                        setSession(stored);
                    } else {
                        // Token expired, clear it
                        await clearSession();
                    }
                }
            } catch (error) {
                console.error('Failed to restore session:', error);
            } finally {
                setIsLoading(false);
            }
        }
        restoreSession();
    }, []);

    const login = async (phone: string, pin: string) => {
        const response: LoginResponse = await apiLogin(phone, pin);
        const newSession: DriverSession = {
            driverId: response.driver.id,
            userId: response.driver.userId,
            name: response.driver.name,
            phone: response.driver.phone,
            token: response.token,
            expiresAt: response.expiresAt,
        };
        await saveSession(newSession);
        setSession(newSession);
    };

    const logout = async () => {
        await clearSession();
        setSession(null);
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                isLoading,
                isAuthenticated: !!session,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
