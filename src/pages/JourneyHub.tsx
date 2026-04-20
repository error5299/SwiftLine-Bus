import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuth, useFirebaseData } from '../context/FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Ticket, Phone, Navigation, Download, Clock, MapPin, 
  Bus as BusIcon, CheckCircle2, Printer, Wifi, Coffee, Zap, Info, 
  ShieldCheck, AlertCircle, PhoneCall, ChevronRight, User, Calendar as CalendarIcon,
  LocateFixed, ExternalLink, Map as MapIcon, History, Star, CreditCard, X,
  Gauge, Timer, Wind, Thermometer, Radio, Bell, HelpCircle, Heart,
  Navigation2, Share2, MessageSquare, AlertTriangle, CloudSun, QrCode, Smartphone
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, limit } from 'firebase/firestore';
import { Booking, Trip, Route, Counter, Passenger, Bus, Crew } from '../types';
import { format, parseISO, addMinutes } from 'date-fns';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';
import { cn } from '../lib/utils';
import { safeFormat } from '../utils/dateUtils';

const TZ = 'Asia/Dhaka';

export const JourneyHub: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const data = useFirebaseData();
  const [ticketId, setTicketId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [activeTab, setActiveTab] = useState<'tracking' | 'details' | 'dashboard'>('tracking');
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [recentPassenger, setRecentPassenger] = useState<Passenger | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Simulated Real-time Metrics
  const [speed, setSpeed] = useState(65);
  const [eta, setEta] = useState(45);
  const [temp, setTemp] = useState(24);

  const counters = data.counters || [];

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeed(prev => Math.floor(60 + Math.random() * 15));
      setEta(prev => Math.max(5, prev - (Math.random() > 0.8 ? 1 : 0)));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent bookings if logged in
  useEffect(() => {
    const fetchRecent = async () => {
      if (!user?.email) return;
      try {
        const pQuery = query(collection(db, 'passengers'), where('email', '==', user.email), limit(1));
        const pSnap = await getDocs(pQuery);
        if (!pSnap.empty) {
          const pData = { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } as Passenger;
          setRecentPassenger(pData);
          const bQuery = query(collection(db, 'bookings'), where('passengerId', '==', pSnap.docs[0].id), limit(3));
          const bSnap = await getDocs(bQuery);
          setRecentBookings(bSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
        }
      } catch (err) {
        console.error("Error fetching recent journeys:", err);
      }
    };
    fetchRecent();
  }, [user]);

  const quickTrack = (b: Booking) => {
    setTicketId(b.id);
    if (recentPassenger) setPhone(recentPassenger.phone);
    setLoading(true);
    setError('');
    loadBookingData(b.id, recentPassenger?.phone || '');
  };

  const loadBookingData = async (bid: string, bphone: string) => {
    try {
      const bookingId = bid.trim();
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        const bookingData = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
        const passengerRef = doc(db, 'passengers', bookingData.passengerId);
        const passengerSnap = await getDoc(passengerRef);
        
        if (passengerSnap.exists() && passengerSnap.data().phone === bphone.trim()) {
          setBooking(bookingData);
          setPassenger({ id: passengerSnap.id, ...passengerSnap.data() } as Passenger);
          const tripRef = doc(db, 'trips', bookingData.tripId);
          const tripSnap = await getDoc(tripRef);
          if (tripSnap.exists()) {
            const tripData = { id: tripSnap.id, ...tripSnap.data() } as Trip;
            setTrip(tripData);
            const routeRef = doc(db, 'routes', tripData.routeId);
            const routeSnap = await getDoc(routeRef);
            if (routeSnap.exists()) setRoute({ id: routeSnap.id, ...routeSnap.data() } as Route);
            const busRef = doc(db, 'buses', tripData.busId);
            const busSnap = await getDoc(busRef);
            if (busSnap.exists()) setBus({ id: busSnap.id, ...busSnap.data() } as Bus);
            if (tripData.crewIds && tripData.crewIds.length > 0) {
              const crewSnaps = await Promise.all(tripData.crewIds.map(cid => getDoc(doc(db, 'crew', cid))));
              setCrew(crewSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as Crew)));
            }
          }
          setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        } else {
          setError('Invalid Ticket ID or Phone Number.');
        }
      } else {
        setError('Ticket not found.');
      }
    } catch (err) {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (booking?.tripId) {
      const unsub = onSnapshot(doc(db, 'trips', booking.tripId), (docSnap) => {
        if (docSnap.exists()) setTrip({ id: docSnap.id, ...docSnap.data() } as Trip);
      });
      return () => unsub();
    }
  }, [booking?.tripId]);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    loadBookingData(ticketId, phone);
  };

  const downloadETicket = () => {
    if (!booking) return;
    const boarding = counters.find((c: Counter) => c.id === booking.boardingStopId);
    const dropping = counters.find((c: Counter) => c.id === booking.droppingStopId);
    generateTicketPDF(booking, trip || undefined, route || undefined, boarding, dropping, bus || undefined, passenger || undefined, 'ticket-qrcode');
  };

  const printETicket = () => {
    if (!booking) return;
    const boarding = counters.find((c: Counter) => c.id === booking.boardingStopId);
    const dropping = counters.find((c: Counter) => c.id === booking.droppingStopId);
    printTicketHTML(booking, trip || undefined, route || undefined, boarding, dropping, bus || undefined, passenger || undefined, 'ticket-qrcode');
  };

  return (
    <div className="min-h-screen bg-[#F0F7F7] pb-32">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(58,175,169,0.1)_0%,transparent_70%)] pointer-events-none" />

      {/* Modern Technical Header */}
      <section className="relative pt-24 pb-48 px-6 bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:30px_30px]" />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-primary via-primary/80 to-transparent" />
        
        <div className="relative max-w-5xl mx-auto space-y-12">
            <div className="flex flex-col items-center text-center space-y-6">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-3 px-6 py-2 bg-accent/20 text-accent rounded-full border border-accent/20 backdrop-blur-xl">
                  <Navigation2 size={16} className="animate-bounce" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Command Center v4.0</span>
                </motion.div>
                <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-6xl md:text-8xl font-black text-white tracking-tighter">
                  Journey <span className="text-accent underline decoration-accent/20 underline-offset-[12px]">Hub</span>
                </motion.h1>
                <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-white/50 text-lg max-w-2xl mx-auto font-medium leading-relaxed">
                  Experience the future of travel with real-time telemetry, stop-by-stop metrics, and advanced fleet tracking.
                </motion.p>
            </div>
        </div>
      </section>

      {/* Sleek Floating Search */}
      <div className="relative -mt-24 px-6">
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-w-xl mx-auto bg-white/80 backdrop-blur-3xl p-1 relative rounded-[3.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.15)] border border-white/50">
          <div className="p-8 space-y-8">
            <form onSubmit={handleTrack} className="space-y-6">
              <div className="grid gap-6">
                <div className="relative group">
                  <Ticket className="absolute left-6 top-1/2 -translate-y-1/2 text-accent" size={24} />
                  <input required type="text" placeholder="Ticket ID / PNR" className="w-full pl-16 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] font-black text-primary outline-none focus:ring-4 focus:ring-accent/10 transition-all text-lg placeholder:text-slate-300" value={ticketId} onChange={e => setTicketId(e.target.value)} />
                </div>
                <div className="relative group">
                  <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-accent" size={24} />
                  <input required type="tel" placeholder="Mobile Number" className="w-full pl-16 pr-6 py-5 bg-slate-50 border-none rounded-[2rem] font-black text-primary outline-none focus:ring-4 focus:ring-accent/10 transition-all text-lg placeholder:text-slate-300" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
              {error && <motion.div className="p-4 bg-red-50 text-red-500 rounded-2xl flex items-center gap-3 text-[10px] font-black border border-red-100 uppercase tracking-widest"><AlertCircle size={16} /> {error}</motion.div>}
              <button type="submit" disabled={loading} className="w-full py-6 rounded-[2rem] bg-accent text-white font-black shadow-2xl shadow-accent/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50 text-sm uppercase tracking-[0.2em]">{loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : <> <Search size={20} /> Locate Mission </>}</button>
            </form>

            <AnimatePresence>
                {user && recentBookings.length > 0 && !booking && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-8 border-t border-slate-50 space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2"> <History size={14}/> Active Missions</h3>
                    <div className="grid gap-3">
                      {recentBookings.map(b => (
                        <button key={b.id} onClick={() => quickTrack(b)} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-3xl border border-slate-100 hover:border-accent hover:bg-white transition-all group">
                          <div className="flex items-center gap-4 text-left">
                            <div className="p-3 bg-white rounded-2xl text-accent group-hover:bg-accent group-hover:text-white transition-colors"> <BusIcon size={18} /> </div>
                            <div> <p className="text-xs font-black text-primary">{b.id}</p> <p className="text-[9px] text-slate-400 font-bold">{b.seats.join(', ')} Seats</p> </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-accent translate-x-0 group-hover:translate-x-1 transition-all" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {booking && trip && route && (
          <div ref={resultsRef} className="max-w-7xl mx-auto px-6 mt-24 space-y-12">
            
            {/* Live Metrics Header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { icon: Gauge, label: "Current Speed", value: `${speed} km/h`, color: "text-accent", bg: "bg-accent/5", accent: "bg-accent" },
                  { icon: Timer, label: "Est. arrival", value: `${eta} mins`, color: "text-primary", bg: "bg-primary/5", accent: "bg-primary" },
                  { icon: Thermometer, label: "Internal Temp", value: `${temp}°C`, color: "text-blue-500", bg: "bg-blue-50", accent: "bg-blue-400" },
                  { icon: CloudSun, label: "Outside", value: "Clear Sky", color: "text-orange-500", bg: "bg-orange-50", accent: "bg-orange-400" }
                ].map((stat, i) => (
                  <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-50 relative overflow-hidden group">
                    <div className={cn("absolute bottom-0 left-0 h-1 transition-all group-hover:h-full group-hover:opacity-5", stat.accent)} style={{ width: '100%' }} />
                    <div className="flex items-center gap-4 relative">
                        <div className={cn("p-3 rounded-2xl", stat.bg)}> <stat.icon size={20} className={stat.color} /> </div>
                        <div> <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p> <p className={cn("text-lg font-black", stat.color)}>{stat.value}</p> </div>
                    </div>
                  </motion.div>
                ))}
            </div>

            {/* Unified Hub Navigation */}
            <div className="flex justify-center">
              <div className="bg-white p-2 rounded-full shadow-2xl shadow-slate-200 border border-slate-100 flex gap-1">
                {[
                  { id: 'tracking', label: 'Live Map', icon: MapIcon },
                  { id: 'dashboard', label: 'Console', icon: Gauge },
                  { id: 'details', label: 'Manifest', icon: Ticket }
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("px-8 py-3 rounded-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all", activeTab === tab.id ? "bg-primary text-white shadow-xl scale-[1.05]" : "text-slate-400 hover:bg-slate-50")}>
                    <tab.icon size={16} /> {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'tracking' || activeTab === 'dashboard' ? (
              <div className="grid lg:grid-cols-3 gap-12">
                {/* Visual Timeline & Map */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2 space-y-10">
                  <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-12">
                      <div> <h3 className="text-3xl font-black text-primary tracking-tighter">Mission Progress</h3> <p className="text-xs text-slate-400 font-bold mt-1">Live Telemetry from PNR {booking.id}</p> </div>
                      {trip.currentLocation && <button className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all"> <MapIcon size={14} /> Open Live Map </button>}
                    </div>

                    <div className="relative pl-16 space-y-16 py-4">
                      {/* Technical Track Line */}
                      <div className="absolute left-[31px] top-6 bottom-6 w-1 bg-slate-100 rounded-full" />
                      <motion.div className="absolute left-[31px] top-6 w-1 bg-accent rounded-full origin-top" initial={{ scaleY: 0 }} animate={{ scaleY: (trip.currentStopIndex || 0) / (route.stops.length - 1) }} transition={{ duration: 1.5 }} />

                      {route.stops.map((stop, index) => {
                        const counterId = typeof stop === 'string' ? stop : stop.counterId;
                        const counter = counters.find((c: Counter) => c.id === counterId);
                        const isPassed = index < (trip.currentStopIndex || 0);
                        const isCurrent = index === (trip.currentStopIndex || 0);
                        const log = trip.stopLogs?.find(l => l.counterId === counterId);
                        
                        return (
                          <div key={counterId} className="relative flex items-start group">
                            <div className={cn("absolute -left-16 top-1 w-8 h-8 rounded-2xl border-4 z-10 transition-all duration-700 flex items-center justify-center", isPassed ? "bg-accent border-accent text-white" : isCurrent ? "bg-white border-accent scale-125 shadow-2xl" : "bg-white border-slate-100")}>
                               {isPassed ? <CheckCircle2 size={14} /> : index + 1}
                               {isCurrent && <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 bg-accent rounded-2xl" />}
                            </div>

                            <div className={cn("flex-1 p-8 rounded-[2.5rem] transition-all border", isCurrent ? "bg-slate-50 border-slate-100 shadow-inner" : "border-transparent group-hover:bg-slate-50/50")}>
                              <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                  <h4 className={cn("text-xl font-black", isCurrent ? "text-accent" : "text-primary")}>{counter?.name}</h4>
                                  <div className="flex items-center gap-4">
                                     <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">{counter?.location}</span>
                                     <div className="flex gap-2">
                                        <div className="p-1 px-2 bg-slate-100 rounded-md text-[8px] font-black text-slate-400">REST STOP</div>
                                        <div className="p-1 px-2 bg-slate-100 rounded-md text-[8px] font-black text-slate-400">MEAL OK</div>
                                     </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black text-primary font-num">{log ? safeFormat(log.timestamp, 'hh:mm a') : '--:--'}</p>
                                  <p className={cn("text-[9px] font-black uppercase tracking-widest", log ? "text-accent" : "text-slate-300")}>{log ? 'Accomplished' : 'ETA Arrival'}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Community Alerts & Activity */}
                  <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 flex items-center justify-between">
                     <div className="flex items-center gap-6">
                        <div className="p-5 bg-orange-50 text-orange-500 rounded-[1.5rem]"> <AlertTriangle size={32} /> </div>
                        <div> <h4 className="text-xl font-black text-primary tracking-tight">Incidents & Traffic</h4> <p className="text-sm text-slate-500 font-medium">Road works reported near Sirajganj Terminal. Expect 5 min delay.</p> </div>
                     </div>
                     <button className="px-6 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20">Report Event</button>
                  </div>
                </motion.div>

                {/* Technical Side Panel */}
                <div className="space-y-10">
                   {/* Coach Console */}
                   <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-10">
                      <div className="flex items-center justify-between">
                         <div className="space-y-1"> <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digital Manifest</h4> <p className="text-2xl font-black text-primary tracking-tight">Coach #{trip.coachNumber}</p> </div>
                         <div className="p-4 bg-accent/10 rounded-2xl text-accent"> <BusIcon size={24} /> </div>
                      </div>
                      
                      <div className="grid gap-4">
                         {[
                           { icon: Wifi, label: "Onboard Wifi", val: "Connected 5G", status: "ok" },
                           { icon: Radio, label: "Live Radio", val: "Tuned: SL-FM", status: "ok" },
                           { icon: Zap, label: "Power Ports", val: "Active (240V)", status: "ok" },
                           { icon: Coffee, label: "Restroom", val: "Available", status: "ok" }
                         ].map((item, i) => (
                           <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl group hover:bg-slate-100 transition-colors">
                              <div className="flex items-center gap-4"> <item.icon size={18} className="text-slate-400 group-hover:text-primary transition-colors" /> <span className="text-xs font-bold text-slate-500">{item.label}</span> </div>
                              <span className="text-[10px] font-black text-primary uppercase tracking-widest">{item.val}</span>
                           </div>
                         ))}
                      </div>
                   </motion.div>

                   {/* Comm Center Contacts */}
                   <div className="bg-primary p-10 rounded-[3rem] text-white space-y-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-grid-white/[0.05] [mask-image:radial-gradient(white,transparent_120%)]" />
                      <div className="relative space-y-6">
                        <div className="flex items-center justify-between"> <h4 className="text-xs font-black uppercase tracking-widest text-white/50">Field Personnel</h4> <Bell size={16} className="text-accent" /> </div>
                        <div className="space-y-6">
                           {crew.map(m => (
                             <div key={m.id} className="flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                   <div className="w-12 h-12 rounded-full border-2 border-white/20 p-0.5 overflow-hidden flex items-center justify-center bg-white/10">
                                      {m.photo ? <img src={m.photo} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" /> : <User size={20} className="text-white/40" />}
                                   </div>
                                   <div> <p className="text-sm font-black text-white leading-none">{m.name}</p> <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">{m.role}</p> </div>
                                </div>
                                <a href={`tel:${m.phone}`} className="p-3 bg-white/10 hover:bg-accent text-white rounded-xl transition-all"><Phone size={16} /></a>
                             </div>
                           ))}
                        </div>
                        <button onClick={() => window.open('tel:16500')} className="w-full py-4 bg-accent text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-accent/20">Emergency Dispatch</button>
                      </div>
                   </div>

                   {/* Fleet Integrity Alert */}
                   {trip.emergencyAlert ? (
                     <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 animate-pulse">
                        <div className="flex items-center gap-3 text-red-500 mb-4"> <AlertCircle size={20} /> <h4 className="font-black text-xs uppercase tracking-widest">Critical Alert</h4> </div>
                        <p className="text-sm font-bold text-red-700 leading-relaxed mb-4">{trip.emergencyAlert.message}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-red-400">Broadcasted {safeFormat(trip.emergencyAlert.timestamp, 'hh:mm a')}</p>
                     </div>
                   ) : (
                     <div className="bg-emerald-50/50 p-10 rounded-[3.5rem] border border-emerald-100 text-center space-y-4">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-emerald-500 mx-auto shadow-sm"> <ShieldCheck size={32} /> </div>
                        <h4 className="text-xl font-black text-primary tracking-tight">System Integrity OK</h4>
                        <p className="text-xs text-slate-500 font-medium px-4">All subsystems operational. Coach is tracking within planned trajectory envelopes.</p>
                     </div>
                   )}
                </div>
              </div>
            ) : (
              /* Manifesto / Details View */
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-4 gap-12">
                 <div className="lg:col-span-3 bg-white rounded-[4rem] border border-slate-100 shadow-sm relative overflow-hidden flex flex-col xl:flex-row">
                    <div className="flex-1 p-12 space-y-12 border-r border-slate-50 border-dashed relative">
                        <div className="absolute top-0 right-[-1px] transform translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#F0F7F7] border border-slate-100 rounded-full" />
                        <div className="absolute bottom-0 right-[-1px] transform translate-x-1/2 translate-y-1/2 w-8 h-8 bg-[#F0F7F7] border border-slate-100 rounded-full" />
                        
                        <div className="flex items-center justify-between">
                           <div> <h3 className="text-4xl font-black text-primary tracking-tighter">{route.name}</h3> <p className="text-[10px] font-black text-accent uppercase tracking-widest mt-1">Voyage Manifest {booking.id}</p> </div>
                           <div className="p-6 bg-primary/5 rounded-[2.5rem] text-primary"> <Ticket size={48} strokeWidth={1.5} /> </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-10 gap-x-12">
                           {[
                             { icon: User, label: "Captain of voyage", val: passenger.name },
                             { icon: Phone, label: "Emergency contact", val: passenger.phone },
                             { icon: MapPin, label: "Departure point", val: counters.find(c => c.id === booking.boardingStopId)?.name },
                             { icon: MapPin, label: "Arrival terminal", val: counters.find(c => c.id === booking.droppingStopId)?.name },
                             { icon: CalendarIcon, label: "Launch date", val: safeFormat(trip.departureTime, 'dd MMM, yyyy') },
                             { icon: Clock, label: "Departure T-0", val: safeFormat(trip.departureTime, 'hh:mm a') }
                           ].map((item, i) => (
                             <div key={i} className="space-y-2 group">
                                <div className="flex items-center gap-2 text-slate-400 group-hover:text-accent transition-colors"> <item.icon size={12} /> <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span> </div>
                                <p className="text-base font-black text-primary truncate leading-tight uppercase tracking-tight">{item.val}</p>
                             </div>
                           ))}
                        </div>

                        <div className="pt-10 border-t border-slate-50 flex gap-6">
                           <button onClick={printETicket} className="flex-1 py-5 bg-primary text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"> <Printer size={18} /> Print Manifesto </button>
                           <button onClick={downloadETicket} className="flex-1 py-5 bg-slate-50 text-slate-500 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-100 transition-all shadow-sm"> <Download size={18} /> Export PDF </button>
                        </div>
                    </div>

                    <div className="w-full xl:w-96 p-12 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-10 relative">
                       <div className="absolute inset-0 bg-grid-slate-200/20 [mask-image:radial-gradient(white,transparent_120%)]" />
                       <div className="space-y-2 relative"> <span className="text-[10px] font-black text-accent uppercase tracking-widest">Assigned Inventory</span> <h4 className="text-6xl font-black text-primary tracking-tighter">{booking.seats.join(',')}</h4> <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirmed Seats</span> </div>
                       <div className="w-16 h-1 bg-slate-200 rounded-full relative" />
                       <div className="space-y-4 relative"> <div className="w-40 h-40 bg-white rounded-[3rem] p-6 shadow-2xl shadow-slate-200 border border-white flex items-center justify-center font-black text-slate-100"> <QrCode size={80} /> </div> <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Scan for terminal entry</p> </div>
                    </div>
                 </div>

              </motion.div>
            )}

            {/* Travel Assistance Center */}
            <div className="bg-white/40 backdrop-blur-md p-10 rounded-[3rem] border border-white border-dashed text-center">
               <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-4">SwiftLine Command Protocol</p>
               <div className="flex flex-wrap justify-center gap-10">
                  {[
                    { icon: ShieldCheck, label: "Fleet Coverage" },
                    { icon: Radio, label: "Live Telemetry" },
                    { icon: Smartphone, label: "Cloud manifest" }
                  ].map((feat, i) => (
                    <div key={i} className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"> <feat.icon size={16} className="text-primary" /> <span className="text-[10px] font-black uppercase tracking-widest text-primary">{feat.label}</span> </div>
                  ))}
               </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
