'use client';

/**
 * Purchase Request Form
 * 
 * Form for submitting new Shop & Ship purchase requests.
 * UX: Trust-inspiring, clear steps, no rush.
 */

import { useState, FormEvent } from 'react';

interface PurchaseRequestFormProps {
    onSubmit: (data: PurchaseRequestData) => Promise<void>;
    destinationHubs: Array<{ id: string; name: string; country: string }>;
}

export interface PurchaseRequestData {
    productUrl: string;
    itemDescription: string;
    quantity: number;
    productOptions?: string;
    notes?: string;
    estimatedPriceXof?: number;
    destinationHubId: string;
}

export function PurchaseRequestForm({ onSubmit, destinationHubs }: PurchaseRequestFormProps) {
    const [formData, setFormData] = useState<PurchaseRequestData>({
        productUrl: '',
        itemDescription: '',
        quantity: 1,
        productOptions: '',
        notes: '',
        estimatedPriceXof: undefined,
        destinationHubId: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await onSubmit(formData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (field: keyof PurchaseRequestData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form className="purchase-form" onSubmit={handleSubmit}>
            {/* Product Information */}
            <div className="form-section">
                <h3>🛒 Informations Produit</h3>

                <div className="form-group">
                    <label htmlFor="productUrl">Lien du produit *</label>
                    <input
                        id="productUrl"
                        type="url"
                        placeholder="https://amazon.com/... ou https://aliexpress.com/..."
                        value={formData.productUrl}
                        onChange={(e) => handleChange('productUrl', e.target.value)}
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="itemDescription">Description du produit *</label>
                    <input
                        id="itemDescription"
                        type="text"
                        placeholder="Ex: iPhone 15 Pro Max 256GB Noir"
                        value={formData.itemDescription}
                        onChange={(e) => handleChange('itemDescription', e.target.value)}
                        required
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="quantity">Quantité *</label>
                        <input
                            id="quantity"
                            type="number"
                            min="1"
                            max="100"
                            value={formData.quantity}
                            onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 1)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="estimatedPrice">Prix estimé (FCFA)</label>
                        <input
                            id="estimatedPrice"
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="500000"
                            value={formData.estimatedPriceXof || ''}
                            onChange={(e) => handleChange('estimatedPriceXof', parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>
            </div>

            {/* Options */}
            <div className="form-section">
                <h3>⚙️ Options & Notes</h3>

                <div className="form-group">
                    <label htmlFor="productOptions">Options produit</label>
                    <input
                        id="productOptions"
                        type="text"
                        placeholder="Ex: Couleur noire, Taille XL, 128GB..."
                        value={formData.productOptions}
                        onChange={(e) => handleChange('productOptions', e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="notes">Notes additionnelles</label>
                    <textarea
                        id="notes"
                        placeholder="Instructions spéciales, préférences d'emballage..."
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                    />
                </div>
            </div>

            {/* Destination */}
            <div className="form-section">
                <h3>📍 Destination</h3>

                <div className="form-group">
                    <label htmlFor="destination">Point de retrait *</label>
                    <select
                        id="destination"
                        value={formData.destinationHubId}
                        onChange={(e) => handleChange('destinationHubId', e.target.value)}
                        required
                    >
                        <option value="">Sélectionner un point de retrait</option>
                        {destinationHubs.map(hub => (
                            <option key={hub.id} value={hub.id}>
                                {hub.name} ({hub.country})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="form-error" style={{
                    color: 'var(--color-error)',
                    marginBottom: 'var(--spacing-md)',
                    padding: 'var(--spacing-sm)',
                    background: '#fef2f2',
                    borderRadius: 'var(--border-radius)'
                }}>
                    {error}
                </div>
            )}

            {/* Submit */}
            <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Envoi en cours...' : 'Soumettre la demande'}
            </button>
        </form>
    );
}
