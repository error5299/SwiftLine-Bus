import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, addDays } from 'date-fns';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, serverTimestamp, where, getDocs, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { DndContext, useDraggable, useDroppable, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Counter, Operator, Route, Bus, Crew, Passenger, WalletTransaction, Trip, RouteStop, TripCounterTime, Booking, TripTemplate } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { useFirebaseData, useAuth } from '../context/FirebaseProvider';
import { Plus, Edit2, Trash2, Wallet, Map, Bus as BusIcon, Users, UserCheck, ShieldCheck, Search, X, LogIn, Navigation, LayoutDashboard, TrendingUp, Activity, Clock, LogOut, Globe, Printer, Map as MapIcon, Star, Filter, ChevronRight, Wifi, Coffee, Zap, Info, MapPin, History as HistoryIcon, AlertCircle, Shield, User, ChevronLeft, Power, Eye, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Login } from '../components/Login';
import { RouteMapper } from '../components/RouteMapper';
import { SeatMap } from '../components/SeatMap';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';
import { formatInTimeZone } from 'date-fns-tz';
import { safeFormat, safeGetTime, formatTimeString, subtractMinutes } from '../utils/dateUtils';
import { RealTimeClock } from '../components/RealTimeClock';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';

const SortableStop = ({ stop, index, counter, onRemove, onTravelTimeChange }: { stop: RouteStop, index: number, counter: any, onRemove: () => void, onTravelTimeChange: (val: string) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.counterId + index });
  const style = { transform: CSS.Transform.toString(transform), transition };
  
  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-50 opacity-50")}>
        <div className="p-4 bg-white rounded-2xl border-2 border-primary/20 shadow-sm flex items-center gap-3 min-w-[200px] hover:border-primary transition-all">
          <div {...attributes} {...listeners} className="cursor-grab text-slate-400">
            <LayoutDashboard size={16} />
          </div>
          <div className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">
            {index + 1}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-black text-slate-800 truncate uppercase">{counter?.name || 'Unknown'}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Stop Pt.</p>
          </div>
          <button 
            onClick={onRemove}
            className="w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
          >
            <X size={12} />
          </button>
        </div>
    </div>
  );
};

const DraggableItem = ({ id, type, children, data }: { id: string; type: string; children: React.ReactNode; data: any; key?: any }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type, ...data },
  });
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-50 blur-[1px]")}>
      {children}
    </div>
  );
};

const DroppableZone = ({ id, activeType, children }: { id: string; activeType: string | null; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "min-h-[120px] rounded-[32px] border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-6 text-center",
        isOver ? "border-accent bg-accent/5 scale-[1.02]" : "border-slate-200 bg-slate-50/50 hover:border-slate-300",
        activeType && "animate-pulse border-accent/30"
      )}
    >
      {children}
    </div>
  );
};

const TZ = 'Asia/Dhaka';

