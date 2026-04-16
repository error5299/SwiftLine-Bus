import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Trip, Crew, Route, Counter, Booking, Passenger } from '../types';
import { Clock, Navigation, Bus as BusIcon, LogOut, Activity, History as HistoryIcon, Calendar, ChevronRight, ShieldAlert, AlertTriangle, MessageSquare, CheckCircle2, Users, MapPin, Search, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { Login } from '../components/Login';
import { RealTimeClock } from '../components/RealTimeClock';

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

export const DriverPanel: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [driverProfile, setDriverProfile] = useState<Crew | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [droppingRemarks, setDroppingRemarks] = useState<{[key: string]: string}>({});

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
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

        if (profileId && (role === 'driver' || role === 'admin')) {
          const driverDoc = await getDoc(doc(db, 'crew', profileId));
          if (driverDoc.exists()) {
            setDriverProfile({ id: driverDoc.id, ...driverDoc.data() } as Crew);
          }
        }
      } else {
        const savedDriver = localStorage.getItem('driver_session');
        if (savedDriver) {
          const driverData = JSON.parse(savedDriver);
          setUser(driverData);
          setDriverProfile(driverData);
        } else {
          setUser(null);
          setDriverProfile(null);
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

    const unsubPassengers = onSnapshot(collection(db, 'passengers'), (snapshot) => {
      setPassengers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'passengers'));

    return () => {
      unsubscribeAuth();
      unsubTrips();
      unsubRoutes();
      unsubCounters();
      unsubPassengers();
    };
  }, []);

  useEffect(() => {
    if (selectedTrip) {
      const updatedTrip = trips.find(t => t.id === selectedTrip.id);
      if (updatedTrip) setSelectedTrip(updatedTrip);
    }
  }, [trips]);

  useEffect(() => {
    if (!selectedTrip) return;
    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id)),
      (snapshot) => {
        setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      }
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
      const { auth } = await import('../firebase');
      
      // First verify in Firestore
      const q = query(collection(db, 'staff_credentials'), where('id', '==', id));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty || snapshot.docs[0].data().password !== pass) {
        setLoginError('Invalid ID or Password.');
        return;
      }
      
      const staffData = snapshot.docs[0].data();
      if (staffData.role !== 'driver') {
        setLoginError(`This ID is authorized as ${staffData.role}, not driver.`);
        return;
      }

      const staffEmail = staffData.email || `${id}@swiftline.staff`;
      
      // Try to sign in with Firebase Auth
      try {
        const userCredential = await signInWithEmailAndPassword(auth, staffEmail, pass);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: staffEmail,
          role: 'driver',
          profileId: snapshot.docs[0].id,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-email') {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, staffEmail, pass);
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              email: staffEmail,
              role: 'driver',
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
    setDriverProfile(null);
    localStorage.removeItem('driver_session');
  };

  const handleEmergency = async (type: string, message: string) => {
    if (!selectedTrip) return;
    try {
      await updateDoc(doc(db, 'trips', selectedTrip.id), {
        emergency: { type, message, timestamp: new Date().toISOString(), status: 'active' }
      });
      alert('Emergency alert sent to admin.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/emergency');
    }
  };

  const updateNextStop = async (counterId: string) => {
    if (!selectedTrip) return;
    try {
      await updateDoc(doc(db, 'trips', selectedTrip.id), { nextStopId: counterId });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/nextStop');
    }
  };

  const handleMarkReached = async () => {
    if (!selectedTrip || !selectedTrip.nextStopId) return;
    try {
      const reachedStopId = selectedTrip.nextStopId;
      const route = routes.find(r => r.id === selectedTrip.routeId);
      const nextStopIndex = (route?.stops.findIndex(s => s.counterId === reachedStopId) || 0) + 1;
      const nextStopId = route?.stops[nextStopIndex]?.counterId || null;

      await updateDoc(doc(db, 'trips', selectedTrip.id), {
        lastReachedStopId: reachedStopId,
        nextStopId: nextStopId,
        status: nextStopId ? 'departed' : 'arrived'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/reached');
    }
  };

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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings/dropping');
    }
  };

  if (!isAuthReady) return null;

  if (!user || !driverProfile) {
    return (
      <Login 
        title="Driver Login" 
        onLogin={handleCustomLogin} 
        error={loginError}
      />
    );
  }

  const filteredTrips = trips.filter(t => 
    t.crewIds?.includes(driverProfile.id) && 
    t.date === filterDate &&
    (activeTab === 'live' ? (t.status === 'scheduled' || t.status === 'departed') : (t.status === 'arrived' || t.status === 'cancelled'))
  );

  const filteredBookings = bookings.filter(b => {
    const p = passengers.find(pass => pass.id === b.passengerId);
    const searchLower = searchQuery.toLowerCase();
    return (
      b.ticketId.toLowerCase().includes(searchLower) ||
      p?.name.toLowerCase().includes(searchLower) ||
      p?.phone.includes(searchLower) ||
      b.seatNumbers.some(s => s.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black flex items-center gap-2 text-slate-800 uppercase tracking-tight">
              <BusIcon className="text-accent" />
              Driver Panel: <span className="text-accent">{driverProfile.name}</span>
            </h2>
            <div className="hidden sm:block">
              <RealTimeClock />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="sm:hidden">
              <RealTimeClock />
            </div>
            <button onClick={handleLogout} className="px-6 py-3 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-100 transition-all border border-red-100">
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass-hard p-6 rounded-[32px] border-none">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
            <button onClick={() => { setActiveTab('live'); setSelectedTrip(null); }} className={cn("px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2", activeTab === 'live' ? "bg-white text-accent shadow-md" : "text-slate-500 hover:text-slate-700")}>
              <Activity size={18} /> Live Trip
            </button>
            <button onClick={() => { setActiveTab('history'); setSelectedTrip(null); }} className={cn("px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2", activeTab === 'history' ? "bg-white text-accent shadow-md" : "text-slate-500 hover:text-slate-700")}>
              <HistoryIcon size={18} /> Trip History
            </button>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <Calendar size={18} className="text-slate-400" />
            <input type="date" className="bg-transparent outline-none text-slate-800 font-black text-sm" value={filterDate} onChange={e => { setFilterDate(e.target.value); setSelectedTrip(null); }} />
          </div>
        </div>

        {!selectedTrip ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTrips.map(trip => {
              const route = routes.find(r => r.id === trip.routeId);
              return (
                <div key={trip.id} onClick={() => setSelectedTrip(trip)} className="group bg-white p-8 rounded-[2rem] border-2 border-transparent hover:border-accent hover:shadow-2xl cursor-pointer transition-all duration-500 relative overflow-hidden">
                  <div className="relative space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">{trip.coachNumber}</div>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">{route?.name || 'Unknown Route'}</h4>
                      </div>
                      <span className={cn("px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider", trip.status === 'departed' ? "bg-accent text-white" : trip.status === 'scheduled' ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-600")}>
                        {trip.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-slate-400" />
                        <span className="text-sm font-black text-slate-700">{format(new Date(trip.departureTime), 'hh:mm a')}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <div className="flex items-center gap-1 text-accent font-black uppercase tracking-widest text-xs group-hover:translate-x-1 transition-transform">
                        Manage Trip <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => setSelectedTrip(null)} className="px-6 py-3 bg-white text-accent rounded-2xl font-black uppercase tracking-widest hover:bg-accent/5 transition-all text-sm border border-accent/20 flex items-center gap-2 shadow-sm">
                <ChevronRight size={18} className="rotate-180" /> Back to List
              </button>
              <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm ml-auto">
                <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
                <span className="text-sm font-black text-slate-800 uppercase tracking-widest">{selectedTrip.coachNumber} • {routes.find(r => r.id === selectedTrip.routeId)?.name}</span>
              </div>
              <button onClick={() => setIsTracking(!isTracking)} className={cn("px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-3 transition-all duration-500", isTracking ? "bg-accent text-white shadow-xl" : "bg-white text-slate-600 border border-slate-100 shadow-sm")}>
                <Navigation size={20} className={cn(isTracking && "animate-pulse")} />
                <span>{isTracking ? 'Tracking On' : 'Start Tracking'}</span>
              </button>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-accent/10 rounded-2xl text-accent">
                        <Users size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Passenger Manifest</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manage Boarding & Dropping</p>
                      </div>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="text" placeholder="Search passenger..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent text-sm font-medium" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-8 py-4">Seat & Passenger</th>
                          <th className="px-8 py-4">Route Info</th>
                          <th className="px-8 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredBookings.map(booking => {
                          const p = passengers.find(pass => pass.id === booking.passengerId);
                          const isBoarded = booking.status === 'boarded' || booking.status === 'dropped';
                          const boardingCounter = counters.find(c => c.id === booking.boardingStopId);
                          
                          return (
                            <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-600 group-hover:bg-accent group-hover:text-white transition-all">
                                    {booking.seatNumbers.join(',')}
                                  </div>
                                  <div>
                                    <div className="font-black text-slate-800 uppercase tracking-tight">{p?.name || 'Unknown'}</div>
                                    <div className="text-xs font-bold text-slate-400">{p?.phone}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black text-accent uppercase tracking-widest">From:</span>
                                    <span className="text-sm font-bold text-slate-700">{boardingCounter?.name || 'Online'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">To:</span>
                                    <span className="text-sm font-bold text-slate-700">{counters.find(c => c.id === booking.droppingStopId)?.name || 'N/A'}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-right">
                                <div className="flex flex-col items-end gap-2">
                                  {!isBoarded && (
                                    <button onClick={() => handleBoarding(booking.id)} className="px-6 py-2 bg-accent text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-lg shadow-accent/20">
                                      Mark Boarded
                                    </button>
                                  )}
                                  {isBoarded && booking.status !== 'dropped' && (
                                    <div className="space-y-2 w-full max-w-[200px]">
                                      <input type="text" placeholder="Remarks..." className="w-full px-3 py-2 text-[10px] border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium" value={droppingRemarks[booking.id] || ''} onChange={e => setDroppingRemarks({...droppingRemarks, [booking.id]: e.target.value})} />
                                      <button onClick={() => handleDropping(booking.id)} className="w-full px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200">
                                        Mark Dropped
                                      </button>
                                    </div>
                                  )}
                                  {booking.status === 'dropped' && (
                                    <span className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                      <CheckCircle2 size={14} /> Dropped
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
                </div>
              </div>

              <div className="space-y-6">
                <div className="card-premium border-red-200 bg-red-50/50 relative overflow-hidden group">
                  <div className="relative space-y-4">
                    <div className="flex items-center gap-2 text-red-600">
                      <ShieldAlert size={20} />
                      <h3 className="text-lg font-black uppercase tracking-tight">Emergency Alert</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleEmergency('accident', 'Accident occurred')} className="bg-red-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        <AlertTriangle size={18} /> Accident
                      </button>
                      <button onClick={() => handleEmergency('breakdown', 'Bus breakdown')} className="bg-orange-500 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-600 transition-all shadow-lg flex items-center justify-center gap-2">
                        <ShieldAlert size={18} /> Breakdown
                      </button>
                      <button onClick={() => handleEmergency('traffic', 'Heavy traffic')} className="bg-blue-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        <Clock size={18} /> Traffic
                      </button>
                      <button onClick={() => handleEmergency('other', 'Other issue')} className="bg-slate-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        <MessageSquare size={18} /> Other
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card-premium border-accent/20 bg-accent/5 relative overflow-hidden group">
                  <div className="relative space-y-4">
                    <div className="flex items-center gap-2 text-accent">
                      <Navigation size={20} />
                      <h3 className="text-lg font-black uppercase tracking-tight">Next Stop</h3>
                    </div>
                    <div className="space-y-3">
                      <select className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white font-medium" value={selectedTrip.nextStopId || ''} onChange={(e) => updateNextStop(e.target.value)}>
                        <option value="">Select Next Stop</option>
                        {routes.find(r => r.id === selectedTrip.routeId)?.stops.map(stop => (
                          <option key={stop.counterId} value={stop.counterId}>{counters.find(c => c.id === stop.counterId)?.name}</option>
                        ))}
                      </select>
                      <button disabled={!selectedTrip.nextStopId} onClick={handleMarkReached} className="w-full py-3 bg-accent text-white rounded-xl font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-xl flex items-center justify-center gap-2">
                        <CheckCircle2 size={18} /> Reached Stop
                      </button>
                      <div className="p-4 bg-white rounded-2xl border border-accent/10 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Current Location</p>
                        <div className="font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                          <Navigation size={14} className="text-accent" />
                          {selectedTrip.currentLocation ? <span>{selectedTrip.currentLocation.lat.toFixed(4)}, {selectedTrip.currentLocation.lng.toFixed(4)}</span> : <span className="text-slate-400 italic">Unknown</span>}
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
    </div>
  );
};
