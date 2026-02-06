/**
 * Driver PWA - Main App
 * 
 * Simple routing:
 * - / → Login (if unauthenticated) or Route (if authenticated)
 * - /route → Daily route list
 * - /delivery/:id → Single delivery focus
 */

import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RoutePage from './pages/RoutePage';
import DeliveryPage from './pages/DeliveryPage';
import { useEffect } from 'react';
import { syncPendingActions } from './lib/syncService';

// Protected route wrapper
function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="page flex items-center justify-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Public route (redirect if authenticated)
function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="page flex items-center justify-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/route" replace />;
  }

  return <Outlet />;
}

function AppContent() {
  // Trigger sync on app load if online
  useEffect(() => {
    if (navigator.onLine) {
      syncPendingActions();
    }
  }, []);

  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/route" element={<RoutePage />} />
        <Route path="/delivery/:deliveryId" element={<DeliveryPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/route" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
