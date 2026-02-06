/**
 * Camera Capture Component
 * 
 * Touch-friendly photo capture:
 * - Access device camera
 * - Preview before confirm
 * - Return base64 string
 */

import { useRef, useState, useEffect } from 'react';

interface CameraCaptureProps {
    onCapture: (base64: string) => void;
    captured: string | null;
}

export default function CameraCapture({ onCapture, captured }: CameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Start camera stream
    const startCamera = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
            }
        } catch (err) {
            console.error('Camera error:', err);
            setError('Impossible d\'accéder à la caméra');
        }
    };

    // Stop camera stream
    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
            setIsStreaming(false);
        }
    };

    // Capture photo
    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas to video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame
        ctx.drawImage(video, 0, 0);

        // Get base64 (compressed JPEG)
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        onCapture(base64);
        stopCamera();
    };

    // Retake photo
    const retake = () => {
        onCapture('');
        startCamera();
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    // Show captured image
    if (captured) {
        return (
            <div className="flex flex-col gap-md">
                <div className="camera-preview">
                    <img src={captured} alt="Capture" />
                </div>
                <button className="btn btn-outline" onClick={retake}>
                    🔄 Reprendre la photo
                </button>
            </div>
        );
    }

    // Show camera or error
    return (
        <div className="flex flex-col gap-md">
            <div className="camera-preview">
                {isStreaming ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                    />
                ) : (
                    <div className="flex items-center justify-center" style={{ height: '100%' }}>
                        {error ? (
                            <p style={{ color: 'var(--color-danger)', textAlign: 'center', padding: 'var(--spacing-md)' }}>
                                {error}
                            </p>
                        ) : (
                            <p className="text-muted">Caméra non démarrée</p>
                        )}
                    </div>
                )}
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {isStreaming ? (
                <button className="btn btn-primary" onClick={capturePhoto}>
                    📸 Prendre la photo
                </button>
            ) : (
                <button className="btn btn-primary" onClick={startCamera}>
                    📷 Ouvrir la caméra
                </button>
            )}
        </div>
    );
}
