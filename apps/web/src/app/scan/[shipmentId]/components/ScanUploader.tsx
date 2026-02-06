'use client';

/**
 * Scan Uploader Component
 * 
 * Zone de téléchargement d'image avec drag & drop.
 */

import { useState, useRef, useCallback } from 'react';
import styles from './ScanUploader.module.css';

interface ScanUploaderProps {
    onUpload: (file: File) => void;
    isLoading?: boolean;
    disabled?: boolean;
}

export function ScanUploader({ onUpload, isLoading = false, disabled = false }: ScanUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (disabled) return;

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFileSelect(file);
        }
    }, [disabled]);

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);

        // Créer preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleClick = () => {
        if (!disabled && !isLoading) {
            fileInputRef.current?.click();
        }
    };

    const handleSubmit = () => {
        if (selectedFile && !isLoading) {
            onUpload(selectedFile);
        }
    };

    const handleReset = () => {
        setPreview(null);
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className={styles.container}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className={styles.hiddenInput}
                disabled={disabled || isLoading}
            />

            {!preview ? (
                <div
                    className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabled : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleClick}
                >
                    <div className={styles.dropzoneContent}>
                        <span className={styles.uploadIcon}>📷</span>
                        <p className={styles.dropzoneText}>
                            <strong>Cliquez</strong> ou glissez une image ici
                        </p>
                        <p className={styles.dropzoneHint}>
                            JPEG, PNG ou WebP • Max 10 Mo
                        </p>
                    </div>
                </div>
            ) : (
                <div className={styles.previewContainer}>
                    <img
                        src={preview}
                        alt="Aperçu"
                        className={styles.previewImage}
                    />

                    <div className={styles.previewOverlay}>
                        <p className={styles.fileName}>
                            {selectedFile?.name}
                        </p>
                    </div>

                    <div className={styles.actions}>
                        <button
                            className={styles.resetButton}
                            onClick={handleReset}
                            disabled={isLoading}
                        >
                            ✕ Changer
                        </button>

                        <button
                            className={styles.submitButton}
                            onClick={handleSubmit}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className={styles.spinner}></span>
                                    Envoi...
                                </>
                            ) : (
                                '🚀 Lancer le scan'
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
