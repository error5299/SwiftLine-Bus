import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { Counter, Operator, Route, Bus, Crew, Passenger, WalletTransaction, Trip, RouteStop, TripCounterTime, Booking } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { Plus, Edit2, Trash2, Wallet, Map, Bus as BusIcon, Users, UserCheck, ShieldCheck, Search, X, LogIn, Navigation, LayoutDashboard, TrendingUp, Activity, Clock, LogOut, Globe, Printer, Map as MapIcon, Star, Filter, ChevronRight, Wifi, Coffee, Zap, Info, MapPin } from 'lucide-react';
import { Login } from '../components/Login';
import { RouteMapper } from '../components/RouteMapper';
import { SeatMap } from '../components/SeatMap';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { generateTicketPDF } from '../utils/ticketGenerator';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Asia/Dhaka';

export const AdminPanel = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracking' | 'counters' | 'operators' | 'routes' | 'fleet' | 'crew' | 'passengers' | 'trips' | 'tripHistory' | 'tripCounterTimes' | 'security'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tripCounterTimes, setTripCounterTimes] = useState<TripCounterTime[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ collection: string, id: string } | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripForBookings, setSelectedTripForBookings] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Stats for Dashboard
  const stats = {
    totalRevenue: bookings.filter(b => b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0),
    activeTrips: trips.filter(t => t.status === 'departed').length,
    totalBuses: buses.length,
    totalPassengers: passengers.length,
    todayTrips: trips.filter(t => new Date(t.departureTime).toDateString() === new Date().toDateString()).length
  };

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
    const savedAdmin = localStorage.getItem('admin_session');
    if (savedAdmin) {
      const adminData = JSON.parse(savedAdmin);
      setUser(adminData);
      setIsAdmin(true);
    }
    setIsAuthReady(true);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

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
    };
  }, [isAdmin]);

  // Recurring Trip Logic: Automatically generate trips for the next 14 days if repeatDaily is true
  useEffect(() => {
    if (!isAdmin || trips.length === 0) return;

    const generateRecurringTrips = async () => {
      const recurringTrips = trips.filter(t => t.repeatDaily);
      
      for (const trip of recurringTrips) {
        const tripDate = new Date(trip.departureTime);
        
        // Generate for the next 14 days
        for (let i = 0; i < 14; i++) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + i);
          targetDate.setHours(tripDate.getHours(), tripDate.getMinutes(), 0, 0);

          // Only generate if targetDate is after or equal to the original trip date
          if (targetDate >= tripDate) {
            const alreadyExists = trips.some(t => 
              t.coachNumber === trip.coachNumber && 
              new Date(t.departureTime).toDateString() === targetDate.toDateString()
            );

            if (!alreadyExists) {
              try {
                const { id, ...tripData } = trip;
                const newDateStr = format(targetDate, 'yyyy-MM-dd');
                await addDoc(collection(db, 'trips'), {
                  ...tripData,
                  date: newDateStr,
                  departureTime: `${newDateStr}T${trip.baseDepartureTime}`,
                  status: 'scheduled',
                  bookedSeats: []
                });
                console.log(`Generated recurring trip for ${trip.coachNumber} on ${targetDate.toDateString()}`);
              } catch (err) {
                console.error("Error generating recurring trip:", err);
              }
            }
          }
        }
      }
    };

    // Use a timeout to prevent blocking the main thread immediately after trips load
    const timeoutId = setTimeout(() => {
      generateRecurringTrips();
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [isAdmin, trips.length]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    
    if (newPassword !== confirmPassword) {
      setPasswordError(t('পাসওয়ার্ড মিলছে না', 'Passwords do not match'));
      return;
    }
    
    if (newPassword.length < 6) {
      setPasswordError(t('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'Password must be at least 6 characters'));
      return;
    }
    
    try {
      if (user && user.id) {
        const adminRef = doc(db, 'admins', user.id);
        await updateDoc(adminRef, { password: newPassword });
        setPasswordSuccess(t('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে', 'Password changed successfully'));
        setNewPassword('');
        setConfirmPassword('');
        
        // Update local session
        const updatedUser = { ...user, password: newPassword };
        setUser(updatedUser);
        localStorage.setItem('admin_session', JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError(t('পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে', 'Failed to change password'));
    }
  };

  const handleCustomLogin = async (id: string, pass: string) => {
    setLoginError(null);
    try {
      const q = query(collection(db, 'admins'), where('customId', '==', id), where('password', '==', pass));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const adminData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setUser(adminData);
        setIsAdmin(true);
        localStorage.setItem('admin_session', JSON.stringify(adminData));
      } else {
        const allAdmins = await getDocs(collection(db, 'admins'));
        if (allAdmins.empty && id === 'admin' && pass === 'admin') {
          const newAdmin = { customId: 'admin', password: 'admin', name: 'Super Admin', role: 'admin' };
          const docRef = await addDoc(collection(db, 'admins'), newAdmin);
          const adminData = { id: docRef.id, ...newAdmin };
          setUser(adminData);
          setIsAdmin(true);
          localStorage.setItem('admin_session', JSON.stringify(adminData));
        } else {
          setLoginError(t('ভুল আইডি বা পাসওয়ার্ড।', 'Invalid ID or Password.'));
        }
      }
    } catch (err) {
      setLoginError(t('লগইন করতে সমস্যা হয়েছে।', 'Error during login.'));
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
        title={t('অ্যাডমিন লগইন', 'Admin Login')} 
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

    generateTicketPDF(
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
        data = {
          coachNumber: formData.get('coachNumber') as string,
          routeId: formData.get('routeId') as string,
          busId: formData.get('busId') as string,
          date: formData.get('date') as string,
          baseDepartureTime: formData.get('baseDepartureTime') as string,
          departureTime: `${formData.get('date')}T${formData.get('baseDepartureTime')}`,
          fare: Number(formData.get('fare')) || 500,
          status: 'scheduled',
          currentStopIndex: 0,
          stopLogs: [],
          repeatDaily: formData.get('repeatDaily') === 'on',
          boardingPoints: selectedBoarding,
          droppingPoints: selectedDropping,
        };
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
          role: formData.get('role') as string,
          phone: formData.get('phone') as string,
          email: formData.get('email') as string,
          customId: formData.get('customId') as string,
          password: formData.get('password') as string,
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
      } else {
        const id = data.customId || crypto.randomUUID();
        await setDoc(doc(db, collectionName, id), data);
        const docRef = { id };
        
        // If it's an operator or supervisor, we might want to pre-provision their role
        if (activeTab === 'operators' || (activeTab === 'crew' && data.role === 'Supervisor')) {
          // We can't set the 'users' doc yet because we don't have their UID
          // But we can store the email mapping
          await setDoc(doc(db, 'staff_emails', data.email), {
            role: activeTab === 'operators' ? 'operator' : 'supervisor',
            profileId: docRef.id
          });
          
          // Save credentials for custom ID login
          if (activeTab === 'operators' || (activeTab === 'crew' && data.role === 'Supervisor')) {
            await setDoc(doc(db, 'staff_credentials', docRef.id), {
              id: data.customId,
              password: data.password,
              role: activeTab === 'operators' ? 'operator' : 'supervisor'
            });
          }
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
        status: 'completed'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'walletTransactions');
    }
  };

  const handleDelete = async (collectionName: string, id: string) => {
    setDeleteConfirm({ collection: collectionName, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, deleteConfirm.collection, deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, deleteConfirm.collection);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50/50 -m-4 lg:-m-8">
      {/* Sidebar Navigation */}
      <div className="lg:w-72 bg-[#1F1A38] text-white flex flex-col h-screen sticky top-0">
        <div className="p-8 flex items-center gap-3">
          <div className="bg-white/10 p-2.5 rounded-xl">
            <BusIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter">EasyBus</h1>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-8">
          {[
            { id: 'dashboard', label: t('ড্যাশবোর্ড', 'Dashboard'), icon: LayoutDashboard },
            { id: 'counters', label: t('কাউন্টার', 'Counters'), icon: Wallet },
            { id: 'routes', label: t('রুট', 'Routes'), icon: Navigation },
            { id: 'trips', label: t('ট্রিপ', 'Trips'), icon: Map },
            { id: 'tripHistory', label: t('ট্রিপ হিস্ট্রি', 'Trip History'), icon: Clock },
            { id: 'tripCounterTimes', label: t('কাউন্টার সময়', 'Counter Times'), icon: Clock },
            { id: 'fleet', label: t('বাস বহর', 'Fleet'), icon: BusIcon },
            { id: 'tracking', label: t('লাইভ ট্র্যাকিং', 'Live Tracking'), icon: MapPin },
            { id: 'operators', label: t('অপারেটর', 'Operators'), icon: UserCheck },
            { id: 'crew', label: t('ক্রু', 'Crew'), icon: Users },
            { id: 'passengers', label: t('যাত্রী', 'Passengers'), icon: Users },
            { id: 'security', label: t('নিরাপত্তা', 'Security'), icon: ShieldCheck },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200",
                activeTab === tab.id 
                  ? "bg-white/10 text-white" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <tab.icon size={20} />
              <span className="text-sm">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-white/60 hover:bg-white/5 hover:text-white transition-all"
          >
            <LogOut size={20} />
            <span className="text-sm">{t('লগআউট', 'Logout')}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB]">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex-1 max-w-xl">
            <h2 className="text-2xl font-black text-slate-800">Good Morning!</h2>
          </div>
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder={t('অনুসন্ধান করুন...', 'Search...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          <div className="flex items-center gap-6 ml-8">
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-sm font-bold text-slate-800 leading-none">{user?.displayName || 'Admin User'}</p>
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
            <h2 className="text-3xl font-black uppercase tracking-tighter text-primary">
              {activeTab === 'dashboard' && t('ড্যাশবোর্ড', 'Dashboard')}
              {activeTab === 'counters' && t('কাউন্টার ব্যবস্থাপনা', 'Counter Management')}
              {activeTab === 'operators' && t('অপারেটর ব্যবস্থাপনা', 'Operator Management')}
              {activeTab === 'routes' && t('রুট ব্যবস্থাপনা', 'Route Management')}
              {activeTab === 'trips' && t('ট্রিপ ব্যবস্থাপনা', 'Trip Management')}
              {activeTab === 'tripHistory' && t('ট্রিপ হিস্ট্রি', 'Trip History')}
              {activeTab === 'fleet' && t('বাস ব্যবস্থাপনা', 'Fleet Management')}
              {activeTab === 'crew' && t('ক্রু ব্যবস্থাপনা', 'Crew Management')}
              {activeTab === 'passengers' && t('যাত্রী ব্যবস্থাপনা', 'Passenger Management')}
              {activeTab === 'tracking' && t('লাইভ ট্র্যাকিং', 'Live Tracking')}
              {activeTab === 'security' && t('নিরাপত্তা', 'Security')}
            </h2>
            {activeTab !== 'dashboard' && activeTab !== 'tracking' && activeTab !== 'tripHistory' && activeTab !== 'security' && (
              <button
                onClick={() => { setEditingItem(null); setShowModal(true); }}
                className="bg-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={20} />
                <span>{t('নতুন যোগ করুন', 'Add New')}</span>
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
                  { label: t('মোট রাজস্ব', 'Total Revenue'), value: `৳ ${bookings.filter(b => b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0).toLocaleString()}`, icon: TrendingUp, color: 'bg-purple-600' },
                  { label: t('সক্রিয় ট্রিপ', 'Active Trips'), value: trips.filter(t => t.status === 'on-road').length, icon: Activity, color: 'bg-blue-500' },
                  { label: t('মোট বাস', 'Total Buses'), value: buses.length, icon: BusIcon, color: 'bg-emerald-500' },
                  { label: t('মোট যাত্রী', 'Total Passengers'), value: passengers.length, icon: Users, color: 'bg-orange-500' },
                ].map((stat, i) => (
                  <div key={i} className={`${stat.color} p-6 rounded-3xl text-white shadow-lg`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-white/20 rounded-2xl">
                        <stat.icon size={24} className="text-white" />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-white/80 mb-1">{stat.label}</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{stat.value}</h3>
                  </div>
                ))}
              </div>

              {/* Recent Activity & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">{t('আজকের ট্রিপসমূহ', "Today's Trips")}</h3>
                    <button className="text-xs font-bold text-primary hover:underline">{t('সব দেখুন', 'View All')}</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-6 py-4">{t('বাস নং', 'Bus No')}</th>
                          <th className="px-6 py-4">{t('রুট', 'Route')}</th>
                          <th className="px-6 py-4">{t('সময়', 'Time')}</th>
                          <th className="px-6 py-4">{t('অবস্থা', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[...trips]
                          .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
                          .slice(0, 5)
                          .map(trip => {
                            const bus = buses.find(b => b.id === trip.busId);
                            const route = routes.find(r => r.id === trip.routeId);
                            return (
                              <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-700">{bus?.regNo || trip.busId}</td>
                                <td className="px-6 py-4 text-sm text-slate-500">{route?.name || trip.routeId}</td>
                                <td className="px-6 py-4 text-sm font-medium text-slate-500">
                                  <div className="flex items-center gap-2">
                                    <Clock size={14} />
                                    {format(new Date(trip.departureTime), 'hh:mm a, dd MMM')}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    trip.status === 'on-road' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
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
                  <div className="bg-primary p-8 rounded-3xl text-white shadow-xl shadow-primary/20 relative overflow-hidden">
                    <Globe className="absolute -right-8 -bottom-8 text-white/10" size={160} />
                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">{t('সিস্টেম স্ট্যাটাস', 'System Status')}</h3>
                    <p className="text-sm text-white/80 mb-6 font-medium leading-relaxed">All systems are operational. Real-time tracking and ticketing are active.</p>
                    <div className="flex items-center gap-2 bg-white/10 w-fit px-4 py-2 rounded-xl backdrop-blur-sm">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-widest">Operational</span>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-4">{t('দ্রুত অ্যাকশন', 'Quick Actions')}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setActiveTab('trips')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-left">
                        <Map className="text-primary group-hover:text-white mb-2" size={20} />
                        <p className="text-xs font-bold">{t('নতুন ট্রিপ', 'New Trip')}</p>
                      </button>
                      <button onClick={() => setActiveTab('fleet')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-left">
                        <BusIcon className="text-primary group-hover:text-white mb-2" size={20} />
                        <p className="text-xs font-bold">{t('বাস যোগ করুন', 'Add Bus')}</p>
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
                        <th className="px-6 py-4">{t('নাম', 'Name')}</th>
                        <th className="px-6 py-4">{t('অবস্থান', 'Location')}</th>
                        <th className="px-6 py-4">{t('ব্যালেন্স', 'Balance')}</th>
                        <th className="px-6 py-4">{t('রাজস্ব', 'Revenue')}</th>
                        <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
                            <span className="font-bold text-purple-600">৳ {counterRevenue.toLocaleString()}</span>
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
                    <th className="px-6 py-4">{t('নাম', 'Name')}</th>
                    <th className="px-6 py-4">{t('স্টপস', 'Stops')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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

          {activeTab === 'trips' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">{t('কোচ আইডি', 'Coach ID')}</th>
                    <th className="px-6 py-4">{t('রুট', 'Route')}</th>
                    <th className="px-6 py-4">{t('সময়', 'Time')}</th>
                    <th className="px-6 py-4">{t('অবস্থা', 'Status')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
                        <td className="px-6 py-4 font-bold text-primary">{trip.coachNumber}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{route?.name || 'Unknown Route'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {format(new Date(trip.departureTime), 'hh:mm a, dd MMM')}
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
                            title={t('বুকিং দেখুন', 'View Bookings')}
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
                    <th className="px-6 py-4">{t('কোচ আইডি', 'Coach ID')}</th>
                    <th className="px-6 py-4">{t('রুট', 'Route')}</th>
                    <th className="px-6 py-4">{t('সময়', 'Time')}</th>
                    <th className="px-6 py-4">{t('অবস্থা', 'Status')}</th>
                    <th className="px-6 py-4">{t('মোট আয়', 'Total Revenue')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
                        <td className="px-6 py-4 font-bold text-primary">{trip.coachNumber}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{route?.name || 'Unknown Route'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            {format(new Date(trip.departureTime), 'hh:mm a, dd MMM yyyy')}
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
                            title={t('বুকিং দেখুন', 'View Bookings')}
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
                    <th className="px-6 py-4">{t('রেজি: নম্বর', 'Reg No')}</th>
                    <th className="px-6 py-4">{t('টাইপ', 'Type')}</th>
                    <th className="px-6 py-4">{t('আসন', 'Seats')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">{t('নাম', 'Name')}</th>
                    <th className="px-6 py-4">{t('ইমেইল', 'Email')}</th>
                    <th className="px-6 py-4">{t('কাউন্টার', 'Counter')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
          )}

          {activeTab === 'crew' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">{t('নাম', 'Name')}</th>
                    <th className="px-6 py-4">{t('পদবী', 'Role')}</th>
                    <th className="px-6 py-4">{t('ফোন', 'Phone')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
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
          )}

          {activeTab === 'security' && (
            <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" />
                {t('পাসওয়ার্ড পরিবর্তন', 'Change Password')}
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
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('নতুন পাসওয়ার্ড', 'New Password')}</label>
                  <input 
                    type="password" 
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('পাসওয়ার্ড নিশ্চিত করুন', 'Confirm Password')}</label>
                  <input 
                    type="password" 
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                >
                  {t('আপডেট করুন', 'Update Password')}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'passengers' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4">{t('নাম', 'Name')}</th>
                    <th className="px-6 py-4">{t('ফোন', 'Phone')}</th>
                    <th className="px-6 py-4">{t('ইমেইল', 'Email')}</th>
                    <th className="px-6 py-4">{t('মোট ট্রিপ', 'Total Trips')}</th>
                    <th className="px-6 py-4 text-right">{t('অ্যাকশন', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData(passengers).map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">{p.phone}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{p.email}</td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-primary">{p.totalTrips || 0}</span>
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
                  <h3 className="text-lg font-bold mb-4">{t('সক্রিয় ট্রিপসমূহ', 'Active Trips')}</h3>
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
                              ? "bg-primary/5 border-primary shadow-sm" 
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
                              <Clock size={12} /> {format(new Date(trip.departureTime), 'hh:mm a')}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {trips.filter(t => t.status === 'departed').length === 0 && (
                      <p className="text-center text-slate-400 py-8 italic text-sm">
                        {t('কোনো সক্রিয় ট্রিপ নেই', 'No active trips found')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="card h-full min-h-[500px] flex flex-col">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <MapPin className="text-primary" />
                    {t('লাইভ ম্যাপ', 'Live Map')}
                  </h3>
                  {selectedTrip?.currentLocation ? (
                    <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                        <Navigation className="text-primary" size={40} />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-800">
                          {routes.find(r => r.id === selectedTrip.routeId)?.name}
                        </h4>
                        <p className="text-slate-500">
                          {t('বর্তমান অবস্থান:', 'Current Location:')} {selectedTrip.currentLocation.lat.toFixed(6)}, {selectedTrip.currentLocation.lng.toFixed(6)}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          {t('সর্বশেষ আপডেট:', 'Last Updated:')} {format(new Date(selectedTrip.currentLocation.timestamp), 'hh:mm:ss a')}
                        </p>
                      </div>
                      <div className="w-full max-w-md p-4 bg-white rounded-xl border border-slate-100 shadow-sm text-left">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-slate-700">{t('বাসের তথ্য', 'Bus Info')}</span>
                          <span className="text-xs text-primary font-bold">{buses.find(b => b.id === selectedTrip.busId)?.regNo}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">{t('কোচ নম্বর', 'Coach No')}</span>
                            <span className="font-medium">{selectedTrip.coachNumber}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">{t('পরবর্তী স্টপ', 'Next Stop')}</span>
                            <span className="font-medium text-accent">
                              {counters.find(c => c.id === selectedTrip.nextStopId)?.name || t('অজানা', 'Unknown')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <a 
                        href={`https://www.google.com/maps?q=${selectedTrip.currentLocation.lat},${selectedTrip.currentLocation.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary flex items-center gap-2"
                      >
                        <MapPin size={18} />
                        {t('গুগল ম্যাপে দেখুন', 'View on Google Maps')}
                      </a>
                    </div>
                  ) : (
                    <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center p-8 text-center">
                      <div className="bg-white p-6 rounded-full shadow-sm mb-4">
                        <Navigation size={48} className="text-slate-200" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-400">
                        {selectedTrip ? t('লোকেশন ডেটা পাওয়া যায়নি', 'No location data available for this trip') : t('একটি ট্রিপ নির্বাচন করুন', 'Select a trip to see live tracking')}
                      </h4>
                      <p className="text-sm text-slate-400 mt-2 max-w-xs">
                        {t('সুপারভাইজার ট্র্যাকিং চালু করলে এখানে লাইভ লোকেশন দেখা যাবে।', 'Live location will appear here once the supervisor starts tracking.')}
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
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('ট্রিপ', 'Trip')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('কাউন্টার', 'Counter')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('পৌঁছানোর সময়', 'Arrival')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('ছাড়ার সময়', 'Departure')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('রিপোর্টিং', 'Reporting')}</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('অ্যাকশন', 'Actions')}</th>
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
                            {tct.isReportingCounter ? t('হ্যাঁ', 'Yes') : t('না', 'No')}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative animate-in fade-in zoom-in duration-300 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">
                {editingItem ? t('সম্পাদনা করুন', 'Edit Item') : t('নতুন যোগ করুন', 'Add New')}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddData} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {activeTab === 'counters' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('নাম', 'Name')}</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('অবস্থান', 'Location')}</label>
                    <input name="location" defaultValue={editingItem?.location} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ওয়ালেট ব্যালেন্স', 'Wallet Balance')}</label>
                    <input name="walletBalance" type="number" defaultValue={editingItem?.walletBalance || 0} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('অনুমোদিত গন্তব্য কাউন্টার', 'Allowed Destination Counters')}</label>
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
                      {t('রিপোর্টিং কাউন্টার', 'Reporting Counter')}
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('অবস্থা', 'Status')}</label>
                    <select name="status" defaultValue={editingItem?.status || 'active'} className="input-field">
                      <option value="active">{t('সক্রিয়', 'Active')}</option>
                      <option value="inactive">{t('নিষ্ক্রিয়', 'Inactive')}</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'routes' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('রুটের নাম', 'Route Name')}</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required placeholder="Dhaka - Kushtia" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('রুট ম্যাপার', 'Route Mapper')}</label>
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
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('রুট', 'Route')}</label>
                    <select name="routeId" defaultValue={editingItem?.routeId} className="input-field" required>
                      <option value="">{t('রুট বাছাই করুন', 'Select Route')}</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('বাস', 'Bus')}</label>
                    <select name="busId" defaultValue={editingItem?.busId} className="input-field" required>
                      <option value="">{t('বাস বাছাই করুন', 'Select Bus')}</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.regNo} ({b.isAC ? 'AC' : 'Non-AC'})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('কোচ নাম্বার', 'Coach No')}</label>
                    <input name="coachNumber" defaultValue={editingItem?.coachNumber} className="input-field" required placeholder="501" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('তারিখ', 'Date')}</label>
                    <input name="date" type="date" defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ছাড়ার সময়', 'Departure Time')}</label>
                    <input name="baseDepartureTime" type="time" defaultValue={editingItem?.baseDepartureTime || '06:00'} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ভাড়া', 'Fare')}</label>
                    <input name="fare" type="number" defaultValue={editingItem?.fare} className="input-field" required />
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="repeatDaily" type="checkbox" defaultChecked={editingItem?.repeatDaily} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">{t('প্রতিদিন রিপিট হবে', 'Repeat Daily')}</label>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('বোর্ডিং পয়েন্ট', 'Boarding Points')}</label>
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ড্রপিং পয়েন্ট', 'Dropping Points')}</label>
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

              {activeTab === 'fleet' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('রেজিস্ট্রেশন নাম্বার', 'Registration No')}</label>
                    <input name="regNo" defaultValue={editingItem?.regNo} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('মডেল', 'Model')}</label>
                    <input name="model" defaultValue={editingItem?.model} className="input-field" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('আসন সংখ্যা', 'Capacity')}</label>
                      <input name="capacity" type="number" defaultValue={editingItem?.capacity || 40} className="input-field" required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('লেআউট', 'Layout')}</label>
                      <select name="layout" defaultValue={editingItem?.layout || '2+2'} className="input-field">
                        <option value="2+2">2+2</option>
                        <option value="1+2">1+2</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isAC" type="checkbox" defaultChecked={editingItem?.isAC} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">{t('এসি বাস', 'AC Bus')}</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isWiFi" type="checkbox" defaultChecked={editingItem?.isWiFi} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">{t('ওয়াইফাই', 'WiFi')}</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isFood" type="checkbox" defaultChecked={editingItem?.isFood} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">{t('খাবার', 'Food')}</label>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                      <input name="isCharging" type="checkbox" defaultChecked={editingItem?.isCharging} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                      <label className="text-sm font-bold text-slate-600">{t('চার্জিং', 'Charging')}</label>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'operators' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('কাস্টম আইডি', 'Custom ID')}</label>
                    <input name="customId" defaultValue={editingItem?.customId} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('পাসওয়ার্ড', 'Password')}</label>
                    <input name="password" type="password" defaultValue={editingItem?.password} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('নাম', 'Name')}</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ইমেইল', 'Email')}</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('কাউন্টার', 'Counter')}</label>
                    <select name="counterId" defaultValue={editingItem?.counterId} className="input-field" required>
                      <option value="">{t('কাউন্টার বাছাই করুন', 'Select Counter')}</option>
                      {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'crew' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('কাস্টম আইডি', 'Custom ID')}</label>
                    <input name="customId" defaultValue={editingItem?.customId} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('পাসওয়ার্ড', 'Password')}</label>
                    <input name="password" type="password" defaultValue={editingItem?.password} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('নাম', 'Name')}</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('পদবী', 'Role')}</label>
                    <select name="role" defaultValue={editingItem?.role || 'Driver'} className="input-field" required>
                      <option value="Driver">{t('ড্রাইভার', 'Driver')}</option>
                      <option value="Supervisor">{t('সুপারভাইজার', 'Supervisor')}</option>
                      <option value="Helper">{t('হেল্পার', 'Helper')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ফোন', 'Phone')}</label>
                    <input name="phone" defaultValue={editingItem?.phone} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ইমেইল', 'Email')}</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" required />
                  </div>
                  <p className="text-xs text-slate-500 italic">{t('দ্রষ্টব্য: স্টাফদের তাদের ইমেইল দিয়ে সাইন-আপ করতে হবে।', 'Note: Staff must sign-up using their email.')}</p>
                </>
              )}

              {activeTab === 'passengers' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('নাম', 'Name')}</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ফোন', 'Phone')}</label>
                    <input name="phone" defaultValue={editingItem?.phone} className="input-field" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ইমেইল', 'Email')}</label>
                    <input name="email" type="email" defaultValue={editingItem?.email} className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('মোট ট্রিপ', 'Total Trips')}</label>
                    <input name="totalTrips" type="number" defaultValue={editingItem?.totalTrips || 0} className="input-field" />
                  </div>
                </>
              )}

              {activeTab === 'tripCounterTimes' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ট্রিপ', 'Trip')}</label>
                    <select name="tripId" defaultValue={editingItem?.tripId} className="input-field" required>
                      <option value="">{t('ট্রিপ বাছাই করুন', 'Select Trip')}</option>
                      {trips.map(t => <option key={t.id} value={t.id}>{t.coachNumber} - {routes.find(r => r.id === t.routeId)?.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('কাউন্টার', 'Counter')}</label>
                    <select name="counterId" defaultValue={editingItem?.counterId} className="input-field" required>
                      <option value="">{t('কাউন্টার বাছাই করুন', 'Select Counter')}</option>
                      {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('পৌঁছানোর সময়', 'Arrival Time')}</label>
                      <input name="arrivalTime" type="time" defaultValue={editingItem?.arrivalTime} className="input-field" required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t('ছাড়ার সময়', 'Departure Time')}</label>
                      <input name="departureTime" type="time" defaultValue={editingItem?.departureTime} className="input-field" required />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl">
                    <input name="isReportingCounter" type="checkbox" defaultChecked={editingItem?.isReportingCounter} className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" />
                    <label className="text-sm font-bold text-slate-600">{t('রিপোর্টিং কাউন্টার', 'Reporting Counter')}</label>
                  </div>
                </>
              )}

              <button type="submit" className="w-full btn-primary py-4 shadow-lg shadow-primary/20">
                {editingItem ? t('আপডেট করুন', 'Update') : t('সংরক্ষণ করুন', 'Save')}
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
              {t('মুছে ফেলতে চান?', 'Confirm Delete')}
            </h3>
            <p className="text-slate-500 text-center mb-8 text-sm">
              {t('আপনি কি নিশ্চিত যে আপনি এটি মুছে ফেলতে চান? এটি আর ফিরে পাওয়া যাবে না।', 'Are you sure you want to delete this? This action cannot be undone.')}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3.5 font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
              >
                {t('বাতিল', 'Cancel')}
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3.5 font-bold text-white bg-red-600 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
              >
                {t('মুছে ফেলুন', 'Delete')}
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
                  <h3 className="text-2xl font-black text-primary">{t('বুকিং তথ্য', 'Booking Information')}</h3>
                  <p className="text-slate-500 font-medium">{t('কোচ:', 'Coach:')} {selectedTripForBookings.coachNumber}</p>
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
                  <h4 className="font-bold text-slate-700">{t('বুকিং তালিকা', 'Booking List')}</h4>
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
                          {/* Hidden QR Code for PDF generation */}
                          <div className="hidden">
                            <QRCodeCanvas id={`ticket-qrcode-${booking.id}`} value={booking.id} size={200} level="H" includeMargin />
                          </div>
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
