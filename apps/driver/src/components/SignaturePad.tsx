/**
 * Signature Pad Component
 * 
 * Touch-optimized signature canvas:
 * - Full-width drawing area
 * - Clear button
 * - Save as base64 PNG
 */

import { useRef, useEffect, useState } from 'react';
import SignaturePadLib from 'signature_pad';

interface SignaturePadProps {
    onSave: (base64: string) => void;
}

export default function SignaturePad({ onSave }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [signaturePad, setSignaturePad] = useState<SignaturePadLib | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    // Initialize signature pad
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const pad = new SignaturePadLib(canvas, {
            backgroundColor: 'rgb(255, 255, 255)',
            penColor: 'rgb(0, 0, 0)',
            minWidth: 2,
            maxWidth: 4,
        });

        // Handle resize
        const resizeCanvas = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * ratio;
            canvas.height = rect.height * ratio;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(ratio, ratio);
            }
            pad.clear();
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Track if signature is drawn
        pad.addEventListener('endStroke', () => {
            setIsEmpty(pad.isEmpty());
        });

        setSignaturePad(pad);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            pad.off();
        };
    }, []);

    // Clear signature
    const handleClear = () => {
        signaturePad?.clear();
        setIsEmpty(true);
        onSave('');
    };

    // Save signature
    const handleSave = () => {
        if (!signaturePad || signaturePad.isEmpty()) return;
        const base64 = signaturePad.toDataURL('image/png');
        onSave(base64);
    };

    return (
        <div className="flex flex-col gap-md">
            <div className="signature-container">
                <canvas
                    ref={canvasRef}
                    className="signature-canvas"
                    style={{ touchAction: 'none' }}
                />
            </div>
            <div className="flex gap-sm">
                <button className="btn btn-outline flex-1" onClick={handleClear}>
                    🗑️ Effacer
                </button>
                <button
                    className="btn btn-primary flex-1"
                    onClick={handleSave}
                    disabled={isEmpty}
                >
                    ✅ Valider
                </button>
            </div>
        </div>
    );
}
