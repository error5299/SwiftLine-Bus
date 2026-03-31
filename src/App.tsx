import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { useLanguage } from './hooks/useLanguage';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AdminPanel } from './pages/AdminPanel';
import { OperatorPanel } from './pages/OperatorPanel';
import { PassengerPanel } from './pages/PassengerPanel';
import { SupervisorPanel } from './pages/SupervisorPanel';
import { DriverPanel } from './pages/DriverPanel';
import { AboutUs } from './pages/AboutUs';
import { Contact } from './pages/Contact';
import { TrackTicket } from './pages/TrackTicket';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        console.log("User is authenticated:", currentUser.uid, currentUser.email);
        // Fetch user role from Firestore
        try {
          console.log("Fetching user doc for:", currentUser.uid);
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (currentUser.email === 'belayeth923@gmail.com') {
            setRole('admin');
            if (!userDoc.exists()) {
              await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                role: 'admin',
                createdAt: new Date().toISOString()
              });
            } else if (userDoc.data().role !== 'admin') {
              await updateDoc(doc(db, 'users', currentUser.uid), { role: 'admin' });
            }
          } else if (userDoc.exists()) {
            console.log("User doc exists:", userDoc.data());
            setRole(userDoc.data().role);
          } else if (currentUser.email) {
            console.log("User doc does not exist, checking staff_emails or staff_credentials for:", currentUser.email);
            
            // Handle generated staff emails
            if (currentUser.email.endsWith('@swiftline.staff')) {
              const customId = currentUser.email.split('@')[0];
              const q = query(collection(db, 'staff_credentials'), where('id', '==', customId));
              const snapshot = await getDocs(q);
              if (!snapshot.empty) {
                const staffData = snapshot.docs[0].data();
                setRole(staffData.role);
                // Save to users collection for future fast access
                await setDoc(doc(db, 'users', currentUser.uid), {
                  email: currentUser.email,
                  role: staffData.role,
                  customId: customId,
                  profileId: snapshot.docs[0].id,
                  createdAt: new Date().toISOString()
                });
                return;
              }
            }

            // Check staff_emails collection by email
            const staffDoc = await getDoc(doc(db, 'staff_emails', currentUser.email));
            if (staffDoc.exists()) {
              console.log("Staff doc exists:", staffDoc.data());
              const staffData = staffDoc.data();
              setRole(staffData.role);
              // Also save to users collection for future fast access
              await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                role: staffData.role,
                profileId: staffData.profileId,
                createdAt: new Date().toISOString()
              });
            } else if (currentUser.email === 'staff@swiftline.com') {
              // Handle custom ID login
              const customStaffId = localStorage.getItem('customStaffId');
              console.log("Custom staff login, ID:", customStaffId);
              if (customStaffId) {
                const { collection, query, where, getDocs } = await import('firebase/firestore');
                const q = query(collection(db, 'staff_credentials'), where('id', '==', customStaffId));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                  const staffData = snapshot.docs[0].data();
                  setRole(staffData.role);
                  await setDoc(doc(db, 'users', currentUser.uid), {
                    email: currentUser.email,
                    role: staffData.role,
                    customId: customStaffId,
                    profileId: snapshot.docs[0].id,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            } else {
              console.log("Checking operators/supervisors collections");
              // Check operators and supervisors collections if not in users
              const opDoc = await getDoc(doc(db, 'operators', currentUser.uid));
              if (opDoc.exists()) {
                setRole('operator');
              } else {
                const supDoc = await getDoc(doc(db, 'supervisors', currentUser.uid));
                if (supDoc.exists()) {
                  setRole('supervisor');
                } else {
                  setRole('passenger');
                }
              }
            }
          } else {
            setRole('passenger');
          }
        } catch (err) {
          console.error("Error fetching role:", err);
          setRole('passenger');
        }
      } else {
        console.log("User is not authenticated");
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loginPaths = ['/login'];
    if (user && role && loginPaths.includes(location.pathname)) {
      if (role === 'admin') navigate('/admin-portal');
      else if (role === 'operator') navigate('/operator-panel');
      else if (role === 'supervisor') navigate('/supervisor-panel');
      else if (role === 'driver') navigate('/driver-panel');
      else navigate('/');
    }
  }, [user, role, location.pathname, navigate]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-bg-off font-bold text-primary animate-pulse">SwiftLine Loading...</div>;

  const isFullScreenRoute = ['/admin-portal', '/operator-panel', '/', '/track-bus', '/driver-panel', '/supervisor-panel'].includes(location.pathname);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg-off flex flex-col">
        <Header />

        <main className="flex-grow">
          <div className={isFullScreenRoute ? "w-full py-8 px-4 md:px-8" : "max-w-7xl mx-auto py-8 px-6"}>
            <Routes>
              <Route path="/" element={<PassengerPanel />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/track-ticket" element={<TrackTicket />} />
              <Route path="/track-bus" element={<PassengerPanel initialTracking={true} />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Login onSuccess={() => {}} />} />
              
              {/* Hidden Management Routes */}
              <Route path="/admin-portal" element={<AdminPanel />} />
              
              {/* Role-based panels */}
              <Route path="/operator-panel" element={<OperatorPanel />} />
              <Route path="/supervisor-panel" element={<SupervisorPanel />} />
              <Route path="/driver-panel" element={<DriverPanel />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>

        <Footer />
      </div>
    </ErrorBoundary>
  );
}
