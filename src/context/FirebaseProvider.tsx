import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useNotification } from './NotificationContext';

const FirebaseContext = createContext<{
  data: any;
  user: any;
  role: string | null;
  isAdmin: boolean;
  isAuthReady: boolean;
} | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<any>({});
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const { addNotification } = useNotification();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      let currentRole = null;
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            currentRole = userDoc.data().role;
          } else if (currentUser.email) {
            const staffEmailDoc = await getDoc(doc(db, 'staff_emails', currentUser.email));
            if (staffEmailDoc.exists()) {
              currentRole = staffEmailDoc.data().role;
            }
          }
        } catch (e) {
          console.error("Error checking role", e);
          addNotification("Error checking user role. Please try again.", "error");
        }
      } else {
        const savedAdmin = localStorage.getItem('admin_session');
        if (savedAdmin) {
          currentRole = 'admin';
        }
      }
      
      setRole(currentRole);
      setIsAdmin(currentRole === 'admin');
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, [addNotification]);

  useEffect(() => {
    const publicCollections = [
      'trips', 'counters', 'operators', 'routes', 'buses', 'tripCounterTimes', 'notifications'
    ];
    
    const adminCollections = [
      'bookings', 'security_logs', 'deletedTrips', 
      'crew', 'passengers', 'tripTemplates', 'counterTimeTemplates'
    ];

    const collectionsToFetch = isAdmin 
      ? [...publicCollections, ...adminCollections] 
      : publicCollections;

    const unsubs: (() => void)[] = [];

    collectionsToFetch.forEach(col => {
      try {
        const q = col === 'notifications' || col === 'security_logs' 
          ? query(collection(db, col), orderBy('timestamp', 'desc'))
          : collection(db, col);

        const unsub = onSnapshot(q, (snapshot) => {
          setData((prev: any) => {
            // Only update if data actually changed to reduce re-renders
            const newData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (JSON.stringify(prev[col]) === JSON.stringify(newData)) return prev;
            
            return {
              ...prev,
              [col]: newData
            };
          });
        }, (err) => {
          console.warn(`Firestore error for collection ${col}:`, err.message);
          addNotification(`Error loading ${col}: ${err.message}`, "error");
        });
        unsubs.push(unsub);
      } catch (e) {
        console.error(`Error setting up listener for ${col}:`, e);
        addNotification(`Error setting up listener for ${col}.`, "error");
      }
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [isAdmin, addNotification]);

  return (
    <FirebaseContext.Provider value={{ data, user, role, isAdmin, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebaseData = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebaseData must be used within a FirebaseProvider');
  return context.data;
};

export const useAuth = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useAuth must be used within a FirebaseProvider');
  return {
    user: context.user,
    role: context.role,
    isAdmin: context.isAdmin,
    isAuthReady: context.isAuthReady
  };
};
