import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { useLanguage } from './hooks/useLanguage';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MobileNavBar } from './components/MobileNavBar';
import { AdminPanel } from './pages/AdminPanel';
import { OperatorPanel } from './pages/OperatorPanel';
import { PassengerPanel } from './pages/PassengerPanel';
import { SupervisorPanel } from './pages/SupervisorPanel';
import { DriverPanel } from './pages/DriverPanel';
import { AboutUs } from './pages/AboutUs';
import { Contact } from './pages/Contact';
import { TrackPage } from './pages/TrackPage';
import { JourneyHub } from './pages/JourneyHub';
import { TicketsPage } from './pages/TicketsPage';
import { Support } from './pages/Support';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ScrollToTop } from './components/ScrollToTop';

import { useAuth } from './context/FirebaseProvider';

export default function App() {
  const { user, role, isAuthReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthReady && user && location.pathname === '/login') {
      // Redirect based on role
      if (role === 'admin') navigate('/admin');
      else if (role === 'operator') navigate('/operator');
      else if (role === 'supervisor') navigate('/supervisor');
      else if (role === 'driver') navigate('/driver');
      else navigate('/passenger');
    }
  }, [isAuthReady, user, role, location.pathname, navigate]);

  const hideGlobalUI = [
    '/admin', '/operator', '/supervisor', '/driver', '/login'
  ].some(path => location.pathname.startsWith(path));

  const showMobileNav = ![
    '/admin', '/operator', '/supervisor', '/driver', '/login'
  ].some(path => location.pathname.startsWith(path));

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ScrollToTop />
      <div className="min-h-screen bg-bg-off flex flex-col">
        {!hideGlobalUI && <Header />}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<PassengerPanel />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/operator" element={<OperatorPanel />} />
            <Route path="/passenger" element={<PassengerPanel />} />
            <Route path="/supervisor" element={<SupervisorPanel />} />
            <Route path="/driver" element={<DriverPanel />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/help" element={<Support />} />
            <Route path="/track" element={<TrackPage />} />
            <Route path="/track-journey" element={<JourneyHub />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route 
              path="/login" 
              element={
                user ? (
                  role ? (
                    <Navigate to={
                      role === 'admin' ? '/admin' :
                      role === 'operator' ? '/operator' :
                      role === 'supervisor' ? '/supervisor' :
                      role === 'driver' ? '/driver' :
                      '/passenger'
                    } replace />
                  ) : (
                    <div className="min-h-screen flex items-center justify-center">
                      <LoadingSpinner />
                    </div>
                  )
                ) : (
                  <Login />
                )
              } 
            />
          </Routes>
        </main>
        {!hideGlobalUI && <Footer />}
        {showMobileNav && <MobileNavBar />}
      </div>
    </ErrorBoundary>
  );
}
