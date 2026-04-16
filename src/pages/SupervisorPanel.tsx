import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, updateDoc, doc, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { Trip, Booking, Passenger, Route, Counter, Crew, Bus } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { useAuth } from '../context/FirebaseProvider';
import { SeatMap } from '../components/SeatMap';
import { Users, CheckCircle2, AlertTriangle, Phone, MapPin, Search, QrCode, ShieldAlert, MessageSquare, Clock, Navigation, LogOut, Calendar, ChevronRight, History as HistoryIcon, Activity, LayoutGrid } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Login } from '../components/Login';
import { RealTimeClock } from '../components/RealTimeClock';

const TZ = 'Asia/Dhaka';

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

export const SupervisorPanel = () => {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [supervisorProfile, setSupervisorProfile] = useState<Crew | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [manifestTab, setManifestTab] = useState<'list' | 'seats'>('list');
  const [isTracking, setIsTracking] = useState(false);
  const [droppingRemarks, setDroppingRemarks] = useState<{[key: string]: string}>({});
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        let profileId = null;
        let role = null;
        
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          profileId = userData.profileId;
          role = userData.role;
        } else if (currentUser.email) {
          const staffEmailDoc = await getDoc(doc(db, 'staff_emails', currentUser.email));
          if (staffEmailDoc.exists()) {
            const staffEmailData = staffEmailDoc.data();
            profileId = staffEmailData.profileId;
            role = staffEmailData.role;
            
            await setDoc(doc(db, 'users', currentUser.uid), {
              email: currentUser.email,
              role: role,
              profileId: profileId,
              createdAt: new Date().toISOString()
            });
          }
        }

        if (profileId && (role === 'supervisor' || role === 'admin')) {
          const supDoc = await getDoc(doc(db, 'crew', profileId));
          if (supDoc.exists()) {
            setSupervisorProfile({ id: supDoc.id, ...supDoc.data() } as Crew);
          }
        }
      } else {
        const savedSupervisor = localStorage.getItem('supervisor_session');
        if (savedSupervisor) {
          const supData = JSON.parse(savedSupervisor);
          setUser(supData);
          setSupervisorProfile(supData);
        } else {
          setUser(null);
          setSupervisorProfile(null);
        }
      }
      setIsAuthReady(true);
    });

    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'routes'));
    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'counters'));
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));
    const unsubPassengers = onSnapshot(collection(db, 'passengers'), (snapshot) => {
      setPassengers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'passengers'));

    return () => {
      unsubscribeAuth();
      unsubTrips();
      unsubRoutes();
      unsubBuses();
      unsubCounters();
      unsubPassengers();
    };
  }, []);

  useEffect(() => {
    if (supervisorProfile && trips.length > 0) {
      const assignedTrips = trips.filter(t => t.crewIds?.includes(supervisorProfile.id));
      
      // Update selected trip data if it changed in the main trips list
      if (selectedTrip) {
        const stillAssigned = assignedTrips.find(t => t.id === selectedTrip.id);
        if (!stillAssigned) {
          setSelectedTrip(null);
        } else {
          setSelectedTrip(stillAssigned);
        }
      }

      // Auto-selection logic: if only one live trip today and haven't auto-selected yet
      if (!selectedTrip && !hasAutoSelected && activeTab === 'live' && filterDate === format(new Date(), 'yyyy-MM-dd')) {
        const liveTripsToday = assignedTrips.filter(t => 
          t.date === filterDate && 
          (t.status === 'scheduled' || t.status === 'departed')
        );
        if (liveTripsToday.length === 1) {
          setSelectedTrip(liveTripsToday[0]);
          setHasAutoSelected(true);
        }
      }
    }
  }, [supervisorProfile, trips, activeTab, filterDate, hasAutoSelected]);

  useEffect(() => {
    if (!selectedTrip) return;
    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id)),
      (snapshot) => {
        setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
    );
    return () => unsubBookings();
  }, [selectedTrip]);

  useEffect(() => {
    if (!isTracking || !selectedTrip) return;
    
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await updateDoc(doc(db, 'trips', selectedTrip.id), {
            currentLocation: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              timestamp: new Date().toISOString()
            }
          });
        } catch (err) {
          console.error("Error updating location:", err);
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTracking, selectedTrip]);

  const handleCustomLogin = async (id: string, pass: string) => {
    setLoginError(null);
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      
      // First verify in Firestore
      const q = query(collection(db, 'staff_credentials'), where('id', '==', id));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty || snapshot.docs[0].data().password !== pass) {
        setLoginError('Invalid ID or Password.');
        return;
      }
      
      const staffData = snapshot.docs[0].data();
      if (staffData.role !== 'supervisor') {
        setLoginError(`This ID is authorized as ${staffData.role}, not supervisor.`);
        return;
      }

      const staffEmail = staffData.email || `${id}@swiftline.staff`;
      
      // Try to sign in with Firebase Auth
      try {
        const userCredential = await signInWithEmailAndPassword(auth, staffEmail, pass);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: staffEmail,
          role: 'supervisor',
          profileId: snapshot.docs[0].id,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-email') {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, staffEmail, pass);
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              email: staffEmail,
              role: 'supervisor',
              profileId: snapshot.docs[0].id,
              createdAt: new Date().toISOString()
            });
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
    } catch (err) {
      setLoginError('Error during login.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSupervisorProfile(null);
    localStorage.removeItem('supervisor_session');
  };

  if (!isAuthReady) return null;

  if (!supervisorProfile) {
    return (
      <Login 
        title="Supervisor Login" 
        onLogin={handleCustomLogin} 
        error={loginError}
      />
    );
  }

  const handleBoarding = async (bookingId: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'boarded',
        boardedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings/boarding');
    }
  };

  const handleDropping = async (bookingId: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'dropped',
        droppedAt: new Date().toISOString(),
        droppingRemarks: droppingRemarks[bookingId] || ''
      });
      alert('Passenger marked as dropped');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings/dropping');
    }
  };

  const handleEmergency = async (type: 'accident' | 'breakdown' | 'traffic' | 'other', message: string) => {
    if (!selectedTrip) return;
    try {
      await updateDoc(doc(db, 'trips', selectedTrip.id), {
        emergencyAlert: {
          type,
          message,
          timestamp: new Date().toISOString()
        }
      });
      alert('Emergency alert sent');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/emergency');
    }
  };

  const updateNextStop = async (stopId: string) => {
    if (!selectedTrip) return;
    try {
      await updateDoc(doc(db, 'trips', selectedTrip.id), {
        nextStopId: stopId,
        lastUpdatedStopId: selectedTrip.nextStopId || null,
        lastUpdatedStopTime: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/nextStop');
    }
  };

  const handleMarkReached = async () => {
    if (!selectedTrip) return;
    const route = routes.find(r => r.id === selectedTrip.routeId);
    if (!route) return;

    const currentIndex = route.stops.findIndex(s => s.counterId === selectedTrip.nextStopId);
    const nextStop = route.stops[currentIndex + 1];

    if (nextStop) {
      await updateNextStop(nextStop.counterId);
    } else {
      // If no next stop, it means we reached the destination
      try {
        await updateDoc(doc(db, 'trips', selectedTrip.id), {
          status: 'arrived',
          arrivedAt: new Date().toISOString()
        });
        alert('Trip completed! Bus arrived at destination.');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'trips/complete');
      }
    }
  };

  const filteredBookings = bookings.filter(b => {
    const passenger = passengers.find(p => p.id === b.passengerId);
    return passenger?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           passenger?.phone.includes(searchQuery) ||
           b.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const myTrips = trips.filter(t => t.crewIds?.includes(supervisorProfile.id));
  const filteredTrips = myTrips.filter(t => {
    const isDateMatch = t.date === filterDate;
    const isStatusMatch = activeTab === 'live' 
      ? (t.status === 'scheduled' || t.status === 'departed')
      : (t.status === 'arrived' || t.status === 'cancelled');
    return isDateMatch && isStatusMatch;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black flex items-center gap-2 text-slate-800 uppercase tracking-tight">
            <Users className="text-accent" />
            Welcome, <span className="text-accent">{supervisorProfile.name}</span>
          </h2>
          <div className="hidden sm:block">
            <RealTimeClock />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="sm:hidden">
            <RealTimeClock />
          </div>
          <button 
            onClick={handleLogout}
            className="px-6 py-3 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-100 transition-all shadow-sm border border-red-100"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs and Date Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass-hard p-6 rounded-[32px] border-none">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => {
              setActiveTab('live');
              setSelectedTrip(null);
            }}
            className={cn(
              "px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2",
              activeTab === 'live' ? "bg-white text-accent shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Activity size={18} />
            Live Trip
            {trips.filter(t => t.crewIds?.includes(supervisorProfile.id) && t.date === filterDate && (t.status === 'scheduled' || t.status === 'departed')).length > 0 && (
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              setSelectedTrip(null);
            }}
            className={cn(
              "px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2",
              activeTab === 'history' ? "bg-white text-accent shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <HistoryIcon size={18} />
            Trip History
          </button>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={18} />
            <span className="text-sm font-black uppercase tracking-widest">Date:</span>
          </div>
          <input
            type="date"
            className="bg-transparent outline-none text-slate-800 font-black text-sm"
            value={filterDate}
            onChange={e => {
              setFilterDate(e.target.value);
              setSelectedTrip(null);
              setHasAutoSelected(false);
            }}
          />
        </div>
      </div>

      {!selectedTrip ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredTrips.length > 0 ? (
            filteredTrips.map(trip => {
              const route = routes.find(r => r.id === trip.routeId);
              return (
                <div 
                  key={trip.id}
                  onClick={() => setSelectedTrip(trip)}
                  className="group bg-white p-8 rounded-[2rem] border-2 border-transparent hover:border-accent hover:shadow-2xl hover:shadow-accent/5 cursor-pointer transition-all duration-500 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-700">
                    <Navigation size={120} className="text-accent" />
                  </div>

                  <div className="relative space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">
                          {trip.coachNumber}
                        </div>
                        <h4 className="text-xl font-black text-slate-800 leading-tight group-hover:text-accent transition-colors uppercase tracking-tight">
                          {route?.name || 'Unknown Route'}
                        </h4>
                      </div>
                      <span className={cn(
                        "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm",
                        trip.status === 'departed' ? "bg-accent text-white" :
                        trip.status === 'scheduled' ? "bg-blue-500 text-white" :
                        trip.status === 'arrived' ? "bg-slate-200 text-slate-600" :
                        "bg-red-500 text-white"
                      )}>
                        {trip.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-6 pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-accent transition-colors">
                          <Clock size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</span>
                          <span className="text-sm font-black text-slate-700">{format(new Date(trip.departureTime), 'hh:mm a')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-accent transition-colors">
                          <Users size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff</span>
                          <span className="text-sm font-black text-slate-700">{trip.crewIds?.length || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                            {i}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-accent font-black uppercase tracking-widest text-xs group-hover:translate-x-1 transition-transform">
                        View Details
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-32 text-center space-y-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
              <div className="inline-flex bg-slate-50 p-10 rounded-full text-slate-200">
                {activeTab === 'live' ? <Activity size={64} /> : <HistoryIcon size={64} />}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800">
                  {activeTab === 'live' 
                    ? 'No Live Trips Found'
                    : 'No Trip History Found'}
                </h3>
                <p className="text-slate-400 font-medium max-w-md mx-auto">
                  No trips assigned to you were found for this date. Please check another date or tab.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setSelectedTrip(null)}
              className="px-6 py-3 bg-white text-accent rounded-2xl font-black uppercase tracking-widest hover:bg-accent/5 transition-all text-sm border border-accent/20 flex items-center gap-2 shadow-sm"
            >
              <ChevronRight size={18} className="rotate-180" />
              Back to List
            </button>
            
            <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm ml-auto">
              <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
              <span className="text-sm font-black text-slate-800 uppercase tracking-widest">
                {selectedTrip.coachNumber} • {routes.find(r => r.id === selectedTrip.routeId)?.name}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsTracking(!isTracking)}
                className={cn(
                  "px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-3 transition-all duration-500",
                  isTracking 
                    ? "bg-accent text-white shadow-xl shadow-accent/20 scale-105" 
                    : "bg-white text-slate-600 border border-slate-100 hover:bg-slate-50 shadow-sm"
                )}
              >
                <Navigation size={20} className={cn("transition-transform", isTracking && "animate-pulse")} />
                <span>{isTracking ? 'Tracking On' : 'Start Tracking'}</span>
              </button>
            </div>
          </div>
          <div className="grid lg:grid-cols-3 gap-8">
          {/* Manifest */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card-premium">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Passenger Manifest</h3>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button 
                      onClick={() => setManifestTab('list')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                        manifestTab === 'list' ? "bg-white text-accent shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <Users size={14} />
                      List View
                    </button>
                    <button 
                      onClick={() => setManifestTab('seats')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                        manifestTab === 'seats' ? "bg-white text-accent shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <LayoutGrid size={14} />
                      Seat View
                    </button>
                  </div>
                </div>
                {manifestTab === 'list' && (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search (Name, Phone or Ticket ID)..."
                      className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent text-sm w-64 font-medium"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {manifestTab === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                        <th className="pb-4">Passenger</th>
                        <th className="pb-4">Seats</th>
                        <th className="pb-4">Boarding/Dropping</th>
                        <th className="pb-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredBookings.map(booking => {
                        const passenger = passengers.find(p => p.id === booking.passengerId);
                        const boardingCounter = counters.find(c => c.id === booking.boardingStopId);
                        const isBoarded = (booking as any).status === 'boarded';

                        return (
                          <tr key={booking.id} className="group hover:bg-accent/5 transition-all">
                            <td className="py-4">
                              <div className="font-black text-slate-800 uppercase tracking-tight group-hover:text-accent transition-colors">{passenger?.name}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1 font-bold">
                                <Phone size={10} /> {passenger?.phone}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {booking.id}</div>
                            </td>
                            <td className="py-4">
                              <div className="flex gap-1">
                                {booking.seats.map(s => (
                                  <span key={s} className="bg-accent/10 text-accent px-1.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider">{s}</span>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 text-sm text-slate-500 font-medium">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">From:</span>
                                  {boardingCounter?.name || 'Online'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">To:</span>
                                  {counters.find(c => c.id === booking.droppingStopId)?.name || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex flex-col items-end gap-2">
                                {!isBoarded && (
                                  <button
                                    onClick={() => handleBoarding(booking.id)}
                                    className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
                                  >
                                    Mark Boarded
                                  </button>
                                )}
                                {isBoarded && (booking as any).status !== 'dropped' && (
                                  <div className="space-y-2 w-full max-w-[200px]">
                                    <input 
                                      type="text"
                                      placeholder="Remarks..."
                                      className="w-full px-3 py-2 text-[10px] border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium"
                                      value={droppingRemarks[booking.id] || ''}
                                      onChange={e => setDroppingRemarks({...droppingRemarks, [booking.id]: e.target.value})}
                                    />
                                    <button
                                      onClick={() => handleDropping(booking.id)}
                                      className="w-full px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                                    >
                                      Mark Dropped
                                    </button>
                                  </div>
                                )}
                                {(booking as any).status === 'dropped' && (
                                  <span className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                    <CheckCircle2 size={14} />
                                    Dropped
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <SeatMap
                    capacity={buses.find(b => b.id === selectedTrip.busId)?.capacity || 40}
                    bookedSeats={bookings.filter(b => b.status === 'booked').flatMap(b => b.seats)}
                    femaleBookedSeats={bookings.filter(b => b.status === 'booked').filter(b => {
                      const p = passengers.find(pass => pass.id === b.passengerId);
                      return p?.gender === 'female';
                    }).flatMap(b => b.seats)}
                    soldSeats={bookings.filter(b => b.status === 'sold' || b.status === 'confirmed' || (b as any).status === 'boarded' || (b as any).status === 'dropped').flatMap(b => b.seats)}
                    femaleSoldSeats={bookings.filter(b => b.status === 'sold' || b.status === 'confirmed' || (b as any).status === 'boarded' || (b as any).status === 'dropped').filter(b => {
                      const p = passengers.find(pass => pass.id === b.passengerId);
                      return p?.gender === 'female';
                    }).flatMap(b => b.seats)}
                    selectedSeats={[]}
                    lockedSeats={[]}
                    onSeatClick={() => {}}
                    bookings={bookings}
                    passengers={passengers}
                    counters={counters}
                    isOperator={true}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Emergency & Alerts */}
          <div className="space-y-6">
            {/* Emergency Alert Section */}
            <div className="card-premium border-red-200 bg-red-50/50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <ShieldAlert size={80} className="text-red-500" />
              </div>
              <div className="relative space-y-4">
                <div className="flex items-center gap-2 text-red-600">
                  <div className="bg-red-500 p-1.5 rounded-lg animate-pulse">
                    <ShieldAlert size={20} className="text-white" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Emergency Alert</h3>
                </div>
                <p className="text-sm text-red-700 font-bold leading-relaxed">
                  In case of any emergency, quickly notify admin or message the nearest counter.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleEmergency('accident', 'Accident occurred')}
                    className="bg-red-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                  >
                    <AlertTriangle size={18} />
                    Accident
                  </button>
                  <button 
                    onClick={() => handleEmergency('breakdown', 'Bus breakdown')}
                    className="bg-orange-500 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
                  >
                    <ShieldAlert size={18} />
                    Breakdown
                  </button>
                  <button 
                    onClick={() => handleEmergency('traffic', 'Heavy traffic')}
                    className="bg-blue-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Clock size={18} />
                    Traffic
                  </button>
                  <button 
                    onClick={() => handleEmergency('other', 'Other issue')}
                    className="bg-slate-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-700 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={18} />
                    Other
                  </button>
                </div>
              </div>
            </div>

            {/* Next Stop Section */}
            <div className="card-premium border-accent/20 bg-accent/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Navigation size={80} className="text-accent" />
              </div>
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-accent">
                    <div className="bg-accent p-1.5 rounded-lg">
                      <Navigation size={20} className="text-white" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Next Stop</h3>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <select 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white font-medium"
                    value={selectedTrip.nextStopId || ''}
                    onChange={(e) => updateNextStop(e.target.value)}
                  >
                    <option value="">Select Next Stop</option>
                    {routes.find(r => r.id === selectedTrip.routeId)?.stops.map(stop => (
                      <option key={stop.counterId} value={stop.counterId}>
                        {counters.find(c => c.id === stop.counterId)?.name}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={!selectedTrip.nextStopId}
                    onClick={handleMarkReached}
                    className="w-full py-3 bg-accent text-white rounded-xl font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-xl shadow-accent/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Reached Stop
                  </button>

                  <div className="p-4 bg-white rounded-2xl border border-accent/10 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Current Location</p>
                    <div className="font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                      <Navigation size={14} className="text-accent" />
                      {selectedTrip.currentLocation ? (
                        <span>{selectedTrip.currentLocation.lat.toFixed(4)}, {selectedTrip.currentLocation.lng.toFixed(4)}</span>
                      ) : (
                        <span className="text-slate-400 italic">Unknown</span>
                      )}
                    </div>
                  </div>
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