export const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user: authUser, role: authRole, isAdmin: authIsAdmin, isAuthReady: authIsReady } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracking' | 'counters' | 'operators' | 'routes' | 'fleet' | 'crew' | 'passengers' | 'trips' | 'tripHistory' | 'tripCounterTimes' | 'security' | 'popupSettings' | 'routeManager' | 'tripCenter'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const [draggedCounter, setDraggedCounter] = useState<Counter | null>(null);
  const [routeBuilderStops, setRouteBuilderStops] = useState<RouteStop[]>([]);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [counterSearch, setCounterSearch] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // handleDragEnd inside AdminPanel
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    
    // Adding counter from resource sidebar
    if (active.data.current?.type === 'counter') {
       const counter = active.data.current;
       setRouteBuilderStops(prev => [...prev, { counterId: counter.id, distance: 0, travelTime: "00:00" }]);
       return;
    }

    // Reordering stops within the creation zone
    if (active.id !== over.id) {
      setRouteBuilderStops((items) => {
        const oldIndex = items.findIndex((_, i) => `${items[i].counterId}-${i}` === active.id);
        const newIndex = items.findIndex((_, i) => `${items[i].counterId}-${i}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const data = useFirebaseData();
  const EMPTY_ARRAY: any[] = [];
  const trips = data.trips || EMPTY_ARRAY;
  const tripTemplates = data.tripTemplates || EMPTY_ARRAY;
  const bookings = data.bookings || EMPTY_ARRAY;
  const tripCounterTimes = data.tripCounterTimes || EMPTY_ARRAY;
  const counters = data.counters || EMPTY_ARRAY;
  const operators = data.operators || EMPTY_ARRAY;
  const routes = data.routes || EMPTY_ARRAY;
  const buses = data.buses || EMPTY_ARRAY;
  const crew = data.crew || EMPTY_ARRAY;
  const passengers = data.passengers || EMPTY_ARRAY;
  const notifications = data.notifications || EMPTY_ARRAY;
  const securityLogs = data.security_logs || EMPTY_ARRAY;
  const deletedTrips = data.deletedTrips || EMPTY_ARRAY;
  const [showNotifications, setShowNotifications] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    ipWhitelisting: false,
    twoFactorAuth: true,
    sessionTimeout: 30,
    allowedIPs: ['127.0.0.1', '192.168.1.1']
  });
  
  useEffect(() => {
    const fetchSecuritySettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'security'));
        if (docSnap.exists()) {
          setSecuritySettings(docSnap.data() as any);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'settings/security');
      }
    };
    fetchSecuritySettings();
  }, []);

  useEffect(() => {
    const saveSecuritySettings = async () => {
      try {
        await setDoc(doc(db, 'settings', 'security'), securitySettings, { merge: true });
      } catch (err) {
        console.error('Error saving security settings:', err);
      }
    };
    saveSecuritySettings();
  }, [securitySettings]);

  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (authIsReady) {
      setUser(authUser);
      setIsAdmin(authIsAdmin);
      setIsAuthReady(true);
    }
  }, [authIsReady, authUser, authIsAdmin]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ collection: string, id: string } | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeFilter, setRouteFilter] = useState({ name: '', activeOnly: true });
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');
  const [selectedTripForBookings, setSelectedTripForBookings] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [dashboardDate, setDashboardDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [modalRouteId, setModalRouteId] = useState<string | null>(null);
  const [uiNotifications, setUiNotifications] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);

  useEffect(() => {
    if (showModal) {
      setModalRouteId(editingItem?.routeId || null);
    } else {
      setModalRouteId(null);
    }
  }, [showModal, editingItem]);

  const addNotification = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setUiNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setUiNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
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

  // Stats for Dashboard
  const stats = {
    totalRevenue: bookings.filter(b => b.status === 'confirmed').reduce((acc, b) => acc + (b.totalFare || 0), 0),
    activeTrips: trips.filter(t => t.status === 'departed' || t.status === 'scheduled').length,
    totalBuses: buses.length,
    totalPassengers: passengers.length,
    todayTrips: trips.filter(t => new Date(t.departureTime).toDateString() === new Date().toDateString()).length
  };

  const filteredData = useMemo(() => {
    return (items: any[]) => {
      if (!searchTerm) return items;
      const term = searchTerm.toLowerCase();
      return items.filter(item => 
        Object.values(item).some(val => 
          String(val).toLowerCase().includes(term)
        )
      );
    };
  }, [searchTerm]);

  useEffect(() => {
    if (editingItem && activeTab === 'routes') {
      setRouteStops(editingItem.stops || []);
    } else {
      setRouteStops([]);
    }
  }, [editingItem, activeTab]);

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
  const generateRecurringTrips = useCallback(async (forcedTemplateId?: string) => {
    if (!isAdmin || tripTemplates.length === 0) return;
    
    // Ensure "System Sender" or Super Admin exists
    const superAdminExists = (data.admins || []).some((a: any) => a.customId === 'admin');
    if (!superAdminExists) {
      try {
        await addDoc(collection(db, 'admins'), {
          customId: 'admin',
          password: 'admin',
          name: 'Super Admin',
          role: 'admin',
          isSystem: true
        });
      } catch (e) {
        console.error("Error recreating super admin", e);
      }
    }

    const recurringTemplates = forcedTemplateId 
      ? tripTemplates.filter(t => t.id === forcedTemplateId)
      : tripTemplates.filter(t => t.repeatDaily);
    
    let generatedCount = 0;
    
    for (const template of recurringTemplates) {
      // Generate for the next 7 days
      for (let i = 0; i < 7; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);
        
        // Active Days Check (0 = Sunday, 1 = Monday, etc.)
        if (template.activeDays && template.activeDays.length > 0) {
          if (!template.activeDays.includes(targetDate.getDay())) continue;
        }
        
        const [hours, minutes] = template.baseDepartureTime.split(':').map(Number);
        targetDate.setHours(hours, minutes, 0, 0);

        const dateStr = format(targetDate, 'yyyy-MM-dd');

        const alreadyExists = trips.some(t => 
          t.templateId === template.id && 
          t.date === dateStr
        );

        if (!alreadyExists) {
          // Check if in blacklist
          const isBlacklisted = deletedTrips.some(dt => (dt.templateId === template.id || (dt.coachNumber === template.coachNumber && dt.baseDepartureTime === template.baseDepartureTime)) && dt.date === dateStr);
          if (isBlacklisted) continue;

          try {
            const { id, ...templateData } = template;
            const newTripRef = await addDoc(collection(db, 'trips'), {
              ...templateData,
              templateId: template.id,
              date: dateStr,
              departureTime: `${dateStr}T${template.baseDepartureTime}`,
              status: 'scheduled',
              bookedSeats: [],
              isActive: false, // Default to inactive per user request
              isAvailable: false, // Default to hidden per user request
              allowBooking: template.repeatDaily !== false, 
              priceMultiplier: template.priceMultiplier || 1.0
            });
            generatedCount++;
          } catch (err) {
            console.error("Error generating recurring trip:", err);
          }
        }
      }
    }
    if (forcedTemplateId || generatedCount > 0) {
      // Recurring trips generated
    }
    return generatedCount;
  }, [isAdmin, tripTemplates, trips, deletedTrips]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generateRecurringTrips();
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [generateRecurringTrips]);

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
        
        // Ensure "sender" admin also exists if it's the first time
        if (id === 'admin') {
          const senderQuery = query(collection(db, 'admins'), where('customId', '==', 'sender'));
          const senderSnap = await getDocs(senderQuery);
          if (senderSnap.empty) {
            await addDoc(collection(db, 'admins'), { 
              customId: 'sender', 
              password: 'sender', 
              name: 'System Sender', 
              role: 'admin',
              isSystem: true 
            });
          }
        }
        
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

  const handleRevokeSessions = async () => {
    if (!window.confirm('Are you sure you want to revoke all active sessions? This will force all users to log in again.')) return;
    try {
      await updateDoc(doc(db, 'settings', 'security'), {
        sessionRevocationTimestamp: serverTimestamp()
      });
      alert('All sessions revoked successfully.');
    } catch (err) {
      console.error('Error revoking sessions:', err);
      alert('Failed to revoke sessions.');
    }
  };

  const uniqueTripsForSelection = useMemo(() => {
    const sorted = [...trips].sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime());
    const seen = new Set();
    return sorted.filter(t => {
      const key = `${t.coachNumber}-${t.routeId}-${t.baseDepartureTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [trips]);

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

  const handleToggleActive = async (collectionName: string, id: string, currentStatus: boolean, item?: any) => {
    try {
      const newStatus = !currentStatus;
      await updateDoc(doc(db, collectionName, id), { isActive: newStatus });
      await logAdminAction('update_status', collectionName, { id, isActive: newStatus });
      
      // Special logic for trips: if a trip's status is toggled, toggle its template and other instances
      if (collectionName === 'trips' && item?.templateId) {
        await updateDoc(doc(db, 'tripTemplates', item.templateId), { isActive: newStatus });
        
        // Update all OTHER future scheduled trips for this template
        const now = new Date().toISOString();
        const q = query(
          collection(db, 'trips'),
          where('templateId', '==', item.templateId),
          where('status', '==', 'scheduled'),
          where('departureTime', '>', now)
        );
        const snapshot = await getDocs(q);
        for (const tripDoc of snapshot.docs) {
          if (tripDoc.id !== id) {
            await updateDoc(tripDoc.ref, { isActive: newStatus });
          }
        }
      }
      // If a template is toggled, toggle all its future trips
      if (collectionName === 'tripTemplates') {
        const now = new Date().toISOString();
        const q = query(
          collection(db, 'trips'),
          where('templateId', '==', id),
          where('status', '==', 'scheduled'),
          where('departureTime', '>', now)
        );
        const snapshot = await getDocs(q);
        for (const tripDoc of snapshot.docs) {
          await updateDoc(tripDoc.ref, { isActive: newStatus });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, collectionName);
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
    let collectionName = activeTab === 'routeManager' ? 'routes' : activeTab;

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
      } else if (activeTab === 'routes' || activeTab === 'routeManager') {
        const enrichedStops = routeStops.map((stop, index) => ({
          ...stop,
          stopOrder: index
        }));
        data = {
          name: formData.get('name') as string,
          stops: enrichedStops,
          orderedCounterList: enrichedStops.map(s => s.counterId),
          status: 'active'
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
          repeatDaily: formData.get('repeatDaily') === 'on' || editingItem?.repeatDaily === true,
          isActive: editingItem ? (formData.get('isActive') === 'on') : false, // Default to false for new trips
          isAvailable: editingItem ? (formData.get('isAvailable') === 'on') : false, // Default to false for new trips
          priceMultiplier: Number(formData.get('priceMultiplier')) || 1.0,
          allowBooking: formData.get('allowBooking') === 'on' || editingItem?.allowBooking === true || !editingItem,
          notes: formData.get('notes') as string || '',
          boardingPoints: selectedBoarding,
          droppingPoints: selectedDropping,
        };

        if (editingItem && editingItem.templateId) {
          // Propagate changes to template
          const templateUpdate = {
            coachNumber: data.coachNumber,
            routeId: data.routeId,
            busId: data.busId,
            baseDepartureTime: data.baseDepartureTime,
            fare: data.fare,
            repeatDaily: data.repeatDaily,
            isActive: data.isActive,
            isAvailable: data.isAvailable,
            priceMultiplier: data.priceMultiplier,
            allowBooking: data.allowBooking,
            notes: data.notes,
            boardingPoints: data.boardingPoints,
            droppingPoints: data.droppingPoints
          };
          await updateDoc(doc(db, 'tripTemplates', editingItem.templateId), templateUpdate);

          // Propagate to all future scheduled trips of this template
          const now = new Date().toISOString();
          const q = query(
            collection(db, 'trips'),
            where('templateId', '==', editingItem.templateId),
            where('status', '==', 'scheduled'),
            where('departureTime', '>', now)
          );
          const snapshot = await getDocs(q);
          for (const tripDoc of snapshot.docs) {
            if (tripDoc.id !== editingItem.id) {
              const tripData = tripDoc.data();
              await updateDoc(tripDoc.ref, {
                coachNumber: data.coachNumber,
                routeId: data.routeId,
                busId: data.busId,
                baseDepartureTime: data.baseDepartureTime,
                departureTime: `${tripData.date}T${data.baseDepartureTime}`,
                fare: data.fare,
                boardingPoints: data.boardingPoints,
                droppingPoints: data.droppingPoints,
                isActive: data.isActive,
                isAvailable: data.isAvailable,
                priceMultiplier: data.priceMultiplier,
                allowBooking: data.allowBooking,
                notes: data.notes
              });
            }
          }
        }

        if (saveAsTemplate && !editingItem) {
          const templateData = {
            name: `Template for ${data.coachNumber}`,
            coachNumber: data.coachNumber,
            routeId: data.routeId,
            busId: data.busId,
            baseDepartureTime: data.baseDepartureTime,
            fare: data.fare,
            repeatDaily: data.repeatDaily,
            isActive: data.isActive,
            boardingPoints: data.boardingPoints,
            droppingPoints: data.droppingPoints
          };
          await addDoc(collection(db, 'tripTemplates'), templateData);
        }
      } else if (activeTab === 'tripCenter') {
        data = {
          name: formData.get('name') as string || `Service ${formData.get('coachNumber')}`,
          coachNumber: formData.get('coachNumber') as string,
          routeId: formData.get('routeId') as string,
          busId: formData.get('busId') as string,
          baseDepartureTime: formData.get('baseDepartureTime') as string,
          arrivalTime: formData.get('arrivalTime') as string,
          fare: Number(formData.get('fare')) || 500,
          repeatDaily: formData.get('repeatDaily') === 'on',
          isActive: formData.get('isActive') === 'on',
          boardingPoints: Array.from(e.currentTarget.querySelectorAll('input[name="boardingPoints"]:checked')).map((el: any) => el.value),
          droppingPoints: Array.from(e.currentTarget.querySelectorAll('input[name="droppingPoints"]:checked')).map((el: any) => el.value),
          activeDays: Array.from(e.currentTarget.querySelectorAll('input[name="activeDays"]:checked')).map((el: any) => Number(el.value)),
        };
        collectionName = 'tripTemplates';
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

        const selectedTrip = trips.find(t => t.id === data.tripId);
        if (selectedTrip?.templateId) {
          // Propagate to all future scheduled trips of this template
          const now = new Date().toISOString();
          const q = query(
            collection(db, 'trips'),
            where('templateId', '==', selectedTrip.templateId),
            where('status', '==', 'scheduled'),
            where('departureTime', '>', now)
          );
          const snapshot = await getDocs(q);
          for (const tripDoc of snapshot.docs) {
            if (tripDoc.id !== selectedTrip.id) {
               // Check if a tct already exists for this trip and counter
               const tctQ = query(
                 collection(db, 'tripCounterTimes'),
                 where('tripId', '==', tripDoc.id),
                 where('counterId', '==', data.counterId)
               );
               const tctSnap = await getDocs(tctQ);
               if (!tctSnap.empty) {
                 await updateDoc(tctSnap.docs[0].ref, {
                   arrivalTime: data.arrivalTime,
                   departureTime: data.departureTime,
                   isReportingCounter: data.isReportingCounter
                 });
               } else {
                 await addDoc(collection(db, 'tripCounterTimes'), {
                   ...data,
                   tripId: tripDoc.id
                 });
               }
            }
          }
        }
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

  const handleToggleTripSetting = async (tripId: string, field: string, currentValue: any) => {
    try {
      const collectionName = 'trips';
      await updateDoc(doc(db, collectionName, tripId), {
        [field]: !currentValue
      });
      addNotification(`Trip ${field} updated`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips');
    }
  };

  const handleToggleRecurring = async (tripId: string, currentStatus: boolean, templateId?: string) => {
    try {
      const newStatus = !currentStatus;
      await updateDoc(doc(db, 'trips', tripId), { repeatDaily: newStatus });
      if (templateId) {
        await updateDoc(doc(db, 'tripTemplates', templateId), { repeatDaily: newStatus });
      }
      addNotification(`Daily repetition ${newStatus ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/repeatDaily');
    }
  };

  const handleToggleTemplateRecurring = async (templateId: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      await updateDoc(doc(db, 'tripTemplates', templateId), { repeatDaily: newStatus });
      addNotification(`Daily repetition ${newStatus ? 'enabled' : 'disabled'}`, 'success');
      // Trigger sync immediately if enabled
      if (newStatus) {
        setTimeout(() => generateRecurringTrips(templateId), 1000);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripTemplates/repeatDaily');
    }
  };

  const handleUpdateTemplateDays = async (templateId: string, day: number, currentDays: number[] = []) => {
    try {
      let newDays = [...currentDays];
      if (newDays.includes(day)) {
        newDays = newDays.filter(d => d !== day);
      } else {
        newDays.push(day);
      }
      await updateDoc(doc(db, 'tripTemplates', templateId), { activeDays: newDays });
      addNotification(`Service schedule updated`, 'success');
      // Trigger sync
      setTimeout(() => generateRecurringTrips(templateId), 1000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripTemplates/days');
    }
  };

  const handleSyncAllTemplates = async () => {
    const count = await generateRecurringTrips();
    addNotification(`Manual sync complete. Generated ${count} new trips.`, 'success');
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
            date: tripToDelete.date,
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
      // Protection for "sender" / Super Admin system records
      if (deleteConfirm.collection === 'admins') {
        const adminToDelete = (data.admins || []).find((a: any) => a.id === deleteConfirm.id);
        if (adminToDelete?.customId === 'admin' || adminToDelete?.isSystem) {
          addNotification("System records cannot be deleted.", "error");
          setDeleteConfirm(null);
          return;
        }
      }

      // If it's a trip, we must blacklist it so the automated logic doesn't recreate it
      if (deleteConfirm.collection === 'trips') {
        const tripToDelete = trips.find(t => t.id === deleteConfirm.id);
        if (tripToDelete) {
          await addDoc(collection(db, 'deletedTrips'), {
            templateId: tripToDelete.templateId || null,
            coachNumber: tripToDelete.coachNumber,
            baseDepartureTime: tripToDelete.baseDepartureTime,
            date: tripToDelete.date,
            deletedAt: new Date().toISOString()
          });
        }
      }

      await deleteDoc(doc(db, deleteConfirm.collection, deleteConfirm.id));
      await logAdminAction('delete', deleteConfirm.collection, { id: deleteConfirm.id });
      addNotification("Item deleted successfully", "success");
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, deleteConfirm.collection);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-bg-off selection:bg-accent/20">
      {/* Sidebar Navigation */}
      <aside className={cn(
        "glass-hard-dark text-white flex flex-col lg:h-screen lg:sticky lg:top-0 shadow-2xl z-50 transition-all duration-500 relative ring-1 ring-white/10",
        isSidebarCollapsed ? "lg:w-20" : "lg:w-72"
      )}>
        {/* Toggle Button - Redesigned to be a sleek integrated tab */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className={cn(
            "absolute -right-3 top-10 bg-accent text-white w-6 h-12 rounded-r-xl shadow-2xl z-[100] flex items-center justify-center hover:w-8 transition-all group border-y border-r border-white/20 hidden lg:flex",
          )}
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <motion.div
            animate={{ rotate: isSidebarCollapsed ? 0 : 180 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <ChevronRight size={14} className="stroke-[3]" />
          </motion.div>
        </button>

        {/* Logo Section - Fixed Header */}
        <div className={cn(
          "p-6 flex items-center gap-4 group cursor-pointer transition-all duration-500 shrink-0 border-b border-white/5 bg-black/10",
          isSidebarCollapsed && "px-4 justify-center"
        )} onClick={() => navigate('/')}>
          <div className="bg-white p-2 rounded-xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-xl shadow-accent/20 shrink-0">
            <BusIcon className="text-accent" size={20} />
          </div>
          {!isSidebarCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="text-lg font-black uppercase tracking-tighter text-white font-sans leading-none flex items-center gap-1">
                Swift<span className="text-accent">Line</span>
              </h1>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-accent/60 leading-none mt-1">Command Hub</p>
            </motion.div>
          )}
        </div>

        {/* Navigation - Scrollable Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide py-6 h-full flex flex-col border-r border-white/5">
          <div className={cn("px-6 mb-8 lg:hidden", isSidebarCollapsed && "lg:hidden")}>
            <RealTimeClock />
          </div>

          <nav className={cn(
            "px-3 space-y-1.5",
            isSidebarCollapsed && "px-2"
          )}>
            {[
              { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
              { id: 'routeManager', label: 'Route Builder', icon: MapIcon },
              { id: 'tripCenter', label: 'Service Hub', icon: Zap },
              { id: 'counters', label: 'Counters', icon: Wallet },
              { id: 'trips', label: 'Active Trips', icon: Map },
              { id: 'tripHistory', label: 'Archives', icon: Clock },
              { id: 'fleet', label: 'Fleet Ops', icon: BusIcon },
              { id: 'tracking', label: 'Live Map', icon: MapPin },
              { id: 'operators', label: 'Partners', icon: UserCheck },
              { id: 'crew', label: 'Staffing', icon: Users },
              { id: 'passengers', label: 'CRM', icon: Users },
              { id: 'security', label: 'Access Control', icon: ShieldCheck },
              { id: 'popupSettings', label: 'Notices', icon: Info },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center rounded-xl font-bold transition-all duration-300 group relative",
                  isSidebarCollapsed ? "justify-center h-12" : "gap-3 px-4 h-12",
                  activeTab === tab.id 
                    ? "bg-accent/10 text-accent shadow-sm border border-accent/20" 
                    : "text-white/40 hover:bg-white/5 hover:text-white"
                )}
              >
                <tab.icon size={18} className={cn(
                  "transition-all duration-500 shrink-0",
                  activeTab === tab.id ? 'scale-110 text-accent drop-shadow-[0_0_8px_rgba(58,175,169,0.5)]' : 'group-hover:scale-110 group-hover:text-white'
                )} />
                {!isSidebarCollapsed && (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden"
                  >
                    {tab.label}
                  </motion.span>
                )}
                
                {/* Active Indicator dot */}
                {activeTab === tab.id && !isSidebarCollapsed && (
                  <div className="absolute left-1 w-1 h-3 bg-accent rounded-full animate-pulse" />
                )}

                {/* Tooltip for collapsed state */}
                {isSidebarCollapsed && (
                  <div className="absolute left-[calc(100%+16px)] px-4 py-3 bg-[#0F172A] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all -translate-x-3 group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl border border-white/10 ring-1 ring-white/5">
                    <div className="flex items-center gap-3">
                       <tab.icon size={14} className="text-accent" />
                       <div className="h-4 w-px bg-white/10" />
                       {tab.label}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* User Info & Logout Footer */}
          <div className="p-4 bg-black/20 border-t border-white/5 mt-auto">
            {!isSidebarCollapsed && (
              <div className="px-4 py-3 mb-4 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent font-black text-xs shrink-0">
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-white truncate uppercase tracking-tighter">{user?.name || 'Admin'}</p>
                   <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Master Admin</p>
                </div>
              </div>
            )}
            
            <button 
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center rounded-xl font-bold transition-all duration-300 group relative",
                isSidebarCollapsed ? "justify-center h-12" : "gap-3 px-4 h-11 text-white/40 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20"
              )}
            >
              <LogOut size={18} className="transition-transform group-hover:-translate-x-1 shrink-0" />
              {!isSidebarCollapsed && <span className="text-[10px] font-black uppercase tracking-widest">Secure Logout</span>}
              
              {isSidebarCollapsed && (
                  <div className="absolute left-[calc(100%+16px)] px-4 py-3 bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all -translate-x-3 group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl">
                    Terminate Session
                  </div>
                )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/50 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1.5 bg-accent rounded-full hidden sm:block" />
              <h2 className="text-xl font-black text-primary tracking-tight">SwiftLine Command Center</h2>
            </div>
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
              {activeTab === 'tripCenter' && 'Trip Center'}
              {activeTab === 'routeManager' && 'Route Builder'}
            </h2>
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
                  { label: 'Total Revenue', value: `৳ ${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-accent', bg: 'glass-hard' },
                  { label: 'Active Trips', value: stats.activeTrips, icon: Activity, color: 'text-emerald-600', bg: 'glass-hard' },
                  { label: 'Total Buses', value: stats.totalBuses, icon: BusIcon, color: 'text-teal-600', bg: 'glass-hard' },
                  { label: 'Total Passengers', value: stats.totalPassengers, icon: Users, color: 'text-green-600', bg: 'glass-hard' },
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
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Operational Actions</h3>
                    <div className="space-y-3">
                      <button 
                        onClick={handleResetAllTracking}
                        className="w-full p-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-red-100 transition-all border border-red-100 shadow-sm"
                      >
                        <Activity size={18} />
                        Reset Live Updates
                      </button>
                      <button 
                        onClick={() => setActiveTab('routeManager')}
                        className="w-full p-4 bg-primary/5 text-primary rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-primary/10 transition-all border border-primary/10 shadow-sm"
                      >
                        <MapIcon size={18} />
                        Route Builder
                      </button>
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-50">
                        <button onClick={() => setActiveTab('trips')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-center">
                          <Map className="text-primary group-hover:text-white mx-auto mb-2" size={20} />
                          <p className="text-[10px] font-black uppercase tracking-widest">New Trip</p>
                        </button>
                        <button onClick={() => setActiveTab('fleet')} className="p-4 bg-slate-50 rounded-2xl hover:bg-primary hover:text-white transition-all group text-center">
                          <BusIcon className="text-primary group-hover:text-white mx-auto mb-2" size={20} />
                          <p className="text-[10px] font-black uppercase tracking-widest">Add Bus</p>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'dashboard' && (
            <div className={cn(
              (activeTab === 'routeManager' || activeTab === 'tripCenter') ? "space-y-8" : "bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
            )}>
              {activeTab === 'routeManager' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Route Manager</h3>
                      <p className="text-slate-500 font-medium">Design custom routes by chaining counters</p>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          setEditingRouteId(null);
                          setRouteBuilderStops([]);
                        }}
                        className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                      >
                        New Route
                      </button>
                    </div>
                  </div>

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                      {/* Resource Sidebar */}
                      <div className="lg:col-span-1 space-y-6">
                          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Available Counters</h4>
                            <div className="mb-4">
                              <input 
                                type="text"
                                placeholder="Search counters..."
                                value={counterSearch}
                                onChange={(e) => setCounterSearch(e.target.value)}
                                className="w-full p-2 text-xs border border-slate-200 rounded-xl"
                              />
                            </div>
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                              {counters.filter(c => c.name.toLowerCase().includes(counterSearch.toLowerCase())).map(counter => (
                                <DraggableItem key={counter.id} id={`counter-${counter.id}`} type="counter" data={counter}>
                                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 hover:border-primary/30 transition-all shadow-sm">
                                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-primary shadow-sm">
                                      <MapPin size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold text-slate-700 truncate">{counter.name}</p>
                                      <p className="text-[10px] text-slate-400 font-medium">{counter.location}</p>
                                    </div>
                                  </div>
                                </DraggableItem>
                              ))}
                            </div>
                          </div>
                      </div>

                      {/* Creation Zone */}
                      <div className="lg:col-span-3 space-y-6">
                        <DroppableZone id="creation-zone" activeType={null}>
                          {routeBuilderStops.length === 0 ? (
                            <div className="py-12">
                              <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center text-primary mx-auto mb-4 animate-bounce">
                                <Plus size={32} />
                              </div>
                              <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Drop Counters Here</h4>
                              <p className="text-slate-500 text-sm font-medium italic">Drag counters from the left to build your route sequence</p>
                            </div>
                          ) : (
                            <div className="w-full space-y-4">
                              <div className="flex flex-wrap gap-4 items-center justify-center p-4">
                                {routeBuilderStops.map((stop, index) => {
                                  const counter = counters.find(c => c.id === stop.counterId);
                                  return (
                                    <React.Fragment key={`${stop.counterId}-${index}`}>
                                      <div className="relative group">
                                        <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col gap-5 min-w-[280px] hover:border-primary/50 transition-all border-b-4 border-b-primary/10">
                                          <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-xs font-black shrink-0 shadow-inner">
                                              {index + 1}
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                              <p className="text-sm font-black text-slate-800 truncate uppercase tracking-tight">{counter?.name || 'Unknown'}</p>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Station Point</p>
                                            </div>
                                            <button 
                                              onClick={() => setRouteBuilderStops(prev => prev.filter((_, i) => i !== index))}
                                              className="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                          
                                          <div className="grid grid-cols-3 gap-3">
                                            <div className="space-y-1.5">
                                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center">Arrival</label>
                                              <div className="relative">
                                                <input 
                                                  type="time" 
                                                  value={stop.arrivalTime || '06:00'}
                                                  onChange={(e) => {
                                                    const updated = [...routeBuilderStops];
                                                    updated[index].arrivalTime = e.target.value;
                                                    setRouteBuilderStops(updated);
                                                  }}
                                                  className="w-full text-xs font-bold p-1.5 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-primary transition-colors text-center"
                                                />
                                              </div>
                                            </div>
                                            <div className="space-y-1.5">
                                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center">Depart</label>
                                              <div className="relative">
                                                <input 
                                                  type="time" 
                                                  value={stop.departureTime || '06:00'}
                                                  onChange={(e) => {
                                                    const updated = [...routeBuilderStops];
                                                    updated[index].departureTime = e.target.value;
                                                    setRouteBuilderStops(updated);
                                                  }}
                                                  className="w-full text-xs font-bold p-1.5 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-primary transition-colors text-center"
                                                />
                                              </div>
                                            </div>
                                            <div className="space-y-1.5">
                                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center">Board</label>
                                              <div className="relative">
                                                <input 
                                                  type="time" 
                                                  value={stop.boardingTime || '06:00'}
                                                  onChange={(e) => {
                                                    const updated = [...routeBuilderStops];
                                                    updated[index].boardingTime = e.target.value;
                                                    setRouteBuilderStops(updated);
                                                  }}
                                                  className="w-full text-xs font-bold p-1.5 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-primary transition-colors text-center"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {index < routeBuilderStops.length - 1 && (
                                        <div className="flex flex-col items-center justify-center mx-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                          <div className="w-[1px] h-8 bg-slate-200 my-1" />
                                          <Navigation size={14} className="text-primary transform rotate-90" />
                                          <div className="w-[1px] h-8 bg-slate-200 my-1" />
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                        </div>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>

                              <div className="pt-8 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-6">
                                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Finalize Design</h3>
                                  <button
                                    onClick={() => setRouteBuilderStops([])}
                                    className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors"
                                  >
                                    Reset Design
                                  </button>
                                </div>
                                <form onSubmit={async (e) => {
                                  e.preventDefault();
                                  const formData = new FormData(e.currentTarget);
                                  const name = formData.get('routeName') as string;
                                  if (!name || routeBuilderStops.length < 2) {
                                    alert('Please provide a name and at least 2 stops.');
                                    return;
                                  }

                                  const routeData = {
                                    name,
                                    stops: routeBuilderStops.map((s, idx) => ({
                                      ...s,
                                      stopOrder: idx + 1,
                                      arrivalTime: s.arrivalTime || '06:00',
                                      departureTime: s.departureTime || '06:00',
                                      boardingTime: s.boardingTime || '06:00',
                                      travelTime: s.travelTime || '00:00'
                                    })),
                                    orderedCounterList: routeBuilderStops.map(s => s.counterId),
                                    status: 'active',
                                    createdAt: new Date().toISOString()
                                  };

                                  try {
                                    if (editingRouteId) {
                                      await updateDoc(doc(db, 'routes', editingRouteId), routeData);
                                      alert('Route updated successfully!');
                                    } else {
                                      await addDoc(collection(db, 'routes'), routeData);
                                      alert('New route created successfully!');
                                    }
                                    setRouteBuilderStops([]);
                                    setEditingRouteId(null);
                                    setActiveTab('routes');
                                  } catch (err) {
                                    console.error('Error saving route:', err);
                                    alert('Failed to save route.');
                                  }
                                }} className="max-w-md mx-auto space-y-4">
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route Name</label>
                                    <input 
                                      name="routeName" 
                                      required 
                                      placeholder="e.g. Dhaka - Chittagong Express"
                                      defaultValue={editingRouteId ? routes.find(r => r.id === editingRouteId)?.name : ''}
                                      className="input-field" 
                                    />
                                  </div>
                                  <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                                    {editingRouteId ? 'Update Route' : 'Create Custom Route'}
                                  </button>
                                </form>
                              </div>
                            </div>
                          )}
                        </DroppableZone>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {routes.map(route => (
                            <div key={route.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-primary/5 rounded-full" />
                              <div className="relative">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                    <Navigation size={24} />
                                  </div>
                                  <div className="flex gap-2 transition-all">
                                    <button 
                                      onClick={() => {
                                        setEditingRouteId(null);
                                        setRouteBuilderStops(route.stops || []);
                                      }}
                                      className="p-2 bg-slate-50 text-slate-400 hover:text-accent rounded-lg transition-colors border border-slate-100" title="Duplicate Route"
                                    >
                                      <Star size={16} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setEditingItem({ 
                                          routeId: route.id, 
                                          boardingPoints: route.orderedCounterList, 
                                          droppingPoints: route.orderedCounterList,
                                          coachNumber: '',
                                          baseDepartureTime: '06:00',
                                          fare: 500
                                        });
                                        setActiveTab('tripCenter');
                                        setShowModal(true);
                                      }}
                                      className="p-2 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg transition-all shadow-sm border border-accent/20"
                                      title="Create Service catalog entry"
                                    >
                                      <Zap size={16} />
                                    </button>
                                    <button 
                                      onClick={() => setDeleteConfirm({ collection: 'routes', id: route.id })}
                                      className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors border border-red-100" title="Delete Route"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setEditingRouteId(route.id);
                                        setRouteBuilderStops(route.stops || []);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                      }}
                                      className="p-2 bg-slate-50 text-slate-400 hover:text-primary rounded-lg transition-colors border border-slate-100"
                                      title="Edit Route"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                  </div>
                                </div>
                                <h4 className="text-sm font-black text-slate-800 uppercase mb-2 truncate">{route.name}</h4>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                    <Clock size={12} />
                                    <span>{route.stops?.length || 0} Total Stoppages</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-3">
                                    {route.stops?.slice(0, 3).map((stop: any, idx: number) => {
                                      const c = counters.find(counter => counter.id === stop.counterId);
                                      return (
                                        <span key={idx} className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[8px] font-bold text-slate-500">
                                          {c?.name}
                                        </span>
                                      );
                                    })}
                                    {route.stops && route.stops.length > 3 && (
                                      <span className="px-2 py-1 bg-primary/5 text-primary rounded-lg text-[8px] font-bold">+{route.stops.length - 3} More</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DndContext>
                </div>
              )}

              {activeTab === 'counters' && (
                <div className="space-y-4">
                  <div className="flex justify-end pr-2">
                    <button
                      onClick={() => { setEditingItem(null); setShowModal(true); }}
                      className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Plus size={16} />
                      <span>Add New Counter</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto bg-white rounded-3xl border border-slate-100 shadow-sm">
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
                      {filteredData(counters).sort((a, b) => a.name.localeCompare(b.name)).map(counter => {
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
              </div>
            )}

          {activeTab === 'routes' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex-1 relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                  <input 
                    type="text" 
                    placeholder="Search routes by name..."
                    className="input-field pl-12"
                    value={routeFilter.name}
                    onChange={e => setRouteFilter(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                  <input 
                    type="checkbox" 
                    id="activeOnly"
                    checked={routeFilter.activeOnly}
                    onChange={e => setRouteFilter(prev => ({ ...prev, activeOnly: e.target.checked }))}
                    className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent"
                  />
                  <label htmlFor="activeOnly" className="text-sm font-bold text-slate-600 cursor-pointer">Active Only</label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Stops</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {routes
                      .filter(r => {
                        const matchesName = r.name.toLowerCase().includes(routeFilter.name.toLowerCase());
                        const matchesActive = !routeFilter.activeOnly || r.status === 'active';
                        return matchesName && matchesActive;
                      })
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(route => (
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
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              route.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                            )}>
                              {route.status || 'active'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button 
                              onClick={() => { 
                                setActiveTab('tripCenter'); 
                                setEditingItem({ routeId: route.id, coachNumber: '', fare: 500, boardingPoints: route.orderedCounterList, droppingPoints: route.orderedCounterList }); 
                                setModalRouteId(route.id);
                                setShowModal(true); 
                              }} 
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors group relative"
                              title="Add Service Line"
                            >
                              <Plus size={18} />
                            </button>
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
            </div>
          )}

          {activeTab === 'trips' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-50 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-accent/10 p-3 rounded-2xl">
                    <BusIcon className="text-accent" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-primary">Trip Management Center</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Date: {selectedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <button onClick={() => setSelectedDate(subDays(new Date(selectedDate), 1).toISOString().split('T')[0])} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all"><ChevronLeft size={18} /></button>
                    <span className="px-4 font-bold text-sm text-slate-700">{selectedDate}</span>
                    <button onClick={() => setSelectedDate(addDays(new Date(selectedDate), 1).toISOString().split('T')[0])} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all"><ChevronRight size={18} /></button>
                  </div>
                  <button
                    onClick={() => { setEditingItem(null); setShowModal(true); }}
                    className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Plus size={16} />
                    <span>Create Manual Trip</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-[2rem] border border-slate-50 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Coach details</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Route & Timings</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Indicators</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Quick Toggles</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredData(trips)
                      .filter(t => t.date === selectedDate)
                      .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
                      .map(trip => {
                      const route = routes.find(r => r.id === trip.routeId);
                      const isPriceModified = trip.priceMultiplier && trip.priceMultiplier !== 1;
                      
                      return (
                        <tr key={trip.id} className="hover:bg-slate-50/20 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <p className="font-black text-accent text-lg">{trip.coachNumber}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-bold text-slate-500 rounded uppercase">FARE: ৳{trip.fare}</span>
                                {isPriceModified && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-[8px] font-bold text-orange-600 rounded uppercase">x{trip.priceMultiplier}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                <MapPin size={12} className="text-slate-400" />
                                {route?.name}
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500">
                                <div className="flex items-center gap-1">
                                  <Clock size={10} className="text-emerald-500" />
                                  DEP: {formatTimeString(trip.departureTime)}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Clock size={10} className="text-amber-500" />
                                    BOA: {formatTimeString(subtractMinutes(trip.baseDepartureTime, 30))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock size={10} className="text-red-500" />
                                    ARR: {trip.arrivalTime ? formatTimeString(trip.arrivalTime) : '--:--'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap justify-center gap-1.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                trip.isActive !== false ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                              )}>
                                {trip.isActive !== false ? 'Active' : 'Inactive'}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                trip.isAvailable !== false ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-50 text-slate-400 border-slate-100"
                              )}>
                                {trip.isAvailable !== false ? 'Available' : 'Hidden'}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                trip.allowBooking !== false ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-slate-50 text-slate-400 border-slate-100"
                              )}>
                                {trip.allowBooking !== false ? 'Booking ON' : 'Booking OFF'}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                trip.repeatDaily ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-slate-50 text-slate-400 border-slate-100"
                              )}>
                                {trip.repeatDaily ? 'Daily' : 'One-time'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <button 
                                onClick={() => handleToggleActive('trips', trip.id, trip.isActive !== false, trip)}
                                className={cn(
                                  "p-2 rounded-xl border transition-all",
                                  trip.isActive !== false ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-emerald-50 hover:text-emerald-500"
                                )}
                                title="Toggle Active Status"
                              >
                                <Power size={14} />
                              </button>
                              <button 
                                onClick={() => handleToggleTripSetting(trip.id, 'isAvailable', trip.isAvailable !== false)}
                                className={cn(
                                  "p-2 rounded-xl border transition-all",
                                  trip.isAvailable !== false ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-blue-50 hover:text-blue-500"
                                )}
                                title="Toggle Visibility"
                              >
                                <Eye size={14} />
                              </button>
                              <button 
                                onClick={() => handleToggleTripSetting(trip.id, 'allowBooking', trip.allowBooking !== false)}
                                className={cn(
                                  "p-2 rounded-xl border transition-all",
                                  trip.allowBooking !== false ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-purple-50 hover:text-purple-500"
                                )}
                                title="Toggle Booking Access"
                              >
                                <Lock size={14} />
                              </button>
                              <button 
                                onClick={() => handleToggleRecurring(trip.id, !!trip.repeatDaily, trip.templateId)}
                                className={cn(
                                  "p-2 rounded-xl border transition-all",
                                  trip.repeatDaily ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-orange-50 hover:text-orange-500"
                                )}
                                title="Toggle Daily Repeat"
                              >
                                <Zap size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {trip.notes && (
                                <div className="p-2 text-slate-400 relative group/note">
                                  <Info size={18} />
                                  <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover/note:opacity-100 group-hover/note:visible transition-all z-50">
                                    {trip.notes}
                                  </div>
                                </div>
                              )}
                              <button 
                                onClick={() => setSelectedTripForBookings(trip)}
                                className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
                                title="View Bookings"
                              >
                                <Users size={18} />
                              </button>
                              <button 
                                onClick={() => { setEditingItem(trip); setShowModal(true); }}
                                className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                                title="Edit Trip"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button 
                                onClick={() => handleDelete('trips', trip.id)}
                                className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                                title="Delete Trip"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredData(trips).filter(t => t.date === selectedDate).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <div className="space-y-4">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                              <BusIcon className="text-slate-200" size={32} />
                            </div>
                            <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No trips scheduled for this date</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
            <div className="space-y-4">
              <div className="flex justify-end pr-2">
                <button
                  onClick={() => { setEditingItem(null); setShowModal(true); }}
                  className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus size={16} />
                  <span>Register Bus</span>
                </button>
              </div>
              <div className="overflow-x-auto bg-white rounded-3xl border border-slate-100 shadow-sm">
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
                  {filteredData(buses).sort((a, b) => a.regNo.localeCompare(b.regNo)).map(bus => (
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
          </div>
        )}

          {activeTab === 'operators' && (
            <div className="space-y-6">
              <div className="flex justify-end pr-2">
                <button
                  onClick={() => { setEditingItem(null); setShowModal(true); }}
                  className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus size={16} />
                  <span>Assign Operator</span>
                </button>
              </div>
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
              <div className="flex justify-end pr-2">
                <button
                  onClick={() => { setEditingItem(null); setShowModal(true); }}
                  className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus size={16} />
                  <span>Add Crew Member</span>
                </button>
              </div>
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
                    <button onClick={handleRevokeSessions} className="w-full p-4 bg-white border border-red-100 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 transition-all">
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
            <div className="space-y-4">
              <div className="flex justify-end pr-2">
                <button
                  onClick={() => { setEditingItem(null); setShowModal(true); }}
                  className="bg-accent text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus size={16} />
                  <span>Add Passenger</span>
                </button>
              </div>
              <div className="overflow-x-auto bg-white rounded-3xl border border-slate-100 shadow-sm">
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

          {activeTab === 'tripCenter' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                      <Zap className="text-accent" size={24} />
                    </div>
                    <div>
                      <h2 className="text-4xl font-black text-slate-950 uppercase tracking-tighter leading-none">Service Catalog</h2>
                      <p className="text-slate-500 font-bold text-sm mt-1 uppercase tracking-widest opacity-70">Fleet Automation & Recurring Schedules</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setEditingItem(null); setShowModal(true); }}
                  className="bg-accent text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                >
                  <Plus size={18} />
                  <span>New Service Line</span>
                </button>
              </header>

                <div className="flex items-center gap-3">
                  <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Services</p>
                      <p className="text-xl font-black text-primary leading-none">{tripTemplates.length}</p>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <button 
                      onClick={handleSyncAllTemplates}
                      className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Activity size={14} className="animate-spin-slow" />
                      Sync Schedules
                    </button>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {tripTemplates.map((template) => {
                  const route = routes.find(r => r.id === template.routeId);
                  const bus = buses.find(b => b.id === template.busId);
                  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                  const activeDays = template.activeDays || [0,1,2,3,4,5,6];
                  
                  return (
                    <div key={template.id} className="group relative bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-500 overflow-hidden flex flex-col">
                      {/* Top Bar Status */}
                      <div className="p-6 pb-0 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60 mb-1">Service Line</span>
                          <span className="text-lg font-black text-primary tracking-tight">{template.coachNumber}</span>
                        </div>
                        <button
                          onClick={() => handleToggleActive('tripTemplates', template.id, template.isActive, template)}
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300",
                            template.isActive 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                              : "bg-red-50 text-red-600 border-red-100 shadow-inner"
                          )}
                          title={template.isActive ? 'Active' : 'Disabled'}
                        >
                          <Power size={18} />
                        </button>
                      </div>

                      {/* Route Hero Section */}
                      <div className="p-6 flex-1">
                        <div className="bg-slate-50/50 rounded-3xl p-5 border border-slate-100/50 group-hover:bg-accent/5 transition-colors duration-500">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-accent group-hover:scale-110 transition-transform">
                              <MapIcon size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Assigned Route</p>
                              <h4 className="font-bold text-slate-800 truncate leading-tight">{route?.name || 'Undefined Route'}</h4>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/80 p-3 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Time</p>
                              <div className="flex items-center gap-2 text-primary">
                                <Clock size={14} className="text-accent" />
                                <span className="font-black text-sm">{template.baseDepartureTime}</span>
                              </div>
                            </div>
                            <div className="bg-white/80 p-3 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fare (Base)</p>
                              <div className="flex items-center gap-1 text-primary">
                                <span className="text-accent font-bold text-xs">৳</span>
                                <span className="font-black text-sm">{template.fare}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Schedule Dots */}
                        <div className="mt-6 space-y-3">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operating Days</p>
                            <button 
                              onClick={() => handleToggleTemplateRecurring(template.id, !!template.repeatDaily)}
                              className={cn(
                                "text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded",
                                template.repeatDaily ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
                              )}
                            >
                              {template.repeatDaily ? 'Automation ON' : 'Automation OFF'}
                            </button>
                          </div>
                          <div className="flex justify-between gap-1">
                            {DAYS.map((day, dIdx) => {
                              const isActive = activeDays.includes(dIdx);
                              return (
                                <button
                                  key={dIdx}
                                  onClick={() => handleUpdateTemplateDays(template.id, dIdx, activeDays)}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all",
                                    isActive 
                                      ? "bg-primary text-white shadow-md shadow-primary/20 scale-110" 
                                      : "bg-slate-50 text-slate-300 hover:bg-slate-100"
                                  )}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100">
                            {bus?.isAC ? <Zap size={14} className="text-blue-500" /> : <Coffee size={14} className="text-orange-400" />}
                          </div>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter leading-none">
                            {bus?.isAC ? 'AC Coach' : 'Non-AC'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => { setEditingItem(template); setShowModal(true); }}
                            className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Edit Service"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete('tripTemplates', template.id)}
                            className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Delete Service"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Quick Add Placeholder with Route Suggestions */}
                <div className="space-y-6">
                  <button 
                     onClick={() => { setEditingItem(null); setShowModal(true); }}
                     className="w-full rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center p-12 text-slate-400 hover:border-accent/40 hover:bg-accent/5 transition-all group min-h-[400px]"
                  >
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                      <Plus size={32} />
                    </div>
                    <p className="font-black text-xs uppercase tracking-[0.2em] mb-1">New Service</p>
                    <p className="text-[10px] font-medium opacity-60">Create a recurring trip template</p>
                  </button>

                  {routes.length > 0 && (
                    <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Quick Start with Route</h4>
                      <div className="space-y-2">
                        {routes.slice(0, 5).map(route => (
                          <button
                            key={route.id}
                            onClick={() => {
                              setEditingItem({ 
                                routeId: route.id, 
                                boardingPoints: route.orderedCounterList, 
                                droppingPoints: route.orderedCounterList,
                                coachNumber: '',
                                baseDepartureTime: '06:00',
                                arrivalTime: '12:00',
                                fare: 500
                              });
                              setShowModal(true);
                            }}
                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-accent/5 hover:border-accent/30 transition-all group/btn"
                          >
                            <div className="flex items-center gap-3">
                              <Navigation size={14} className="text-slate-400 group-hover/btn:text-accent" />
                              <span className="text-xs font-bold text-slate-700">{route.name}</span>
                            </div>
                            <Plus size={14} className="text-slate-300 group-hover/btn:text-accent" />
                          </button>
                        ))}
                      </div>
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
                        <td className="px-6 py-4 text-sm text-slate-500">{formatTimeString(tct.arrivalTime)}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatTimeString(tct.departureTime)}</td>
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

          {activeTab === 'popupSettings' && (
            <div className="card space-y-6">
              <h3 className="text-lg font-bold">Passenger Confirmation Popup</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500">Title</label>
                  <input 
                    className="input-field" 
                    defaultValue="Your ticket will be temporarily booked for 20 minutes"
                    onBlur={async (e) => {
                      await setDoc(doc(db, 'settings', 'passengerPopup'), { title: e.target.value }, { merge: true });
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">Description</label>
                  <textarea 
                    className="input-field" 
                    defaultValue="Complete payment before the booking expires to secure your seat."
                    onBlur={async (e) => {
                      await setDoc(doc(db, 'settings', 'passengerPopup'), { description: e.target.value }, { merge: true });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </main>
</div>

      {/* Modal for adding/editing - Slide-up Sheet */}
      <AnimatePresence>
        {showModal && (
          <div 
            className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowModal(false);
            }}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-white w-full max-w-6xl h-[94vh] rounded-t-[48px] shadow-2xl relative flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleAddData} className="flex flex-col h-full">
                {/* Sheet Handle for visual cue */}
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 shrink-0 transition-all hover:bg-slate-300 cursor-pointer" onClick={() => setShowModal(false)} />
                
                <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-1.5 h-8 bg-accent rounded-full" />
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800 leading-none">
                        {editingItem ? 'Edit Profile' : 'Add New Record'}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {activeTab} Management Console
                      </p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group lg:mr-2"
                  >
                    <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>
                
                <div className="flex-1 p-10 space-y-8 overflow-y-auto custom-scrollbar">
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
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Load From Service Line</label>
                      <select 
                        className="input-field shadow-sm bg-accent/5 focus:bg-white"
                        onChange={(e) => {
                          const template = tripTemplates.find(t => t.id === e.target.value);
                          if (template) {
                            const form = e.target.closest('form');
                            if (form) {
                              setModalRouteId(template.routeId);
                              (form.elements.namedItem('routeId') as HTMLInputElement).value = template.routeId;
                              (form.elements.namedItem('busId') as HTMLSelectElement).value = template.busId;
                              (form.elements.namedItem('coachNumber') as HTMLInputElement).value = template.coachNumber;
                              (form.elements.namedItem('fare') as HTMLInputElement).value = template.fare.toString();
                              
                              const boardingChecks = form.querySelectorAll('input[name="boardingPoints"]');
                              boardingChecks.forEach((cb: any) => cb.checked = template.boardingPoints?.includes(cb.value));
                              
                              const droppingChecks = form.querySelectorAll('input[name="droppingPoints"]');
                              droppingChecks.forEach((cb: any) => cb.checked = template.droppingPoints?.includes(cb.value));
                            }
                          }
                        }}
                      >
                        <option value="">Choose Service Template...</option>
                        {tripTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <input type="hidden" name="routeId" value={modalRouteId || editingItem?.routeId || ''} />
                  
                  {(() => {
                    const selectedRoute = routes.find(r => r.id === (modalRouteId || editingItem?.routeId));
                    const firstStop = selectedRoute?.stops?.[0];
                    const lastStop = selectedRoute?.stops?.[selectedRoute.stops.length - 1];
                    const inferredDep = (typeof firstStop !== 'string' && firstStop?.boardingTime) || editingItem?.baseDepartureTime || '06:00';
                    const inferredArr = (typeof lastStop !== 'string' && lastStop?.arrivalTime) || editingItem?.arrivalTime || '12:00';
                    
                    return (
                      <>
                        <input type="hidden" name="baseDepartureTime" value={inferredDep} />
                        <input type="hidden" name="arrivalTime" value={inferredArr} />
                      </>
                    );
                  })()}

                  <input type="hidden" name="repeatDaily" value={editingItem?.repeatDaily ? 'on' : 'off'} />

                  {(modalRouteId || editingItem?.routeId) && (
                    <div className="col-span-2 px-4 py-3 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase rounded-2xl border border-emerald-100 flex items-center justify-between shadow-sm animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Navigation size={14} className="animate-pulse" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-emerald-500/70 tracking-widest leading-none mb-1">Route Selected</span>
                          <span className="text-sm font-black tracking-tight leading-none">
                            {routes.find(r => r.id === (modalRouteId || editingItem?.routeId))?.name}
                          </span>
                        </div>
                      </div>
                      <ShieldCheck size={20} className="text-emerald-500/30" />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Assigned Bus</label>
                    <select name="busId" defaultValue={editingItem?.busId} className="input-field" required>
                      <option value="">Select Bus</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.regNo} ({b.isAC ? 'AC' : 'Non-AC'})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Coach ID</label>
                    <input name="coachNumber" defaultValue={editingItem?.coachNumber} className="input-field" required placeholder="501" />
                  </div>
                  <input name="date" type="hidden" value={editingItem?.date || selectedDate} />
                  
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Trip Fare (৳)</label>
                    <input name="fare" type="number" defaultValue={editingItem?.fare} className="input-field" required />
                  </div>

                  <div className="col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-[1px] flex-1 bg-slate-100" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Stoppage Configuration</span>
                      <div className="h-[1px] flex-1 bg-slate-100" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Boarding Points Redesign */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Boarding Points</label>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              const checks = e.currentTarget.closest('.space-y-3')?.querySelectorAll('input[type="checkbox"]');
                              checks?.forEach((c: any) => c.checked = true);
                            }}
                            className="text-[8px] font-black text-primary hover:underline uppercase"
                          >
                            Select All
                          </button>
                        </div>
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-3 space-y-2 max-h-56 overflow-y-auto">
                          {modalRouteId || editingItem?.routeId ? (
                            routes.find(r => r.id === (modalRouteId || editingItem?.routeId))?.stops.map((stop: any, idx: number) => {
                              const cId = typeof stop === 'string' ? stop : stop.counterId;
                              const c = counters.find(counter => counter.id === cId);
                              return (
                                <label key={idx} className="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-50 hover:border-emerald-200 transition-all cursor-pointer group">
                                  <div className="flex items-center gap-3">
                                    <input 
                                      type="checkbox" 
                                      name="boardingPoints" 
                                      value={cId} 
                                      defaultChecked={editingItem?.boardingPoints ? editingItem.boardingPoints.includes(cId) : true}
                                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{c?.name}</span>
                                  </div>
                                  <span className="text-[8px] font-black text-slate-300 uppercase">{idx === 0 ? 'START' : 'STOP'}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">Select a route to view stops</p>
                          )}
                        </div>
                      </div>

                      {/* Dropping Points Redesign */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Dropping Points</label>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              const checks = e.currentTarget.closest('.space-y-3')?.querySelectorAll('input[type="checkbox"]');
                              checks?.forEach((c: any) => c.checked = true);
                            }}
                            className="text-[8px] font-black text-primary hover:underline uppercase"
                          >
                            Select All
                          </button>
                        </div>
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-3 space-y-2 max-h-56 overflow-y-auto">
                          {modalRouteId || editingItem?.routeId ? (
                            routes.find(r => r.id === (modalRouteId || editingItem?.routeId))?.stops.map((stop: any, idx: number) => {
                              const cId = typeof stop === 'string' ? stop : stop.counterId;
                              const c = counters.find(counter => counter.id === cId);
                              const isLast = idx === routes.find(r => r.id === (modalRouteId || editingItem?.routeId))!.stops.length - 1;
                              return (
                                <label key={idx} className="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-50 hover:border-orange-200 transition-all cursor-pointer group">
                                  <div className="flex items-center gap-3">
                                    <input 
                                      type="checkbox" 
                                      name="droppingPoints" 
                                      value={cId} 
                                      defaultChecked={editingItem?.droppingPoints ? editingItem.droppingPoints.includes(cId) : true}
                                      className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{c?.name}</span>
                                  </div>
                                  <span className="text-[8px] font-black text-slate-300 uppercase">{isLast ? 'END' : 'STOP'}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">Select a route to view stops</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tripCenter' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route</label>
                    <select 
                      name="routeId" 
                      defaultValue={editingItem?.routeId} 
                      className="input-field" 
                      required
                      onChange={(e) => setModalRouteId(e.target.value)}
                    >
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
                  
                  {(() => {
                    const selectedRoute = routes.find(r => r.id === (modalRouteId || editingItem?.routeId));
                    const firstStop = selectedRoute?.stops?.[0];
                    const lastStop = selectedRoute?.stops?.[selectedRoute.stops.length - 1];
                    const inferredDep = (typeof firstStop !== 'string' && firstStop?.boardingTime) || editingItem?.baseDepartureTime || '06:00';
                    const inferredArr = (typeof lastStop !== 'string' && lastStop?.arrivalTime) || editingItem?.arrivalTime || '12:00';
                    
                    return (
                      <>
                        <input type="hidden" name="baseDepartureTime" value={inferredDep} />
                        <input type="hidden" name="arrivalTime" value={inferredArr} />
                      </>
                    );
                  })()}

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fare (৳)</label>
                    <input name="fare" type="number" defaultValue={editingItem?.fare || 500} className="input-field" required />
                  </div>
                  
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Active Days</label>
                    <div className="flex justify-between gap-1 p-2 bg-slate-50 rounded-2xl">
                      {['S','M','T','W','T','F','S'].map((day, i) => (
                        <label key={i} className="flex-1">
                          <input 
                            type="checkbox" 
                            name="activeDays" 
                            value={i} 
                            className="hidden peer" 
                            defaultChecked={editingItem?.activeDays ? editingItem.activeDays.includes(i) : true}
                          />
                          <div className="h-10 rounded-xl flex items-center justify-center text-xs font-black cursor-pointer bg-white text-slate-300 peer-checked:bg-primary peer-checked:text-white transition-all shadow-sm">
                            {day}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <input type="hidden" name="repeatDaily" value="on" />

                  <div className="col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-[1px] flex-1 bg-slate-100" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Stoppage Configuration</span>
                      <div className="h-[1px] flex-1 bg-slate-100" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Boarding Points */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Boarding Points</label>
                          <button 
                            type="button"
                            onClick={(e) => {
                              const checks = e.currentTarget.closest('.space-y-3')?.querySelectorAll('input[type="checkbox"]');
                              checks?.forEach((c: any) => c.checked = true);
                            }}
                            className="text-[8px] font-black text-primary hover:underline uppercase"
                          >
                            Select All
                          </button>
                        </div>
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-3 space-y-2 max-h-40 overflow-y-auto">
                          {modalRouteId || editingItem?.routeId ? (
                            routes.find(r => r.id === (modalRouteId || editingItem?.routeId))?.stops.map((stop: any, idx: number) => {
                              const cId = typeof stop === 'string' ? stop : stop.counterId;
                              const c = counters.find(counter => counter.id === cId);
                              return (
                                <label key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer p-2 bg-white rounded-xl border border-slate-50 hover:border-primary transition-all">
                                  <input 
                                    type="checkbox" 
                                    name="boardingPoints" 
                                    value={cId} 
                                    defaultChecked={editingItem?.boardingPoints ? editingItem.boardingPoints.includes(cId) : true}
                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span>{c?.name}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">Select a route first</p>
                          )}
                        </div>
                      </div>

                      {/* Dropping Points */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Dropping Points</label>
                          <button 
                            type="button"
                            onClick={(e) => {
                              const checks = e.currentTarget.closest('.space-y-3')?.querySelectorAll('input[type="checkbox"]');
                              checks?.forEach((c: any) => c.checked = true);
                            }}
                            className="text-[8px] font-black text-primary hover:underline uppercase"
                          >
                            Select All
                          </button>
                        </div>
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-3 space-y-2 max-h-40 overflow-y-auto">
                          {modalRouteId || editingItem?.routeId ? (
                            routes.find(r => r.id === (modalRouteId || editingItem?.routeId))?.stops.map((stop: any, idx: number) => {
                              const cId = typeof stop === 'string' ? stop : stop.counterId;
                              const c = counters.find(counter => counter.id === cId);
                              return (
                                <label key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer p-2 bg-white rounded-xl border border-slate-50 hover:border-primary transition-all">
                                  <input 
                                    type="checkbox" 
                                    name="droppingPoints" 
                                    value={cId} 
                                    defaultChecked={editingItem?.droppingPoints ? editingItem.droppingPoints.includes(cId) : true}
                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span>{c?.name}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">Select a route first</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'routeManager' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route Name</label>
                    <input name="name" defaultValue={editingItem?.name} className="input-field" required placeholder="Dhaka - Kushtia" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Route Mapper</label>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <RouteMapper 
                        stops={routeStops} 
                        onChange={setRouteStops} 
                        counters={counters} 
                      />
                    </div>
                  </div>
                </div>
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
                      {uniqueTripsForSelection.map(t => <option key={t.id} value={t.id}>{t.coachNumber} - {routes.find(r => r.id === t.routeId)?.name} ({t.baseDepartureTime})</option>)}
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
                </div>

                <div className="p-8 bg-white border-t border-slate-100 flex items-center justify-end gap-4 shrink-0 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)]">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)}
                    className="px-8 py-4 font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-12 py-4 btn-primary text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/30 flex items-center gap-3 active:scale-[0.98] transition-transform rounded-2xl">
                    <ShieldCheck size={20} />
                    <span>{editingItem ? 'Update Database Record' : 'Save New Entry'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
      {/* Trip Bookings Modal - Slide-up Sheet */}
      <AnimatePresence>
        {selectedTripForBookings && (
          <div 
            className="fixed inset-0 z-[100] flex items-end justify-center bg-primary/20 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedTripForBookings(null);
            }}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
              className="bg-white rounded-t-[48px] w-full max-w-7xl h-[94vh] shadow-2xl relative flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 shrink-0 hover:bg-slate-300 cursor-pointer" onClick={() => setSelectedTripForBookings(null)} />
              
              <div className="px-10 py-8 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <HistoryIcon size={28} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-800 tracking-tight leading-none">Booking Inventory</h3>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">
                       Coach {selectedTripForBookings.coachNumber} • {format(new Date(selectedTripForBookings.departureTime), 'PPPP')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTripForBookings(null)}
                  className="p-3 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-2xl transition-all"
                >
                  <X size={28} />
                </button>
              </div>
              
              <div className="flex-1 px-10 pb-10 overflow-y-auto custom-scrollbar">
                <div className="grid lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-7 bg-slate-50/50 p-8 rounded-[40px] border border-slate-100">
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
                  </div>
                  
                  <div className="lg:col-span-5 space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-black text-slate-700">Confirmed Passengers</h4>
                      <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black rounded-full uppercase">
                        {bookings.filter(b => b.tripId === selectedTripForBookings.id).length} Orders
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      {bookings.filter(b => b.tripId === selectedTripForBookings.id).map(booking => {
                        const passenger = passengers.find(p => p.id === booking.passengerId);
                        return (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={booking.id} 
                            className="p-5 bg-white rounded-3xl border-2 border-slate-50 hover:border-primary/20 transition-all flex items-center justify-between shadow-sm group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs uppercase">
                                {passenger?.name?.substring(0, 2)}
                              </div>
                              <div>
                                <div className="font-black text-slate-800 uppercase text-xs">{passenger?.name}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Seats:</span>
                                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 rounded-md tracking-widest leading-none py-1">{booking.seats.join(', ')}</span>
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={() => printTicket(booking)}
                              className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            >
                              <Printer size={18} />
                            </button>
                          </motion.div>
                        );
                      })}
                      {bookings.filter(b => b.tripId === selectedTripForBookings.id).length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                          <Zap size={40} className="text-slate-200" />
                          <p className="text-sm font-bold">No bookings found for this trip</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications Overlay */}
      <div className="fixed bottom-8 right-8 z-[100] space-y-4 pointer-events-none">
        <AnimatePresence>
          {uiNotifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              className={cn(
                "px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[300px] pointer-events-auto",
                notif.type === 'success' ? "bg-emerald-500 text-white border-emerald-400" : "bg-red-500 text-white border-red-400"
              )}
            >
              {notif.type === 'success' ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
              <span className="font-bold text-sm tracking-tight">{notif.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
