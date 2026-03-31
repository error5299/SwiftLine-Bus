import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, serverTimestamp, where, getDocs, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { Counter, Operator, Route, Bus, Crew, Passenger, WalletTransaction, Trip, RouteStop, TripCounterTime, Booking, TripTemplate, CounterTimeTemplate } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { Plus, Edit2, Trash2, Wallet, Map, Bus as BusIcon, Users, UserCheck, ShieldCheck, Search, X, LogIn, Navigation, LayoutDashboard, TrendingUp, Activity, Clock, LogOut, Globe, Printer, Map as MapIcon, Star, Filter, ChevronRight, Wifi, Coffee, Zap, Info, MapPin, History as HistoryIcon, AlertCircle, Shield, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Login } from '../components/Login';
import { RouteMapper } from '../components/RouteMapper';
import { SeatMap } from '../components/SeatMap';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';
import { formatInTimeZone } from 'date-fns-tz';
import { safeFormat, safeGetTime } from '../utils/dateUtils';
import { RealTimeClock } from '../components/RealTimeClock';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';

const TZ = 'Asia/Dhaka';

export const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracking' | 'counters' | 'operators' | 'routes' | 'fleet' | 'crew' | 'passengers' | 'trips' | 'tripHistory' | 'tripCounterTimes' | 'tripTemplates' | 'security'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripTemplates, setTripTemplates] = useState<TripTemplate[]>([]);
  const [counterTimeTemplates, setCounterTimeTemplates] = useState<CounterTimeTemplate[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tripCounterTimes, setTripCounterTimes] = useState<TripCounterTime[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    ipWhitelisting: false,
    twoFactorAuth: true,
    sessionTimeout: 30,
    allowedIPs: ['127.0.0.1', '192.168.1.1']
  });
  
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ collection: string, id: string } | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');
  const [selectedTripForBookings, setSelectedTripForBookings] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [dashboardDate, setDashboardDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Stats for Dashboard
  const stats = {
    totalRevenue: bookings.filter(b => b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0),
    activeTrips: trips.filter(t => t.status === 'departed').length,
    totalBuses: buses.length,
    totalPassengers: passengers.length,
    todayTrips: trips.filter(t => new Date(t.departureTime).toDateString() === new Date().toDateString()).length
  };

  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayBookings = bookings.filter(b => b.status === 'confirmed' && b.bookingDate?.startsWith(dateStr));
    const dayRevenue = dayBookings.reduce((acc, b) => acc + (b.totalFare || 0), 0);
    const dayTrips = trips.filter(t => t.date === dateStr).length;
    return {
      name: format(date, 'MMM dd'),
      revenue: dayRevenue,
      trips: dayTrips,
    };
  }).reverse();

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const filteredData = (data: any[]) => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(term)
      )
    );
  };

  useEffect(() => {
    if (editingItem && activeTab === 'routes') {
      setRouteStops(editingItem.stops || []);
    } else {
      setRouteStops([]);
    }
  }, [editingItem, activeTab]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        let role = null;
        
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          role = userDoc.data().role;
        } else if (currentUser.email) {
          const staffEmailDoc = await getDoc(doc(db, 'staff_emails', currentUser.email));
          if (staffEmailDoc.exists()) {
            role = staffEmailDoc.data().role;
            await setDoc(doc(db, 'users', currentUser.uid), {
              email: currentUser.email,
              role: role,
              createdAt: new Date().toISOString()
            });
          }
        }

        if (role === 'admin') {
          setIsAdmin(true);
        }
      } else {
        const savedAdmin = localStorage.getItem('admin_session');
        if (savedAdmin) {
          const adminData = JSON.parse(savedAdmin);
          setUser(adminData);
          setIsAdmin(true);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  const [deletedTrips, setDeletedTrips] = useState<{ coachNumber: string, baseDepartureTime: string }[]>([]);
  
  useEffect(() => {
    if (!isAdmin) return;

    const unsubDeletedTrips = onSnapshot(collection(db, 'deletedTrips'), (snapshot) => {
      setDeletedTrips(snapshot.docs.map(doc => doc.data() as { coachNumber: string, baseDepartureTime: string }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'deletedTrips'));

    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'counters'));

    const unsubOperators = onSnapshot(collection(db, 'operators'), (snapshot) => {
      setOperators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'operators'));

    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'routes'));

    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));

    const unsubCrew = onSnapshot(collection(db, 'crew'), (snapshot) => {
      setCrew(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Crew)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'crew'));

    const unsubPassengers = onSnapshot(collection(db, 'passengers'), (snapshot) => {
      setPassengers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'passengers'));

    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      const updatedTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(updatedTrips);
      setSelectedTrip(prev => {
        if (!prev) return null;
        const updated = updatedTrips.find(t => t.id === prev.id);
        return updated || null;
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookings'));

    const unsubTripCounterTimes = onSnapshot(collection(db, 'tripCounterTimes'), (snapshot) => {
      setTripCounterTimes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripCounterTime)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tripCounterTimes'));

    const unsubTripTemplates = onSnapshot(collection(db, 'tripTemplates'), (snapshot) => {
      setTripTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripTemplate)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tripTemplates'));

    const unsubCounterTimeTemplates = onSnapshot(collection(db, 'counterTimeTemplates'), (snapshot) => {
      setCounterTimeTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CounterTimeTemplate)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'counterTimeTemplates'));

    const unsubNotifications = onSnapshot(query(collection(db, 'notifications'), orderBy('timestamp', 'desc')), (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSecurityLogs = onSnapshot(query(collection(db, 'security_logs'), orderBy('timestamp', 'desc')), (snapshot) => {
      setSecurityLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubCounters();
      unsubOperators();
      unsubRoutes();
      unsubBuses();
      unsubCrew();
      unsubPassengers();
      unsubTrips();
      unsubBookings();
      unsubTripCounterTimes();
      unsubTripTemplates();
      unsubCounterTimeTemplates();
      unsubNotifications();
      unsubSecurityLogs();
    };
  }, [isAdmin]);

  // Audit Log Helper
  const logAdminAction = async (action: string, collectionName: string, data: any) => {
    try {
      await addDoc(collection(db, 'security_logs'), {
        action,
        collection: collectionName,
        data: JSON.parse(JSON.stringify(data)), // Ensure it's serializable
        user: auth.currentUser?.email || 'Unknown Admin',
        timestamp: serverTimestamp(),
        type: 'admin_action'
      });
    } catch (err) {
      console.error('Error logging admin action:', err);
    }
  };

  // Recurring Trip Logic: Automatically generate trips for the next 7 days if repeatDaily is true
  useEffect(() => {
    if (!isAdmin || tripTemplates.length === 0) return;

    const generateRecurringTrips = async () => {
      const recurringTemplates = tripTemplates.filter(t => t.repeatDaily);
      
      for (const template of recurringTemplates) {
        // Generate for the next 7 days
        for (let i = 0; i < 7; i++) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + i);
          
          const [hours, minutes] = template.baseDepartureTime.split(':').map(Number);
          targetDate.setHours(hours, minutes, 0, 0);

          const alreadyExists = trips.some(t => 
            t.templateId === template.id && 
            new Date(t.date).toDateString() === targetDate.toDateString()
          );

          if (!alreadyExists) {
            // Check if in blacklist (using coach and time as fallback if templateId not available in blacklist)
            const isBlacklisted = deletedTrips.some(dt => (dt.templateId === template.id) || (dt.coachNumber === template.coachNumber && dt.baseDepartureTime === template.baseDepartureTime));
            if (isBlacklisted) continue;

            try {
              const { id, ...templateData } = template;
              const newDateStr = format(targetDate, 'yyyy-MM-dd');
              const newTripRef = await addDoc(collection(db, 'trips'), {
                ...templateData,
                templateId: template.id,
                date: newDateStr,
                departureTime: `${newDateStr}T${template.baseDepartureTime}`,
                status: 'scheduled',
                bookedSeats: []
              });
              
              // Copy counterTimeTemplates to tripCounterTimes
              const originalCounterTimes = counterTimeTemplates.filter(ct => ct.templateId === template.id);
              for (const ct of originalCounterTimes) {
                const { id: ctId, ...ctData } = ct;
                await addDoc(collection(db, 'tripCounterTimes'), {
                  tripId: newTripRef.id,
                  counterId: ctData.counterId,
                  arrivalTime: ctData.arrivalTimeOffset.toString(),
                  departureTime: ctData.departureTimeOffset.toString(),
                  isReportingCounter: ctData.isReportingCounter
                });
              }
              
              console.log(`Generated recurring trip from template ${template.name} for ${targetDate.toDateString()}`);
            } catch (err) {
              console.error("Error generating recurring trip:", err);
            }
          }
        }
      }
    };

    const timeoutId = setTimeout(() => {
      generateRecurringTrips();
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [isAdmin, tripTemplates.length, trips.length, counterTimeTemplates.length, deletedTrips.length]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    
    try {
      if (user && user.id) {
        const adminRef = doc(db, 'admins', user.id);
        await updateDoc(adminRef, { password: newPassword });
        setPasswordSuccess('Password changed successfully');
        setNewPassword('');
        setConfirmPassword('');
        
        // Update local session
        const updatedUser = { ...user, password: newPassword };
        setUser(updatedUser);
        localStorage.setItem('admin_session', JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('Failed to change password');
    }
  };

  const handleCustomLogin = async (id: string, pass: string) => {
    setLoginError(null);
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      
      // First verify in Firestore
      const q = query(collection(db, 'admins'), where('customId', '==', id), where('password', '==', pass));
      const snap = await getDocs(q);
      
      let adminData: any = null;
      if (!snap.empty) {
        adminData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      } else {
        const allAdmins = await getDocs(collection(db, 'admins'));
        if (allAdmins.empty && id === 'admin' && pass === 'admin') {
          const newAdmin = { customId: 'admin', password: 'admin', name: 'Super Admin', role: 'admin' };
          const docRef = await addDoc(collection(db, 'admins'), newAdmin);
          adminData = { id: docRef.id, ...newAdmin };
        }
      }

      if (adminData) {
        const adminEmail = adminData.email || `${id}@swiftline.admin`;
        
        // Try to sign in with Firebase Auth
        try {
          const userCredential = await signInWithEmailAndPassword(auth, adminEmail, pass);
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: adminEmail,
            role: 'admin',
            profileId: adminData.id,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          setUser(adminData);
          setIsAdmin(true);
          localStorage.setItem('admin_session', JSON.stringify(adminData));
        } catch (authErr: any) {
          if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-email') {
            try {
              const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, pass);
              await setDoc(doc(db, 'users', userCredential.user.uid), {
                email: adminEmail,
                role: 'admin',
                profileId: adminData.id,
                createdAt: new Date().toISOString()
              });
              setUser(adminData);
              setIsAdmin(true);
              localStorage.setItem('admin_session', JSON.stringify(adminData));
            } catch (createErr: any) {
              if (createErr.code === 'auth/email-already-in-use') {
                setLoginError('Invalid ID or Password.');
              } else {
                setLoginError(createErr.message);
              }
            }
          } else {
            setLoginError(authErr.message);
          }
        }
      } else {
        setLoginError('Invalid ID or Password.');
      }
    } catch (err) {
      setLoginError('Error during login.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsAdmin(false);
    localStorage.removeItem('admin_session');
  };

  if (!isAuthReady) return null;

  if (!isAdmin) {
    return (
      <Login 
        title="Admin Login" 
        onLogin={handleCustomLogin} 
        error={loginError} 
      />
    );
  }

  const printTicket = (booking: Booking) => {
    const trip = trips.find(t => t.id === booking.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const passenger = passengers.find(p => p.id === booking.passengerId);
    const bus = buses.find(b => b.id === trip?.busId);
    const boarding = counters.find(c => c.id === booking.boardingStopId);
    const dropping = counters.find(c => c.id === booking.droppingStopId);

    printTicketHTML(
      booking,
      trip,
      route,
      boarding,
      dropping,
      bus,
      passenger,
      `ticket-qrcode-${booking.id}`
    );
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
      alert('Login failed');
    }
  };

  const handleAddData = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Check for duplicate Custom ID for operators and crew
    if (activeTab === 'operators' || activeTab === 'crew') {
      const customId = formData.get('customId') as string;
      const q = query(collection(db, 'staff_credentials'), where('id', '==', customId));
      const snapshot = await getDocs(q);
      
      const isDuplicate = snapshot.docs.some(doc => doc.id !== editingItem?.id);
      if (isDuplicate) {
        alert('This Custom ID is already in use. Please use a unique ID.');
        return;
      }
    }
    let data: any = {};
    let collectionName = activeTab;

    try {
      if (activeTab === 'counters') {
        const selectedDestinations = Array.from(e.currentTarget.querySelectorAll('input[name="allowedDestinationCounters"]:checked')).map((el: any) => el.value);
        data = {
          name: formData.get('name') as string,
          location: formData.get('location') as string,
          walletBalance: Number(formData.get('walletBalance')) || 0,
          allowedDestinationCounters: selectedDestinations,
          status: formData.get('status') as 'active' | 'inactive' || 'active',
          isReportingCounter: formData.get('isReportingCounter') === 'on',
        };
      } else if (activeTab === 'routes') {
        data = {
          name: formData.get('name') as string,
          stops: routeStops,
          orderedCounterList: routeStops.map(s => s.counterId),
        };
      } else if (activeTab === 'trips') {
        const selectedBoarding = Array.from(e.currentTarget.querySelectorAll('input[name="boardingPoints"]:checked')).map((el: any) => el.value);
        const selectedDropping = Array.from(e.currentTarget.querySelectorAll('input[name="droppingPoints"]:checked')).map((el: any) => el.value);
        const saveAsTemplate = formData.get('saveAsTemplate') === 'on';
        
        data = {
          coachNumber: formData.get('coachNumber') as string,
          routeId: formData.get('routeId') as string,
          busId: formData.get('busId') as string,
          date: formData.get('date') as string,
          baseDepartureTime: formData.get('baseDepartureTime') as string,
          arrivalTime: formData.get('arrivalTime') as string,
          departureTime: `${formData.get('date')}T${formData.get('baseDepartureTime')}`,
          fare: Number(formData.get('fare')) || 500,
          status: 'scheduled',
          currentStopIndex: 0,
          stopLogs: [],
          repeatDaily: formData.get('repeatDaily') === 'on',
          boardingPoints: selectedBoarding,
          droppingPoints: selectedDropping,
        };

        if (saveAsTemplate && !editingItem) {
          const templateData = {
            name: `Template for ${data.coachNumber}`,
            coachNumber: data.coachNumber,
            routeId: data.routeId,
            busId: data.busId,
            baseDepartureTime: data.baseDepartureTime,
            fare: data.fare,
            repeatDaily: data.repeatDaily,
            boardingPoints: data.boardingPoints,
            droppingPoints: data.droppingPoints
          };
          await addDoc(collection(db, 'tripTemplates'), templateData);
        }
      } else if (activeTab === 'fleet') {
        collectionName = 'buses';
        data = {
          regNo: formData.get('regNo') as string,
          model: formData.get('model') as string,
          isAC: formData.get('isAC') === 'on',
          capacity: Number(formData.get('capacity')) || 40,
          layout: formData.get('layout') as any || '2+2',
          isWiFi: formData.get('isWiFi') === 'on',
          isFood: formData.get('isFood') === 'on',
          isCharging: formData.get('isCharging') === 'on',
        };
      } else if (activeTab === 'operators') {
        data = {
          name: formData.get('name') as string,
          email: formData.get('email') as string,
          counterId: formData.get('counterId') as string,
          role: 'operator',
          customId: formData.get('customId') as string,
          password: formData.get('password') as string,
        };
        // Also ensure user role is set in 'users' collection
        // Note: In a real app, we'd use a cloud function to create the auth user
      } else if (activeTab === 'crew') {
        data = {
          name: formData.get('name') as string,
          role: (formData.get('role') as string).toLowerCase() as 'driver' | 'supervisor' | 'helper',
          phone: formData.get('phone') as string,
          email: formData.get('email') as string,
          customId: formData.get('customId') as string,
          password: formData.get('password') as string,
        };
      } else if (activeTab === 'tripTemplates') {
        const selectedBoarding = Array.from(e.currentTarget.querySelectorAll('input[name="boardingPoints"]:checked')).map((el: any) => el.value);
        const selectedDropping = Array.from(e.currentTarget.querySelectorAll('input[name="droppingPoints"]:checked')).map((el: any) => el.value);
        data = {
          name: formData.get('name') as string,
          coachNumber: formData.get('coachNumber') as string,
          routeId: formData.get('routeId') as string,
          busId: formData.get('busId') as string,
          baseDepartureTime: formData.get('baseDepartureTime') as string,
          fare: Number(formData.get('fare')) || 500,
          repeatDaily: formData.get('repeatDaily') === 'on',
          boardingPoints: selectedBoarding,
          droppingPoints: selectedDropping,
        };
      } else if (activeTab === 'counterTimeTemplates') {
        data = {
          templateId: formData.get('templateId') as string,
          counterId: formData.get('counterId') as string,
          arrivalTimeOffset: Number(formData.get('arrivalTimeOffset')) || 0,
          departureTimeOffset: Number(formData.get('departureTimeOffset')) || 0,
          isReportingCounter: formData.get('isReportingCounter') === 'on',
        };
      } else if (activeTab === 'passengers') {
        data = {
          name: formData.get('name') as string,
          phone: formData.get('phone') as string,
          email: formData.get('email') as string,
          totalTrips: Number(formData.get('totalTrips')) || 0,
        };
      } else if (activeTab === 'tripCounterTimes') {
        data = {
          tripId: formData.get('tripId') as string,
          counterId: formData.get('counterId') as string,
          arrivalTime: formData.get('arrivalTime') as string,
          departureTime: formData.get('departureTime') as string,
          isReportingCounter: formData.get('isReportingCounter') === 'on',
        };
      }

      if (editingItem) {
        await updateDoc(doc(db, collectionName, editingItem.id), data);
        await logAdminAction('update', collectionName, { id: editingItem.id, ...data });
        
        // Update staff credentials and emails if it's a staff member
        if (activeTab === 'operators' || activeTab === 'crew') {
          await setDoc(doc(db, 'staff_emails', data.email), {
            role: activeTab === 'operators' ? 'operator' : data.role,
            profileId: editingItem.id
          });
          
          await setDoc(doc(db, 'staff_credentials', editingItem.id), {
            id: data.customId,
            password: data.password,
            email: data.email,
            role: activeTab === 'operators' ? 'operator' : data.role
          });
        }
      } else {
        const id = data.customId || crypto.randomUUID();
        await setDoc(doc(db, collectionName, id), data);
        const docRef = { id };
        await logAdminAction('create', collectionName, { id, ...data });
        
        // If it's an operator, supervisor, or driver, we might want to pre-provision their role
        if (activeTab === 'operators' || activeTab === 'crew') {
          // We can't set the 'users' doc yet because we don't have their UID
          // But we can store the email mapping
          await setDoc(doc(db, 'staff_emails', data.email), {
            role: activeTab === 'operators' ? 'operator' : data.role,
            profileId: docRef.id
          });
          
          // Save credentials for custom ID login
          await setDoc(doc(db, 'staff_credentials', docRef.id), {
            id: data.customId,
            password: data.password,
            email: data.email,
            role: activeTab === 'operators' ? 'operator' : data.role
          });
        }
      }
      setShowModal(false);
      setEditingItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, collectionName);
    }
  };

  const handleReloadWallet = async (counterId: string, amount: number) => {
    const counter = counters.find(c => c.id === counterId);
    if (!counter) return;

    try {
      await updateDoc(doc(db, 'counters', counterId), {
        walletBalance: counter.walletBalance + amount
      });
      await addDoc(collection(db, 'walletTransactions'), {
        counterId,
        amount,
        type: 'reload',
        timestamp: serverTimestamp(),
        description: `Admin reload: ${amount}`,
        status: 'completed'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'walletTransactions');
    }
  };

  const handleResetAllTracking = async () => {
    if (!window.confirm('Are you sure you want to reset live tracking for all active trips?')) return;
    try {
      const activeTrips = trips.filter(t => t.status === 'departed');
      console.log('Active trips to reset:', activeTrips);
      for (const trip of activeTrips) {
        await updateDoc(doc(db, 'trips', trip.id), {
          currentLocation: null,
          nextStopId: null
        });
      }
      alert('All tracking reset successfully.');
    } catch (err) {
      console.error('Error resetting all tracking:', err);
      handleFirestoreError(err, OperationType.WRITE, 'trips/resetAllTracking');
    }
  };

  const handleResetCounterTracking = async () => {
    if (!selectedCounterId) {
      alert('Please select a counter.');
      return;
    }
    if (!window.confirm(`Are you sure you want to reset tracking for trips at this counter?`)) return;
    try {
      const tripsAtCounter = trips.filter(t => t.nextStopId === selectedCounterId);
      console.log('Trips at counter to reset:', tripsAtCounter);
      for (const trip of tripsAtCounter) {
        await updateDoc(doc(db, 'trips', trip.id), {
          currentLocation: null,
          nextStopId: null
        });
      }
      alert('Tracking reset successfully for selected counter.');
    } catch (err) {
      console.error('Error resetting counter tracking:', err);
      handleFirestoreError(err, OperationType.WRITE, 'trips/resetCounterTracking');
    }
  };

  const handleDelete = async (collectionName: string, id: string) => {
    if (collectionName === 'trips') {
      const tripToDelete = trips.find(t => t.id === id);
      if (tripToDelete && tripToDelete.templateId) {
        if (window.confirm('This is a recurring trip. Do you want to delete all future scheduled instances of this trip? History will be preserved.')) {
          // Add to deletedTrips collection to blacklist
          await addDoc(collection(db, 'deletedTrips'), {
            templateId: tripToDelete.templateId,
            coachNumber: tripToDelete.coachNumber,
            baseDepartureTime: tripToDelete.baseDepartureTime,
            deletedAt: new Date().toISOString()
          });
          // Delete all future scheduled instances
          const now = new Date().toISOString();
          const q = query(
            collection(db, 'trips'), 
            where('templateId', '==', tripToDelete.templateId),
            where('status', '==', 'scheduled'),
            where('departureTime', '>', now)
          );
          const snapshot = await getDocs(q);
          for (const doc of snapshot.docs) {
            await deleteDoc(doc.ref);
          }
          return;
        }
      }
    }
    setDeleteConfirm({ collection: collectionName, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, deleteConfirm.collection, deleteConfirm.id));
      await logAdminAction('delete', deleteConfirm.collection, { id: deleteConfirm.id });
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, deleteConfirm.collection);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50/50 -m-4 lg:-m-8">
      {/* Sidebar Navigation */}
      <div className="lg:w-72 glass-hard-dark text-white flex flex-col h-screen sticky top-0 shadow-2xl z-20">
        <div className="p-8 flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
          <div className="bg-white p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-500">
            <BusIcon className="text-accent" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter">SwiftLine</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 leading-none mt-1">Admin Portal</p>
          </div>
        </div>

        <div className="px-8 mb-6 lg:hidden">
          <RealTimeClock />
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'counters', label: 'Counters', icon: Wallet },
            { id: 'routes', label: 'Routes', icon: Navigation },
            { id: 'tripTemplates', label: 'Trip Templates', icon: Star },
            { id: 'counterTimeTemplates', label: 'Counter Time Templates', icon: Clock },
            { id: 'trips', label: 'Daily Trips', icon: Map },
            { id: 'tripHistory', label: 'Trip History', icon: Clock },
            { id: 'tripCounterTimes', label: 'Counter Times', icon: Clock },
            { id: 'fleet', label: 'Fleet', icon: BusIcon },
            { id: 'tracking', label: 'Live Tracking', icon: MapPin },
            { id: 'operators', label: 'Operators', icon: UserCheck },
            { id: 'crew', label: 'Crew', icon: Users },
            { id: 'passengers', label: 'Passengers', icon: Users },
            { id: 'security', label: 'Security', icon: ShieldCheck },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-300 group",
                activeTab === tab.id 
                  ? "bg-white/20 text-white shadow-lg shadow-black/5" 
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <tab.icon size={20} className={`transition-transform duration-500 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} />
              <span className="text-sm tracking-wide">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-white/60 hover:bg-red-500/20 hover:text-red-100 transition-all duration-300 group"
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-bg-off">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex-1 max-w-xl">
            <h2 className="text-2xl font-black text-slate-800">SwiftLine Admin</h2>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:block">
              <RealTimeClock />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-3 bg-slate-50 rounded-2xl text-slate-600 hover:text-primary transition-all relative"
              >
                <Activity size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-80 glass-hard rounded-3xl shadow-2xl z-50 overflow-hidden border border-white/50"
                  >
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50">
                      <h4 className="font-black uppercase tracking-tight text-xs">Notifications</h4>
                      <button 
                        onClick={async () => {
                          for (const n of notifications.filter(n => !n.read)) {
                            await updateDoc(doc(db, 'notifications', n.id), { read: true });
                          }
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        Mark all as read
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto p-2 space-y-1">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs font-bold">No notifications</div>
                      ) : (
                        notifications.map(n => (
                          <div key={n.id} className={cn("p-4 rounded-2xl transition-all", n.read ? "opacity-60" : "bg-white/80 shadow-sm border border-white")}>
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-accent">{n.type}</span>
                              <span className="text-[9px] text-slate-400">{n.timestamp ? format(n.timestamp.toDate(), 'hh:mm a') : 'Just now'}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-700 leading-relaxed">{n.message}</p>
                            <p className="text-[9px] text-slate-400 mt-1 uppercase font-black tracking-tighter">From: {n.senderName || 'System'}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-slate-800 leading-none">{user?.displayName || 'Admin User'}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Super Admin</p>
              </div>
              <img 
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName || 'Admin'}&background=001F3F&color=fff`} 
                alt="Profile" 
                className="w-10 h-10 rounded-xl border-2 border-slate-50 shadow-sm"
              />
            </div>
          </div>
        </header>

        <main className="p-8 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-accent">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'counters' && 'Counter Management'}
              {activeTab === 'operators' && 'Operator Management'}
              {activeTab === 'routes' && 'Route Management'}
              {activeTab === 'trips' && 'Trip Management'}
              {activeTab === 'tripHistory' && 'Trip History'}
              {activeTab === 'fleet' && 'Fleet Management'}
              {activeTab === 'crew' && 'Crew Management'}
              {activeTab === 'passengers' && 'Passenger Management'}
              {activeTab === 'tracking' && 'Live Tracking'}
              {activeTab === 'security' && 'Security'}
            </h2>
            {activeTab !== 'dashboard' && activeTab !== 'tracking' && activeTab !== 'tripHistory' && activeTab !== 'security' && (
              <button
                onClick={() => { setEditingItem(null); setShowModal(true); }}
                className="bg-accent text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={20} />
                <span>Add New</span>
              </button>
            )}
            {(activeTab === 'trips' || activeTab === 'tripHistory') && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </div>

        <div className="space-y-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Revenue', value: `৳ ${bookings.filter(b => b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0).toLocaleString()}`, icon: TrendingUp, color: 'text-accent', bg: 'glass-hard' },
                  { label: 'Active Trips', value: trips.filter(t => t.status === 'departed').length, icon: Activity, color: 'text-emerald-600', bg: 'glass-hard' },
                  { label: 'Total Buses', value: buses.length, icon: BusIcon, color: 'text-teal-600', bg: 'glass-hard' },
                  { label: 'Total Passengers', value: passengers.length, icon: Users, color: 'text-green-600', bg: 'glass-hard' },
                ].map((stat, i) => (
                  <div key={i} className={`${stat.bg} p-6 rounded-[32px] shadow-sm border border-white/50 relative overflow-hidden group hover:scale-[1.02] transition-all`}>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <stat.icon size={120} />
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-3 rounded-2xl bg-slate-50", stat.color)}>
                        <stat.icon size={24} />
                      </div>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                    <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stat.value}</h3>
                  </div>
                ))}
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-hard p-8 rounded-[32px] border border-white/50 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Revenue Overview</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                      <TrendingUp size={12} />
                      Last 7 Days
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                        <Tooltip 
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '12px'}}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#F27D26" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-hard p-8 rounded-[32px] border border-white/50 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Trip Volume</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                      <BusIcon size={12} />
                      Weekly Stats
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                        <Tooltip 
                          cursor={{fill: '#f8fafc'}}
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '12px'}}
                        />
                        <Bar dataKey="trips" fill="#28a745" radius={[6, 6, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recent Activity & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Trips on {safeFormat(dashboardDate, 'MMM dd, yyyy')}</h3>
                    <div className="flex items-center gap-4">
                      <input 
                        type="date" 
                        value={dashboardDate}
                        onChange={(e) => setDashboardDate(e.target.value)}
                        className="input-field py-1 px-3 text-sm w-auto"
                      />
                      <button onClick={() => setActiveTab('trips')} className="text-xs font-bold text-primary hover:underline">View All</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-6 py-4">Bus No</th>
                          <th className="px-6 py-4">Route</th>
                          <th className="px-6 py-4">Time</th>
                          <th className="px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[...trips]
                          .filter(t => t.date === dashboardDate)
                          .sort((a, b) => safeGetTime(a.departureTime) - safeGetTime(b.departureTime))
                          .slice(0, 5)
                          .map(trip => {
                            const bus = buses.find(b => b.id === trip.busId);
                            const route = routes.find(r => r.id === trip.routeId);
                            return (
                              <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-accent">{bus?.regNo || trip.busId}</td>
                                <td className="px-6 py-4 text-sm text-slate-500">{route?.name || trip.routeId}</td>
                                <td className="px-6 py-4 text-sm font-medium text-slate-500">
                                  <div className="flex items-center gap-2">
                                    <Clock size={14} />
                                    {safeFormat(trip.departureTime, 'hh:mm a, dd MMM')}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    trip.status === 'departed' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                                  )}>
                                    {trip.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Quick Actions</h3>
                    <div className="space-y-3">
                      <button 
                        onClick={handleResetAllTracking}
                        className="w-full p-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-red-100 transition-all border border-red-100 shadow-sm"
                      >
                        <Activity size={18} />
                        Reset All Live Updates
                      </button>
                      <button 
                        onClick={() => setActiveTab('tripTemplates')}
                        className="w-full p-4 bg-accent/5 text-accent rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-accent/10 transition-all border border-accent/10 shadow-sm"
                      >
                        <Star size={18} />
                        Manage Trip Templates
                      </button>
                      <button 
                        onClick={() => { setEditingItem(null); setShowModal(true); setActiveTab('trips'); }}
                        className="w-full p-4 bg-primary/5 text-primary rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-primary/10 transition-all border border-primary/10 shadow-sm"
                      >
                        <Plus size={18} />
                        Create New Daily Trip
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setActiveTab('trips')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-left">
                        <Map className="text-primary group-hover:text-white mb-2" size={20} />
                        <p className="text-xs font-bold">New Trip</p>
                      </button>
                      <button onClick={() => setActiveTab('fleet')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-left">
                        <BusIcon className="text-primary group-hover:text-white mb-2" size={20} />
                        <p className="text-xs font-bold">Add Bus</p>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'dashboard' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {activeTab === 'counters' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Location</th>
                        <th className="px-6 py-4">Balance</th>
                        <th className="px-6 py-4">Revenue</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredData(counters).map(counter => {
                        const counterRevenue = bookings.filter(b => b.bookedByCounterId === counter.id && b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0);
                        return (
                        <tr key={counter.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800">{counter.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{counter.location}</td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-emerald-600">৳ {counter.walletBalance.toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-accent">৳ {counterRevenue.toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button onClick={() => handleReloadWallet(counter.id, 5000)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Top-up 5000">
                              <Plus size={18} />
                            </button>
                            <button onClick={() => { setEditingItem(counter); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDelete('counters', counter.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}

          {activeTab === 'routes' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Stops</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(routes).map(route => (
                    <tr key={route.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{route.name}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {route.stops.map((stop, idx) => {
                            const counterId = typeof stop === 'string' ? stop : stop.counterId;
                            const counter = counters.find(c => c.id === counterId);
                            return (
                              <span key={idx} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                {counter?.name || counterId}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => { setEditingItem(route); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete('routes', route.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'tripTemplates' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Template Name</th>
                    <th className="px-6 py-4">Coach ID</th>
                    <th className="px-6 py-4">Route</th>
                    <th className="px-6 py-4">Base Time</th>
                    <th className="px-6 py-4">Repeat</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(tripTemplates).map(template => {
                    const route = routes.find(r => r.id === template.routeId);
                    return (
                      <tr key={template.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{template.name}</td>
                        <td className="px-6 py-4 font-bold text-accent">{template.coachNumber}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{route?.name || 'Unknown Route'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {template.baseDepartureTime}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            template.repeatDaily ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          )}>
                            {template.repeatDaily ? 'Daily' : 'Once'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingItem(template); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete('tripTemplates', template.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Template">
                            <Trash2 size={18} />
                          </button>
                          {template.repeatDaily && (
                            <button 
                              onClick={async () => {
                                if (window.confirm('Are you sure you want to delete all future scheduled trips for this template? History will be preserved.')) {
                                  await addDoc(collection(db, 'deletedTrips'), {
                                    templateId: template.id,
                                    coachNumber: template.coachNumber,
                                    baseDepartureTime: template.baseDepartureTime,
                                    deletedAt: new Date().toISOString()
                                  });
                                  const now = new Date().toISOString();
                                  const q = query(
                                    collection(db, 'trips'), 
                                    where('templateId', '==', template.id),
                                    where('status', '==', 'scheduled'),
                                    where('departureTime', '>', now)
                                  );
                                  const snapshot = await getDocs(q);
                                  for (const doc of snapshot.docs) {
                                    await deleteDoc(doc.ref);
                                  }
                                  alert('All future scheduled trips for this template have been deleted.');
                                }
                              }} 
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Delete All Recurring Trips"
                            >
                              <HistoryIcon size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'counterTimeTemplates' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Trip Template</th>
                    <th className="px-6 py-4">Counter</th>
                    <th className="px-6 py-4">Arrival Offset (min)</th>
                    <th className="px-6 py-4">Departure Offset (min)</th>
                    <th className="px-6 py-4">Reporting</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(counterTimeTemplates).map(ctt => {
                    const template = tripTemplates.find(t => t.id === ctt.templateId);
                    const counter = counters.find(c => c.id === ctt.counterId);
                    return (
                      <tr key={ctt.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{template?.name || ctt.templateId}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500">{counter?.name || ctt.counterId}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{ctt.arrivalTimeOffset}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{ctt.departureTimeOffset}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-black uppercase",
                            ctt.isReportingCounter ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                          )}>
                            {ctt.isReportingCounter ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingItem(ctt); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete('counterTimeTemplates', ctt.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'trips' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Coach ID</th>
                    <th className="px-6 py-4">Route</th>
                    <th className="px-6 py-4">Departure</th>
                    <th className="px-6 py-4">Arrival</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(trips)
                    .filter(t => t.date === selectedDate)
                    .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
                    .map(trip => {
                    const route = routes.find(r => r.id === trip.routeId);
                    return (
                      <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-accent">{trip.coachNumber}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{route?.name || 'Unknown Route'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {safeFormat(trip.departureTime, 'hh:mm a, dd MMM')}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {safeFormat(`${trip.date}T${trip.arrivalTime}`, 'hh:mm a')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            trip.status === 'scheduled' ? "bg-blue-100 text-blue-700" :
                            trip.status === 'departed' ? "bg-emerald-100 text-emerald-700" :
                            "bg-red-100 text-red-700"
                          )}>
                            {trip.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => setSelectedTripForBookings(trip)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Bookings"
                          >
                            <Users size={18} />
                          </button>
                          <button onClick={() => { setEditingItem(trip); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete('trips', trip.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'tripHistory' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Coach ID</th>
                    <th className="px-6 py-4">Route</th>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Total Revenue</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(trips)
                    .filter(t => t.date === selectedDate)
                    .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
                    .map(trip => {
                    const route = routes.find(r => r.id === trip.routeId);
                    const tripBookings = bookings.filter(b => b.tripId === trip.id);
                    const revenue = tripBookings.reduce((sum, b) => sum + b.totalFare, 0);
                    return (
                      <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-accent">{trip.coachNumber}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{route?.name || 'Unknown Route'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {safeFormat(trip.departureTime, 'hh:mm a, dd MMM yyyy')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            trip.status === 'scheduled' ? "bg-blue-100 text-blue-700" :
                            trip.status === 'departed' ? "bg-emerald-100 text-emerald-700" :
                            "bg-slate-100 text-slate-700"
                          )}>
                            {trip.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-600">
                          ৳ {revenue}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => setSelectedTripForBookings(trip)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Bookings"
                          >
                            <Users size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'fleet' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Reg No</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Seats</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(buses).map(bus => (
                    <tr key={bus.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{bus.regNo}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          bus.isAC ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        )}>
                          {bus.isAC ? 'AC' : 'Non-AC'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-500">{bus.capacity} ({bus.layout})</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => { setEditingItem(bus); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete('buses', bus.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'operators' && (
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <LogIn size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Operator Login URL</h4>
                  <p className="text-xs text-slate-500 font-mono">{window.location.origin}/operator-panel</p>
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Counter</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(operators).map(op => {
                    const counter = counters.find(c => c.id === op.counterId);
                    return (
                      <tr key={op.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{op.name}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500">{op.email}</td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold uppercase text-slate-600">
                            {counter?.name || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingItem(op); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete('operators', op.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {activeTab === 'crew' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <LogIn size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Supervisor Login URL</h4>
                    <p className="text-xs text-slate-500 font-mono">{window.location.origin}/supervisor-panel</p>
                  </div>
                </div>
                <div className="p-4 bg-accent/5 border border-accent/10 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center text-accent">
                    <LogIn size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Driver Login URL</h4>
                    <p className="text-xs text-slate-500 font-mono">{window.location.origin}/driver-panel</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(crew).map(member => (
                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{member.name}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold uppercase text-slate-600">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">{member.phone}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => { setEditingItem(member); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete('crew', member.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Security Settings */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="glass-hard p-8 rounded-[32px] border border-white/50 shadow-sm">
                    <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 mb-6 flex items-center gap-2">
                      <ShieldCheck className="text-accent" />
                      Security Controls
                    </h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <div>
                          <p className="text-sm font-black uppercase tracking-tight text-slate-700">IP Whitelisting</p>
                          <p className="text-[10px] font-bold text-slate-400">Restrict access to specific IPs</p>
                        </div>
                        <button 
                          onClick={() => setSecuritySettings(prev => ({ ...prev, ipWhitelisting: !prev.ipWhitelisting }))}
                          className={cn("w-12 h-6 rounded-full transition-all relative", securitySettings.ipWhitelisting ? "bg-accent" : "bg-slate-300")}
                        >
                          <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", securitySettings.ipWhitelisting ? "left-7" : "left-1")} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <div>
                          <p className="text-sm font-black uppercase tracking-tight text-slate-700">Two-Factor Auth</p>
                          <p className="text-[10px] font-bold text-slate-400">Require 2FA for staff logins</p>
                        </div>
                        <button 
                          onClick={() => setSecuritySettings(prev => ({ ...prev, twoFactorAuth: !prev.twoFactorAuth }))}
                          className={cn("w-12 h-6 rounded-full transition-all relative", securitySettings.twoFactorAuth ? "bg-accent" : "bg-slate-300")}
                        >
                          <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", securitySettings.twoFactorAuth ? "left-7" : "left-1")} />
                        </button>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                        <p className="text-sm font-black uppercase tracking-tight text-slate-700">Allowed IP Addresses</p>
                        <div className="flex flex-wrap gap-2">
                          {securitySettings.allowedIPs.map(ip => (
                            <span key={ip} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 flex items-center gap-2">
                              {ip}
                              <button onClick={() => setSecuritySettings(prev => ({ ...prev, allowedIPs: prev.allowedIPs.filter(i => i !== ip) }))} className="text-red-400 hover:text-red-600">×</button>
                            </span>
                          ))}
                          <button className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[10px] font-bold text-accent">+ Add IP</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-hard p-8 rounded-[32px] border border-white/50 shadow-sm bg-red-50/30">
                    <h3 className="text-lg font-black uppercase tracking-tight text-red-600 mb-4 flex items-center gap-2">
                      <AlertCircle size={20} />
                      Danger Zone
                    </h3>
                    <button className="w-full p-4 bg-white border border-red-100 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 transition-all">
                      Revoke All Sessions
                    </button>
                  </div>
                </div>

                {/* Audit Logs */}
                <div className="lg:col-span-2 glass-hard p-8 rounded-[32px] border border-white/50 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <HistoryIcon className="text-accent" />
                      Security Audit Logs
                    </h3>
                    <button className="text-xs font-bold text-primary hover:underline">Download CSV</button>
                  </div>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                    {securityLogs.length === 0 ? (
                      <div className="py-20 text-center space-y-4">
                        <div className="inline-flex bg-slate-50 p-6 rounded-full text-slate-200">
                          <ShieldCheck size={48} />
                        </div>
                        <p className="text-slate-400 font-bold">No security events recorded</p>
                      </div>
                    ) : (
                      securityLogs.map((log, i) => (
                        <div key={i} className="p-4 bg-white/50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:bg-white transition-all">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "p-3 rounded-xl",
                              log.type === 'login' ? "bg-emerald-50 text-emerald-600" : 
                              log.type === 'failed_login' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                            )}>
                              {log.type === 'login' ? <UserCheck size={18} /> : <Shield size={18} />}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800">{log.action || log.message}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                  <User size={10} /> {log.userEmail || 'Unknown'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                  <Globe size={10} /> {log.ip || '0.0.0.0'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {log.timestamp ? format(log.timestamp.toDate(), 'MMM dd, HH:mm') : 'Recently'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Password Change Section */}
              <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <ShieldCheck className="text-emerald-500" />
                  Change Password
                </h3>
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {passwordError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium">
                      {passwordSuccess}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
                    <input 
                      type="password" 
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Confirm Password</label>
                    <input 
                      type="password" 
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                  </div>
                  
                  <button 
                    type="submit"
                    className="w-full py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                  >
                    Update Password
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'passengers' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Total Trips</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(passengers).map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">{p.phone}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{p.email}</td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-accent">{p.totalTrips || 0}</span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => { setEditingItem(p); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete('passengers', p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-4">
                <div className="card">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">Active Trips</h3>
                    <div className="flex gap-2">
                      <select onChange={(e) => setSelectedCounterId(e.target.value)} className="text-xs border rounded p-1">
                        <option value="">Select Counter</option>
                        {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={handleResetCounterTracking} className="text-xs text-red-500 hover:underline">Reset Counter</button>
                      <button onClick={handleResetAllTracking} className="text-xs text-red-500 hover:underline">Reset All</button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {trips.filter(t => t.status === 'departed').map(trip => {
                      const route = routes.find(r => r.id === trip.routeId);
                      const bus = buses.find(b => b.id === trip.busId);
                      return (
                        <button
                          key={trip.id}
                          onClick={() => setSelectedTrip(trip)}
                          className={cn(
                            "w-full p-4 rounded-xl border text-left transition-all",
                            selectedTrip?.id === trip.id 
                              ? "bg-accent/5 border-accent shadow-sm" 
                              : "bg-white border-slate-100 hover:border-slate-200"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-slate-800">{route?.name}</span>
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">
                              {trip.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 space-y-1">
                            <div className="flex items-center gap-1">
                              <BusIcon size={12} /> {bus?.regNo} ({trip.coachNumber})
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={12} /> {safeFormat(trip.departureTime, 'hh:mm a')}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {trips.filter(t => t.status === 'departed').length === 0 && (
                      <p className="text-center text-slate-400 py-8 italic text-sm">
                        No active trips found
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="card h-full min-h-[500px] flex flex-col">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <MapPin className="text-accent" />
                    Live Map
                  </h3>
                  {selectedTrip?.currentLocation ? (
                    <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center animate-pulse">
                        <Navigation className="text-accent" size={40} />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-800">
                          {routes.find(r => r.id === selectedTrip.routeId)?.name}
                        </h4>
                        <p className="text-slate-500">
                          Current Location: {selectedTrip.currentLocation.lat.toFixed(6)}, {selectedTrip.currentLocation.lng.toFixed(6)}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          Last Updated: {safeFormat(selectedTrip.currentLocation.timestamp, 'hh:mm:ss a')}
                        </p>
                      </div>
                      <div className="w-full max-w-md p-4 bg-white rounded-xl border border-slate-100 shadow-sm text-left">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-slate-700">Bus Info</span>
                          <span className="text-xs text-primary font-bold">{buses.find(b => b.id === selectedTrip.busId)?.regNo}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Coach No</span>
                            <span className="font-medium">{selectedTrip.coachNumber}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Next Stop</span>
                            <span className="font-medium text-accent">
                              {counters.find(c => c.id === selectedTrip.nextStopId)?.name || 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <a 
                        href={`https://www.google.com/maps?q=${selectedTrip.currentLocation.lat},${selectedTrip.currentLocation.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-accent text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                      >
                        <MapPin size={18} />
                        View on Google Maps
                      </a>
                    </div>
                  ) : (
                    <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center p-8 text-center">
                      <div className="bg-white p-6 rounded-full shadow-sm mb-4">
                        <Navigation size={48} className="text-slate-200" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-400">
                        {selectedTrip ? 'No location data available for this trip' : 'Select a trip to see live tracking'}
                      </h4>
                      <p className="text-sm text-slate-400 mt-2 max-w-xs">
                        Live location will appear here once the supervisor starts tracking.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tripCounterTimes' && (
            <div className="card overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trip</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Counter</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Arrival</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Departure</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reporting</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(tripCounterTimes).map(tct => {
                    const trip = trips.find(t => t.id === tct.tripId);
                    const counter = counters.find(c => c.id === tct.counterId);
                    return (
                      <tr key={tct.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{trip?.coachNumber || tct.tripId}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500">{counter?.name || tct.counterId}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{tct.arrivalTime}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{tct.departureTime}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-black uppercase",
                            tct.isReportingCounter ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                          )}>
                            {tct.isReportingCounter ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingItem(tct); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete('tripCounterTimes', tct.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  </main>
</div>

      {/* Modal for adding/editing */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-accent/40 backdrop-blur-md">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative animate-in fade-in zoom-in duration-300 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">
                {editingItem ? 'Edit Item' : 'Add New'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-accent hover:bg-accent/10 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddData} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {activeTab === 'counters' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Location</label>
                    <input name="location" defaultValue={editingItem?.location} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Wallet Balance</label>
                    <input name="walletBalance" type="number" defaultValue={editingItem?.walletBalance || 0} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Allowed Destination Counters</label>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl max-h-40 overflow-y-auto">
                      {counters.filter(c => c.id !== editingItem?.id).map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                          <input 
                            type="checkbox" 
                            name="allowedDestinationCounters" 
                            value={c.id} 
                            defaultChecked={editingItem?.allowedDestinationCounters?.includes(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                      <input 
                        type="checkbox" 
                        name="isReportingCounter" 
                        defaultChecked={editingItem?.isReportingCounter}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Reporting Counter
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Status</label>
                    <select name="status" defaultValue={editingItem?.status || 'active'} className="input-field">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'routes' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required placeholder="Dhaka - Kushtia" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route Mapper</label>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <RouteMapper 
                        stops={routeStops} 
                        onChange={setRouteStops} 
                        counters={counters} 
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'trips' && (
                <div className="grid grid-cols-2 gap-4">
                  {!editingItem && (
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Load From Template</label>
                      <select 
                        className="input-field"
                        onChange={(e) => {
                          const template = tripTemplates.find(t => t.id === e.target.value);
                          if (template) {
                            const form = e.target.closest('form');
                            if (form) {
                              (form.elements.namedItem('routeId') as HTMLSelectElement).value = template.routeId;
                              (form.elements.namedItem('busId') as HTMLSelectElement).value = template.busId;
                              (form.elements.namedItem('coachNumber') as HTMLInputElement).value = template.coachNumber;
                              (form.elements.namedItem('baseDepartureTime') as HTMLInputElement).value = template.baseDepartureTime;
                              (form.elements.namedItem('fare') as HTMLInputElement).value = template.fare.toString();
                              (form.elements.namedItem('repeatDaily') as HTMLInputElement).checked = template.repeatDaily;
                              
                              const boardingChecks = form.querySelectorAll('input[name="boardingPoints"]');
                              boardingChecks.forEach((cb: any) => cb.checked = template.boardingPoints.includes(cb.value));
                              
                              const droppingChecks = form.querySelectorAll('input[name="droppingPoints"]');
                              droppingChecks.forEach((cb: any) => cb.checked = template.droppingPoints.includes(cb.value));
                            }
                          }
                        }}
                      >
                        <option value="">Select Template</option>
                        {tripTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route</label>
                    <select name="routeId" defaultValue={editingItem?.routeId} className="input-field" required>
                      <option value="">Select Route</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Bus</label>
                    <select name="busId" defaultValue={editingItem?.busId} className="input-field" required>
                      <option value="">Select Bus</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.regNo} ({b.isAC ? 'AC' : 'Non-AC'})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Coach No</label>
                    <input name="coachNumber" defaultValue={editingItem?.coachNumber} className="input-field" required placeholder="501" />
                  </div>
                  <input name="date" type="hidden" value={editingItem?.date || selectedDate} />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Departure Time</label>
                    <input name="baseDepartureTime" type="time" defaultValue={editingItem?.baseDepartureTime || '06:00'} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Arrival Time</label>
                    <input name="arrivalTime" type="time" defaultValue={editingItem?.arrivalTime || '12:00'} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fare</label>
                    <input name="fare" type="number" defaultValue={editingItem?.fare} className="input-field" required />
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="repeatDaily" type="checkbox" defaultChecked={editingItem?.repeatDaily} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">Repeat Daily</label>
                  </div>
                  {!editingItem && (
                    <div className="flex items-center gap-3 px-6 py-4 bg-blue-50 rounded-2xl">
                      <input name="saveAsTemplate" type="checkbox" className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <label className="text-sm font-bold text-blue-700">Save as Template</label>
                    </div>
                  )}
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Boarding Points</label>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl max-h-40 overflow-y-auto">
                      {counters.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                          <input 
                            type="checkbox" 
                            name="boardingPoints" 
                            value={c.id} 
                            defaultChecked={editingItem?.boardingPoints?.includes(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Dropping Points</label>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl max-h-40 overflow-y-auto">
                      {counters.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                          <input 
                            type="checkbox" 
                            name="droppingPoints" 
                            value={c.id} 
                            defaultChecked={editingItem?.droppingPoints?.includes(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tripTemplates' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Template Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required placeholder="Daily Dhaka Express" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route</label>
                    <select name="routeId" defaultValue={editingItem?.routeId} className="input-field" required>
                      <option value="">Select Route</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Bus</label>
                    <select name="busId" defaultValue={editingItem?.busId} className="input-field" required>
                      <option value="">Select Bus</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.regNo} ({b.isAC ? 'AC' : 'Non-AC'})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Coach No</label>
                    <input name="coachNumber" defaultValue={editingItem?.coachNumber} className="input-field" required placeholder="501" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Base Departure Time</label>
                    <input name="baseDepartureTime" type="time" defaultValue={editingItem?.baseDepartureTime || '06:00'} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fare</label>
                    <input name="fare" type="number" defaultValue={editingItem?.fare} className="input-field" required />
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="repeatDaily" type="checkbox" defaultChecked={editingItem?.repeatDaily} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">Repeat Daily</label>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Boarding Points</label>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl max-h-40 overflow-y-auto">
                      {counters.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                          <input 
                            type="checkbox" 
                            name="boardingPoints" 
                            value={c.id} 
                            defaultChecked={editingItem?.boardingPoints?.includes(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Dropping Points</label>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl max-h-40 overflow-y-auto">
                      {counters.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-primary">
                          <input 
                            type="checkbox" 
                            name="droppingPoints" 
                            value={c.id} 
                            defaultChecked={editingItem?.droppingPoints?.includes(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'counterTimeTemplates' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Trip Template</label>
                    <select name="templateId" defaultValue={editingItem?.templateId} className="input-field" required>
                      <option value="">Select Trip Template</option>
                      {tripTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Counter</label>
                    <select name="counterId" defaultValue={editingItem?.counterId} className="input-field" required>
                      <option value="">Select Counter</option>
                      {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Arrival Offset (min)</label>
                      <input name="arrivalTimeOffset" type="number" defaultValue={editingItem?.arrivalTimeOffset || 0} className="input-field" required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Departure Offset (min)</label>
                      <input name="departureTimeOffset" type="number" defaultValue={editingItem?.departureTimeOffset || 0} className="input-field" required />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="isReportingCounter" type="checkbox" defaultChecked={editingItem?.isReportingCounter} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">Reporting Counter</label>
                  </div>
                </>
              )}

              {activeTab === 'fleet' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Registration No</label>
                    <input name="regNo" defaultValue={editingItem?.regNo} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Model</label>
                    <input name="model" defaultValue={editingItem?.model} className="input-field" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Capacity</label>
                      <input name="capacity" type="number" defaultValue={editingItem?.capacity || 40} className="input-field" required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Layout</label>
                      <select name="layout" defaultValue={editingItem?.layout || '2+2'} className="input-field">
                        <option value="2+2">2+2</option>
                        <option value="1+2">1+2</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isAC" type="checkbox" defaultChecked={editingItem?.isAC} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">AC Bus</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isWiFi" type="checkbox" defaultChecked={editingItem?.isWiFi} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">WiFi</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isFood" type="checkbox" defaultChecked={editingItem?.isFood} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">Food</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isCharging" type="checkbox" defaultChecked={editingItem?.isCharging} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">Charging</label>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'operators' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Custom ID</label>
                    <input name="customId" defaultValue={editingItem?.customId} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Password</label>
                    <input name="password" type="password" defaultValue={editingItem?.password} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Counter</label>
                    <select name="counterId" defaultValue={editingItem?.counterId} className="input-field" required>
                      <option value="">Select Counter</option>
                      {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'crew' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Custom ID</label>
                    <input name="customId" defaultValue={editingItem?.customId} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Password</label>
                    <input name="password" type="password" defaultValue={editingItem?.password} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Role</label>
                    <select name="role" defaultValue={editingItem?.role || 'driver'} className="input-field" required>
                      <option value="driver">Driver</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="helper">Helper</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone</label>
                    <input name="phone" defaultValue={editingItem?.phone} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" required />
                  </div>
                </>
              )}

              {activeTab === 'passengers' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone</label>
                    <input name="phone" defaultValue={editingItem?.phone} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Total Trips</label>
                    <input name="totalTrips" type="number" defaultValue={editingItem?.totalTrips || 0} className="input-field" />
                  </div>
                </>
              )}

              {activeTab === 'tripCounterTimes' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Trip</label>
                    <select name="tripId" defaultValue={editingItem?.tripId} className="input-field" required>
                      <option value="">Select Trip</option>
                      {trips.map(t => <option key={t.id} value={t.id}>{t.coachNumber} - {routes.find(r => r.id === t.routeId)?.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Counter</label>
                    <select name="counterId" defaultValue={editingItem?.counterId} className="input-field" required>
                      <option value="">Select Counter</option>
                      {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Arrival Time</label>
                      <input name="arrivalTime" type="time" defaultValue={editingItem?.arrivalTime} className="input-field" required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Departure Time</label>
                      <input name="departureTime" type="time" defaultValue={editingItem?.departureTime} className="input-field" required />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="isReportingCounter" type="checkbox" defaultChecked={editingItem?.isReportingCounter} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">Reporting Counter</label>
                  </div>
                </>
              )}

              <button type="submit" className="w-full btn-primary py-4 shadow-lg shadow-primary/20">
                {editingItem ? 'Update' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center mb-6">
              <div className="bg-red-50 p-4 rounded-2xl text-red-600">
                <Trash2 size={32} />
              </div>
            </div>
            <h3 className="text-xl font-black text-center text-slate-800 mb-2">
              Confirm Delete
            </h3>
            <p className="text-slate-500 text-center mb-8 text-sm">
              Are you sure you want to delete this? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3.5 font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3.5 font-bold text-white bg-red-600 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Trip Bookings Modal */}
      {selectedTripForBookings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button 
              onClick={() => setSelectedTripForBookings(null)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-primary">Booking Information</h3>
                  <p className="text-slate-500 font-medium">Coach: {selectedTripForBookings.coachNumber}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <SeatMap
                  capacity={buses.find(b => b.id === selectedTripForBookings.busId)?.capacity || 40}
                  bookedSeats={bookings.filter(b => b.tripId === selectedTripForBookings.id).flatMap(b => b.seats)}
                  femaleBookedSeats={bookings.filter(b => b.tripId === selectedTripForBookings.id && b.gender === 'female').flatMap(b => b.seats)}
                  selectedSeats={[]}
                  lockedSeats={[]}
                  onSeatClick={() => {}}
                  bookings={bookings.filter(b => b.tripId === selectedTripForBookings.id)}
                  passengers={passengers}
                  onReprint={printTicket}
                />
                
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-700">Booking List</h4>
                  <div className="space-y-2">
                    {bookings.filter(b => b.tripId === selectedTripForBookings.id).map(booking => {
                      const passenger = passengers.find(p => p.id === booking.passengerId);
                      return (
                        <div key={booking.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-800">{passenger?.name}</div>
                            <div className="text-xs text-slate-500">{booking.seats.join(', ')}</div>
                          </div>
                          <button 
                            onClick={() => printTicket(booking)}
                            className="p-2 text-primary hover:bg-white rounded-lg transition-all"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
