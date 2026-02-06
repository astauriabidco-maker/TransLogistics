/**
 * Login Page
 * 
 * Simple driver authentication:
 * - Phone number input
 * - PIN entry
 * - Large touch targets
 * - Offline detection
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { OfflineError, ApiRequestError } from '../lib/api';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(phone, pin);
            navigate('/route');
        } catch (err) {
            if (err instanceof OfflineError) {
                setError('Connexion impossible hors ligne');
            } else if (err instanceof ApiRequestError) {
                setError(err.message);
            } else {
                setError('Erreur de connexion');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="app-container">
            <div className="page flex-col items-center justify-center gap-lg">
                {/* Logo / Title */}
                <div className="text-center">
                    <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--spacing-sm)' }}>
                        🚚 TransLogistics
                    </h1>
                    <p className="text-muted">Application Chauffeur</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-md" style={{ maxWidth: '400px' }}>
                    {/* Phone Input */}
                    <div className="input-group">
                        <label className="input-label" htmlFor="phone">
                            Numéro de téléphone
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            className="input"
                            placeholder="+221 77 123 4567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            autoComplete="tel"
                            required
                        />
                    </div>

                    {/* PIN Input */}
                    <div className="input-group">
                        <label className="input-label" htmlFor="pin">
                            Code PIN
                        </label>
                        <input
                            id="pin"
                            type="password"
                            inputMode="numeric"
                            className="input"
                            placeholder="••••"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            maxLength={4}
                            pattern="[0-9]{4}"
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div
                            style={{
                                padding: 'var(--spacing-md)',
                                background: 'rgba(239, 68, 68, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-danger)',
                                textAlign: 'center',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <span className="spinner" />
                                Connexion...
                            </>
                        ) : (
                            'Se connecter'
                        )}
                    </button>
                </form>

                {/* Offline indicator */}
                {!navigator.onLine && (
                    <div className="text-muted text-center" style={{ fontSize: 'var(--font-size-sm)' }}>
                        ⚠️ Mode hors ligne - connexion requise
                    </div>
                )}
            </div>
        </div>
    );
}
