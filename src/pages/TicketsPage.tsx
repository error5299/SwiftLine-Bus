import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Ticket, History, Clock, MapPin, Calendar, Bus as BusIcon, 
  ChevronRight, X, AlertCircle, Download, Printer, Navigation, 
  ArrowRight, ShieldCheck, CreditCard, Info, Map as MapIcon,
  Wifi, Zap, Coffee, Smartphone, ExternalLink, QrCode
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth, useFirebaseData } from '../context/FirebaseProvider';
import { Booking, Trip, Route, Counter, Bus as BusType, Passenger } from '../types';
import { format, parseISO, isPast, isAfter, isBefore, addDays } from 'date-fns';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';

export const TicketsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const globalData = useFirebaseData();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [passengerInfo, setPassengerInfo] = useState<Passenger | null>(null);

  const trips = globalData.trips || [];
  const routes = globalData.routes || [];
  const counters = globalData.counters || [];
  const buses = globalData.buses || [];

  useEffect(() => {
    const fetchBookings = async () => {
      if (!user?.email) return;
      setLoading(true);
      try {
        const pQuery = query(collection(db, 'passengers'), where('email', '==', user.email));
        const pSnap = await getDocs(pQuery);
        
        if (!pSnap.empty) {
          const passData = { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } as Passenger;
          setPassengerInfo(passData);
          
          const bQuery = query(collection(db, 'bookings'), where('passengerId', '==', pSnap.docs[0].id));
          const bSnap = await getDocs(bQuery);
          
          const bookingData = bSnap.docs.map(b => ({ id: b.id, ...b.data() }));
          setBookings(bookingData);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user]);

  const enrichedBookings = useMemo(() => {
    return bookings.map(b => {
      const trip = trips.find(t => t.id === b.tripId);
      const route = routes.find(r => r.id === trip?.routeId);
      const bus = buses.find(bu => bu.id === trip?.busId);
      const boarding = counters.find(c => c.id === b.boardingStopId);
      const dropping = counters.find(c => c.id === b.droppingStopId);
      
      return { 
        ...b, 
        trip, 
        route, 
        bus, 
        boarding, 
        dropping 
      };
    });
  }, [bookings, trips, routes, buses, counters]);

  const upcomingBookings = enrichedBookings.filter(b => {
    if (!b.trip?.departureTime) return false;
    try {
      return !isPast(parseISO(b.trip.departureTime));
    } catch (e) {
      return false;
    }
  }).sort((a, b) => new Date(a.trip.departureTime).getTime() - new Date(b.trip.departureTime).getTime());

  const pastBookings = enrichedBookings.filter(b => {
    if (!b.trip?.departureTime) return false;
    try {
      return isPast(parseISO(b.trip.departureTime));
    } catch (e) {
      return false;
    }
  }).sort((a, b) => new Date(b.trip.departureTime).getTime() - new Date(a.trip.departureTime).getTime());

  const displayBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

  const handlePrint = (b: any) => {
    printTicketHTML(b, b.trip, b.route, b.boarding, b.dropping, b.bus, passengerInfo || undefined);
  };

  const handleDownload = (b: any) => {
    generateTicketPDF(b, b.trip, b.route, b.boarding, b.dropping, b.bus, passengerInfo || undefined);
  };

  return (
    <div className="min-h-screen bg-[#F0F7F7] selection:bg-accent selection:text-white pb-32">
      {/* Immersive Static Header */}
      <div className="bg-primary pt-24 pb-48 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:30px_30px]" />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-primary/50 to-primary" />
        
        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-6 py-2 bg-accent/20 text-accent rounded-full border border-accent/20 backdrop-blur-md"
          >
            <ShieldCheck size={14} className="animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Verified Secure Bookings</span>
          </motion.div>
          
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter">My <span className="text-accent underline decoration-accent/30 underline-offset-8">Journeys</span></h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto font-medium">Manage your digital boarding passes, track your coaches live, and explore your travel history.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-32 relative z-10 space-y-12">
        {/* Navigation Tabs */}
        <div className="flex bg-white/80 backdrop-blur-xl p-2 rounded-[2.5rem] shadow-2xl border border-white/50 max-w-md mx-auto relative group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          {[
            { id: 'upcoming', label: 'Upcoming/Live', icon: Clock },
            { id: 'past', label: 'Past Trips', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 px-8 py-5 rounded-[2rem] flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all relative z-10",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-[0_10px_30px_rgba(23,37,42,0.3)] scale-[1.02]" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-primary"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tickets List */}
        <div className="space-y-8">
          {loading ? (
             <div className="grid gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-64 bg-white/50 rounded-[3rem] animate-pulse border border-white" />
                ))}
             </div>
          ) : displayBookings.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {displayBookings.map((b) => (
                <motion.div 
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-[3.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 relative overflow-hidden flex flex-col md:flex-row group"
                >
                  {/* Left: Journey Info */}
                  <div className="flex-1 p-10 space-y-8 border-r border-slate-50 border-dashed relative">
                    {/* Perforation holes simulation */}
                    <div className="hidden md:block absolute top-0 right-[-14px] w-7 h-7 bg-[#F0F7F7] rounded-full -translate-y-1/2 border border-slate-100 z-10" />
                    <div className="hidden md:block absolute bottom-0 right-[-14px] w-7 h-7 bg-[#F0F7F7] rounded-full translate-y-1/2 border border-slate-100 z-10" />
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-accent/10 rounded-2xl text-accent">
                          <BusIcon size={24} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Trip Details</p>
                          <h3 className="text-2xl font-black text-primary tracking-tighter leading-tight">
                            {b.route?.name || `Route ${b.routeId || 'N/A'}`}
                          </h3>
                        </div>
                      </div>
                      <div className="text-right">
                         <span className="px-5 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                           {b.status || 'Confirmed'}
                         </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <Calendar size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Date</span>
                          </div>
                          <p className="text-sm font-black text-primary">
                            {b.trip?.departureTime ? format(parseISO(b.trip.departureTime), 'dd MMM, yyyy') : 'N/A'}
                          </p>
                       </div>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <Clock size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Departure</span>
                          </div>
                          <p className="text-sm font-black text-primary">
                            {b.trip?.departureTime ? format(parseISO(b.trip.departureTime), 'hh:mm a') : 'N/A'}
                          </p>
                       </div>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <MapPin size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Boarding</span>
                          </div>
                          <p className="text-sm font-black text-primary truncate">
                            {b.boarding?.name || 'Assigned Counter'}
                          </p>
                       </div>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <Ticket size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Seats</span>
                          </div>
                          <p className="text-sm font-black text-accent">{b.seats?.join(', ') || 'N/A'}</p>
                       </div>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <Smartphone size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Coach No</span>
                          </div>
                          <p className="text-sm font-black text-primary">{b.trip?.coachNumber || 'N/A'}</p>
                       </div>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-400">
                             <ShieldCheck size={12} />
                             <span className="text-[9px] font-black uppercase tracking-widest">Fare Paid</span>
                          </div>
                          <p className="text-sm font-black text-emerald-600 font-num">৳ {b.totalFare || 0}</p>
                       </div>
                    </div>

                    <div className="pt-8 border-t border-slate-50 flex flex-wrap gap-4">
                       <button 
                        onClick={() => navigate('/track-journey', { state: { ticketId: b.id, phone: passengerInfo?.phone }})}
                        className="flex-1 min-w-[140px] flex items-center justify-center gap-3 px-6 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                       >
                         <Navigation size={16} />
                         Track Live
                       </button>
                       <button 
                         onClick={() => handlePrint(b)}
                         className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all active:scale-95"
                       >
                         <Printer size={16} />
                         Print
                       </button>
                       <button 
                         onClick={() => handleDownload(b)}
                         className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all active:scale-95"
                       >
                         <Download size={16} />
                         PDF
                       </button>
                    </div>
                  </div>

                  {/* Right: "Stub" with QR and Mini Info */}
                  <div className="w-full md:w-80 bg-slate-50/50 p-10 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid-slate-200/20 [mask-image:radial-gradient(white,transparent_120%)]" />
                    
                    <div className="relative group/qr">
                      <div className="absolute inset-0 bg-accent blur-3xl opacity-0 group-hover/qr:opacity-10 transition-opacity" />
                      <div className="w-32 h-32 bg-white rounded-[2rem] p-4 shadow-2xl shadow-slate-200 relative border border-white">
                        <QrCode className="w-full h-full text-primary opacity-60 group-hover/qr:opacity-100 transition-all" />
                      </div>
                    </div>
                    
                    <div className="space-y-1 relative">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PNR / Ticket ID</p>
                       <p className="text-lg font-black text-primary tracking-tighter truncate max-w-[180px]">{b.id}</p>
                    </div>

                    <div className="flex items-center gap-4 py-4 px-6 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm relative group-hover:scale-105 transition-transform duration-500">
                       <div className="p-2 transition-colors">
                          <BusIcon size={18} className="text-accent" />
                       </div>
                       <div className="text-left">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Coach Class</p>
                          <p className="text-xs font-black text-primary">{b.bus?.isAC ? 'Premium AC' : 'Standard Non-AC'}</p>
                       </div>
                    </div>
                    
                    <button 
                      onClick={() => navigate(`/track-journey`)}
                      className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 hover:text-accent transition-colors"
                    >
                      Scan at counter to board <ExternalLink size={10} />
                    </button>
                  </div>

                  {/* Hover Accent Bar */}
                  <div className="absolute top-0 left-0 w-2 h-full bg-accent scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-32 bg-white rounded-[4rem] border border-dashed border-slate-200 space-y-8"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
                <div className="relative w-32 h-32 bg-accent/5 rounded-[2.5rem] flex items-center justify-center mx-auto text-accent border border-accent/20">
                  <Ticket className="w-16 h-16 animate-bounce" />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black text-primary tracking-tighter">No {activeTab} tickets yet.</h3>
                <p className="text-slate-500 font-medium max-w-sm mx-auto">
                  {activeTab === 'upcoming' 
                    ? "Ready for a new adventure? Search for available trips and book your seats in seconds." 
                    : "Your past travel records will appear here. Start your journey with SwiftLine today!"}
                </p>
              </div>
              <button 
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-3 px-10 py-5 bg-primary text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                Search Buses
                <ArrowRight size={16} />
              </button>
            </motion.div>
          )}
        </div>

        {/* Global Travel Policy Alert */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="bg-white p-10 rounded-[3rem] border border-slate-100 flex flex-col md:flex-row items-center gap-10 shadow-sm overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-12 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex-shrink-0 w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-white shadow-xl shadow-accent/20">
             <ShieldCheck size={32} />
          </div>
          <div className="relative space-y-2">
             <h4 className="text-xl font-black text-primary tracking-tight">Travel Assurance & Support</h4>
             <p className="text-slate-500 font-medium leading-relaxed">
               All digital tickets are subject to our cancellation policy. For immediate assistance with boarding or delays, visit our help center or contact the support helpline available 24/7.
             </p>
             <button className="flex items-center gap-2 text-accent font-black text-[10px] uppercase tracking-widest mt-4 hover:gap-4 transition-all">
                View Policies <ChevronRight size={14} />
             </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
