/**
 * Status Banner Component
 * 
 * Shows online/offline status at top of screen
 */

interface StatusBannerProps {
    isOffline: boolean;
    isSyncing?: boolean;
}

export default function StatusBanner({ isOffline, isSyncing }: StatusBannerProps) {
    if (!isOffline && !isSyncing) {
        return null;
    }

    if (isSyncing) {
        return (
            <div className="status-banner syncing">
                🔄 Synchronisation en cours...
            </div>
        );
    }

    return (
        <div className="status-banner offline">
            ⚠️ Mode hors ligne - Les données seront synchronisées
        </div>
    );
}
