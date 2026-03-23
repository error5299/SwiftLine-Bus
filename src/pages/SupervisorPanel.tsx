import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, updateDoc, doc, getDocs, getDoc } from 'firebase/firestore';
import { Trip, Booking, Passenger, Route, Counter, Crew } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { Users, CheckCircle2, AlertTriangle, Phone, MapPin, Search, QrCode, ShieldAlert, MessageSquare, Clock, Navigation, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Login } from '../components/Login';

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
  const [counters, setCounters] = useState<Counter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [droppingRemarks, setDroppingRemarks] = useState<{[key: string]: string}>({});

  useEffect(() => {
    const savedSupervisor = localStorage.getItem('supervisor_session');
    if (savedSupervisor) {
      const supData = JSON.parse(savedSupervisor);
      setUser(supData);
      setSupervisorProfile(supData);
    }
    setIsAuthReady(true);

    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    });
    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    });
    const unsubPassengers = onSnapshot(collection(db, 'passengers'), (snapshot) => {
      setPassengers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger)));
    });

    return () => {
      unsubTrips();
      unsubRoutes();
      unsubCounters();
      unsubPassengers();
    };
  }, []);

  useEffect(() => {
    if (supervisorProfile?.assignedTripId) {
      const trip = trips.find(t => t.id === supervisorProfile.assignedTripId);
      if (trip) {
        setSelectedTrip(trip);
      }
    }
  }, [supervisorProfile, trips]);

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
      const q = query(collection(db, 'crew'), where('customId', '==', id), where('password', '==', pass));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const supData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Crew;
        setUser(supData);
        setSupervisorProfile(supData);
        localStorage.setItem('supervisor_session', JSON.stringify(supData));
      } else {
        setLoginError(t('ভুল আইডি বা পাসওয়ার্ড।', 'Invalid ID or Password.'));
      }
    } catch (err) {
      setLoginError(t('লগইন করতে সমস্যা হয়েছে।', 'Error during login.'));
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
        title={t('সুপারভাইজার লগইন', 'Supervisor Login')} 
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="text-primary" />
          {t('স্বাগতম,', 'Welcome,')} {supervisorProfile.name}
        </h2>
        <div className="flex items-center gap-4">
          {selectedTrip && (
            <div className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-bold">
              {routes.find(r => r.id === selectedTrip.routeId)?.name} - {format(new Date(selectedTrip.departureTime), 'hh:mm a')}
            </div>
          )}
          <button 
            onClick={() => setIsTracking(!isTracking)}
            className={cn(
              "px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all",
              isTracking ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Navigation size={18} className={isTracking ? "animate-pulse" : ""} />
            <span>{isTracking ? t('ট্র্যাকিং চালু', 'Tracking On') : t('ট্র্যাকিং শুরু', 'Start Tracking')}</span>
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold flex items-center gap-2 hover:bg-red-100 transition-all"
          >
            <LogOut size={18} />
            <span>{t('লগআউট', 'Logout')}</span>
          </button>
        </div>
      </div>

      {selectedTrip ? (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Manifest */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">{t('যাত্রী তালিকা', 'Passenger Manifest')}</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder={t('খুঁজুন (নাম, ফোন বা টিকিট আইডি)...', 'Search (Name, Phone or Ticket ID)...')}
                    className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary text-sm w-64"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 text-sm">
                      <th className="pb-4 font-semibold">{t('যাত্রী', 'Passenger')}</th>
                      <th className="pb-4 font-semibold">{t('আসন', 'Seats')}</th>
                      <th className="pb-4 font-semibold">{t('বোর্ডিং/ড্রপিং', 'Boarding/Dropping')}</th>
                      <th className="pb-4 font-semibold text-right">{t('অ্যাকশন', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredBookings.map(booking => {
                      const passenger = passengers.find(p => p.id === booking.passengerId);
                      const boardingCounter = counters.find(c => c.id === booking.boardingStopId);
                      const isBoarded = (booking as any).status === 'boarded';

                      return (
                        <tr key={booking.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-4">
                            <div className="font-bold text-slate-800">{passenger?.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <Phone size={10} /> {passenger?.phone}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {booking.id}</div>
                          </td>
                          <td className="py-4">
                            <div className="flex gap-1">
                              {booking.seats.map(s => (
                                <span key={s} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{s}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 text-sm text-slate-500">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-black text-emerald-600 uppercase">From:</span>
                                {boardingCounter?.name || 'Online'}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-black text-orange-600 uppercase">To:</span>
                                {counters.find(c => c.id === booking.droppingStopId)?.name || 'N/A'}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex flex-col items-end gap-2">
                              {!isBoarded && (
                                <button
                                  onClick={() => handleBoarding(booking.id)}
                                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-all flex items-center gap-1"
                                >
                                  {t('বোর্ড করুন', 'Mark Boarded')}
                                </button>
                              )}
                              {isBoarded && (booking as any).status !== 'dropped' && (
                                <div className="space-y-2 w-full max-w-[200px]">
                                  <input 
                                    type="text"
                                    placeholder={t('রিমার্কস...', 'Remarks...')}
                                    className="w-full px-2 py-1 text-[10px] border border-slate-200 rounded outline-none focus:ring-1 focus:ring-accent"
                                    value={droppingRemarks[booking.id] || ''}
                                    onChange={e => setDroppingRemarks({...droppingRemarks, [booking.id]: e.target.value})}
                                  />
                                  <button
                                    onClick={() => handleDropping(booking.id)}
                                    className="w-full px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1"
                                  >
                                    {t('ড্রপ করুন', 'Mark Dropped')}
                                  </button>
                                </div>
                              )}
                              {(booking as any).status === 'dropped' && (
                                <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold flex items-center gap-1">
                                  <CheckCircle2 size={14} />
                                  {t('ড্রপড', 'Dropped')}
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

          {/* Sidebar: Emergency & Alerts */}
          <div className="space-y-6">
            {/* Emergency Alert Section */}
            <div className="card border-red-200 bg-red-50/50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <ShieldAlert size={80} className="text-red-500" />
              </div>
              <div className="relative space-y-4">
                <div className="flex items-center gap-2 text-red-600">
                  <div className="bg-red-500 p-1.5 rounded-lg animate-pulse">
                    <ShieldAlert size={20} className="text-white" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight">{t('জরুরী সতর্কতা', 'Emergency Alert')}</h3>
                </div>
                <p className="text-sm text-red-700 font-medium leading-relaxed">
                  {t('কোনো সমস্যা হলে দ্রুত অ্যাডমিনকে জানান অথবা নিকটস্থ কাউন্টারে মেসেজ দিন।', 'In case of any emergency, quickly notify admin or message the nearest counter.')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleEmergency('accident', 'Accident occurred')}
                    className="bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                  >
                    <AlertTriangle size={18} />
                    {t('দুর্ঘটনা', 'Accident')}
                  </button>
                  <button 
                    onClick={() => handleEmergency('breakdown', 'Bus breakdown')}
                    className="bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
                  >
                    <ShieldAlert size={18} />
                    {t('বিকল', 'Breakdown')}
                  </button>
                  <button 
                    onClick={() => handleEmergency('traffic', 'Heavy traffic')}
                    className="bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Clock size={18} />
                    {t('জ্যাম', 'Traffic')}
                  </button>
                  <button 
                    onClick={() => handleEmergency('other', 'Other issue')}
                    className="bg-slate-600 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={18} />
                    {t('অন্যান্য', 'Other')}
                  </button>
                </div>
              </div>
            </div>

            {/* Next Stop Section */}
            <div className="card border-accent/20 bg-accent/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Navigation size={80} className="text-accent" />
              </div>
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-accent">
                    <div className="bg-accent p-1.5 rounded-lg">
                      <Navigation size={20} className="text-white" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight">{t('পরবর্তী স্টপেজ', 'Next Stop')}</h3>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <select 
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary bg-white"
                    value={selectedTrip.nextStopId || ''}
                    onChange={(e) => updateNextStop(e.target.value)}
                  >
                    <option value="">{t('পরবর্তী স্টপ নির্বাচন করুন', 'Select Next Stop')}</option>
                    {routes.find(r => r.id === selectedTrip.routeId)?.stops.map(stop => (
                      <option key={stop.counterId} value={stop.counterId}>
                        {counters.find(c => c.id === stop.counterId)?.name}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={!selectedTrip.nextStopId}
                    onClick={handleMarkReached}
                    className="w-full py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    {t('স্টপেজ পৌঁছেছি', 'Reached Stop')}
                  </button>

                  <div className="p-4 bg-white rounded-xl border border-accent/10 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('বর্তমান অবস্থান', 'Current Location')}</p>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <Navigation size={14} className="text-primary" />
                      {selectedTrip.currentLocation ? (
                        <span>{selectedTrip.currentLocation.lat.toFixed(4)}, {selectedTrip.currentLocation.lng.toFixed(4)}</span>
                      ) : (
                        <span className="text-slate-400 italic">{t('অজানা', 'Unknown')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card py-20 text-center space-y-4">
          <div className="inline-flex bg-slate-50 p-6 rounded-full">
            <Users size={48} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-400">{t('একটি ট্রিপ নির্বাচন করুন', 'Please Select a Trip to View Manifest')}</h3>
        </div>
      )}
    </div>
  );
};
