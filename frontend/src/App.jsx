import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import { LoadingSpinner, ErrorState } from './components/UIState';
import BDManagerDashboard from './pages/BDManagerDashboard';
import BDExecutiveDashboard from './pages/BDExecutiveDashboard';
import SurveyManagerDashboard from './pages/SurveyManagerDashboard';
import SurveyExecutiveDashboard from './pages/SurveyExecutiveDashboard';
import MobileDeviceFrame from './components/MobileDeviceFrame';

function RoleHome() {
  const { currentUser, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingSpinner message="Authenticating and loading persona workspace..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <ErrorState
          title="Initialization Error"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <ErrorState
          title="No Persona Selected"
          message="No active user found. Please ensure the backend is running and the database has been seeded."
        />
      </div>
    );
  }

  // Switch home screen by persona
  switch (currentUser.role) {
    case 'bd_manager':
      return <BDManagerDashboard />;
    case 'bd_executive':
      return (
        <MobileDeviceFrame title="BD Executive Mobile App">
          <BDExecutiveDashboard />
        </MobileDeviceFrame>
      );
    case 'survey_manager':
      return <SurveyManagerDashboard />;
    case 'survey_executive':
      return (
        <MobileDeviceFrame title="Survey Executive Mobile App">
          <SurveyExecutiveDashboard />
        </MobileDeviceFrame>
      );
    default:
      return <BDManagerDashboard />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-x-hidden w-full">
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8">
            <Routes>
              <Route path="/" element={<RoleHome />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}
