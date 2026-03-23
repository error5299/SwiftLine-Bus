import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { Trip, Route, Bus, Booking, Passenger, Counter, TripCounterTime } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { SeatMap } from '../components/SeatMap';
import { 
  Search, MapPin, Calendar, Clock, Bus as BusIcon, ChevronRight, 
  CheckCircle2, Download, Map as MapIcon, Navigation, 
  Wifi, Coffee, Zap, Info, ArrowLeftRight, LocateFixed, Star,
  Filter, Sun, Moon, CloudSun, CreditCard, Ticket, X,
  Plus, Edit2, Trash2, UserCheck, Users, Smartphone, Globe, AlertCircle,
  ChevronDown, ChevronUp, Printer, Phone, Mail, Map, ShieldCheck
} from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { generateTicketPDF } from '../utils/ticketGenerator';
import { motion, AnimatePresence } from 'motion/react';

interface PassengerPanelProps {
  initialTracking?: boolean;
}

export const PassengerPanel: React.FC<PassengerPanelProps> = ({ initialTracking }) => {
  const { t } = useLanguage();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [tripCounterTimes, setTripCounterTimes] = useState<TripCounterTime[]>([]);
  
  const TZ = 'Asia/Dhaka';
  
  const [searchParams, setSearchParams] = useState(() => {
    const saved = sessionStorage.getItem('targetSearch');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          from: parsed.from || '',
          to: parsed.to || '',
          date: parsed.date || formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd'),
          isAC: parsed.isAC || false,
          timeSlot: parsed.timeSlot || 'all',
          priceRange: parsed.priceRange || [0, 2000]
        };
      } catch (e) {
        console.error("Error parsing saved search", e);
      }
    }
    return { 
      from: '', 
      to: '', 
      date: formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd'), 
      isAC: false,
      timeSlot: 'all' as 'all' | 'morning' | 'afternoon' | 'night',
      priceRange: [0, 2000]
    };
  });

  const [availableDestinations, setAvailableDestinations] = useState<Counter[]>([]);

  useEffect(() => {
    sessionStorage.setItem('targetSearch', JSON.stringify(searchParams));
  }, [searchParams]);

  // Logic to filter "To" based on "From"
  useEffect(() => {
    if (!searchParams.from) {
      setAvailableDestinations(counters);
      return;
    }

    const fromCounter = counters.find(c => c.id === searchParams.from);
    if (fromCounter && fromCounter.allowedDestinationCounters) {
      const allowed = counters.filter(c => fromCounter.allowedDestinationCounters.includes(c.id));
      setAvailableDestinations(allowed);
    } else {
      setAvailableDestinations([]);
    }
  }, [searchParams.from, counters]);

  const [searchResults, setSearchResults] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripBookings, setSelectedTripBookings] = useState<Booking[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerData, setPassengerData] = useState({ name: '', phone: '', email: '', gender: 'male' as 'male' | 'female' });
  const [isReturning, setIsReturning] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null);
  const [trackCoachNumber, setTrackCoachNumber] = useState('');
  const [trackTicketId, setTrackTicketId] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(() => {
    return !sessionStorage.getItem('noticeDismissed');
  });

  const handleDismissNotice = () => {
    setShowNoticeModal(false);
    sessionStorage.setItem('noticeDismissed', 'true');
  };

  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [genderWarning, setGenderWarning] = useState<{ seat: string } | null>(null);
  const [selectedBoarding, setSelectedBoarding] = useState('');
  const [selectedDropping, setSelectedDropping] = useState('');
  const trackingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialTracking && trips.length > 0) {
      setTrackingTripId(trips[0].id);
      setTimeout(() => {
        trackingRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [initialTracking, trips]);

  useEffect(() => {
    if (selectedTrip) {
      const q = query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id));
      const unsub = onSnapshot(q, (snapshot) => {
        setSelectedTripBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
      });
      setTimeLeft(600);
      return () => unsub();
    }
  }, [selectedTrip]);

  useEffect(() => {
    if (selectedTrip && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      setSelectedTrip(null);
      setSelectedSeats([]);
    }
  }, [selectedTrip, timeLeft]);

  useEffect(() => {
    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    });
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
    });
    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    });
    const unsubTripCounterTimes = onSnapshot(collection(db, 'tripCounterTimes'), (snapshot) => {
      setTripCounterTimes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripCounterTime)));
    });

    if (initialTracking) {
      // Logic to find the most recent booking for the user could go here
    }

    return () => {
      unsubTrips();
      unsubRoutes();
      unsubBuses();
      unsubCounters();
      unsubTripCounterTimes();
    };
  }, [initialTracking]);

  // Auto-fill logic for returning passengers
  useEffect(() => {
    if (passengerData.phone.length === 11) {
      const checkPassenger = async () => {
        const q = query(collection(db, 'passengers'), where('phone', '==', passengerData.phone));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setPassengerData(prev => ({ ...prev, name: data.name, email: data.email, gender: data.gender || 'male' }));
          setIsReturning(true);
        } else {
          setIsReturning(false);
        }
      };
      checkPassenger();
    }
  }, [passengerData.phone]);

  const handleSearch = useCallback(() => {
    const results = trips.filter(trip => {
      const route = routes.find(r => r.id === trip.routeId);
      const bus = buses.find(b => b.id === trip.busId);
      const tripDate = formatInTimeZone(new Date(trip.departureTime), TZ, 'yyyy-MM-dd');
      const tripHour = parseInt(formatInTimeZone(new Date(trip.departureTime), TZ, 'HH'));
      
      let matchesTime = true;
      if (searchParams.timeSlot === 'morning') matchesTime = tripHour >= 5 && tripHour < 12;
      else if (searchParams.timeSlot === 'afternoon') matchesTime = tripHour >= 12 && tripHour < 18;
      else if (searchParams.timeSlot === 'night') matchesTime = tripHour >= 18 || tripHour < 5;

      // Location matching using IDs
      const fromCounterId = searchParams.from;
      const toCounterId = searchParams.to;
      
      const routeHasFrom = route?.stops.some(s => (typeof s === 'string' ? s : s.counterId) === fromCounterId);
      const routeHasTo = route?.stops.some(s => (typeof s === 'string' ? s : s.counterId) === toCounterId);
      
      // Ensure 'from' comes before 'to' in stops
      let correctOrder = true;
      if (route && fromCounterId && toCounterId) {
        const fromIndex = route.stops.findIndex(s => (typeof s === 'string' ? s : s.counterId) === fromCounterId);
        const toIndex = route.stops.findIndex(s => (typeof s === 'string' ? s : s.counterId) === toCounterId);
        correctOrder = fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
      }

      return tripDate === searchParams.date && 
             new Date(trip.departureTime) > new Date() &&
             (!searchParams.isAC || bus?.isAC) &&
             matchesTime &&
             trip.status !== 'cancelled' &&
             (!searchParams.from || routeHasFrom) &&
             (!searchParams.to || routeHasTo) &&
             correctOrder &&
             (trip.fare || 500) <= searchParams.priceRange[1];
    });
    setSearchResults(results);
  }, [trips, routes, buses, searchParams, TZ]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handleSwapLocations = () => {
    setSearchParams(prev => ({ ...prev, from: prev.to, to: prev.from }));
  };

  const generateTicketId = () => {
    const numbers = Math.floor(100000 + Math.random() * 900000);
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    return `SL-${numbers}${letters}`;
  };

  const handleBooking = async () => {
    if (!selectedTrip || selectedSeats.length === 0 || !passengerData.name || !passengerData.phone || !selectedBoarding || !selectedDropping) {
      alert(t('অনুগ্রহ করে সব তথ্য পূরণ করুন', 'Please fill all required fields'));
      return;
    }

    try {
      let passengerId = '';
      const q = query(collection(db, 'passengers'), where('phone', '==', passengerData.phone));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        const pDoc = await addDoc(collection(db, 'passengers'), { ...passengerData, isBlacklisted: false });
        passengerId = pDoc.id;
      } else {
        passengerId = snapshot.docs[0].id;
      }

      const ticketId = generateTicketId();

      const bookingData: Partial<Booking> = {
        id: ticketId, // Use custom ID
        tripId: selectedTrip.id,
        passengerId,
        seats: selectedSeats,
        gender: passengerData.gender,
        boardingStopId: selectedBoarding, 
        droppingStopId: selectedDropping, 
        totalFare: selectedSeats.length * (selectedTrip.fare || 500),
        timestamp: new Date().toISOString(),
        status: 'confirmed',
        bookedByCounterId: 'online'
      };
      
      // Use setDoc with custom ID
      await setDoc(doc(db, 'bookings', ticketId), bookingData);
      
      setBookingSuccess(bookingData as Booking);
      setSelectedTrip(null);
      setSelectedSeats([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    }
  };

  const downloadETicket = () => {
    if (!bookingSuccess) return;
    const trip = trips.find(t => t.id === bookingSuccess.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const boarding = counters.find(c => c.id === bookingSuccess.boardingStopId);
    const dropping = counters.find(c => c.id === bookingSuccess.droppingStopId);
    const bus = buses.find(b => b.id === trip?.busId);

    generateTicketPDF(
      bookingSuccess,
      trip,
      route,
      boarding,
      dropping,
      bus,
      passengerData,
      'ticket-qrcode'
    );
  };

  const handleCoachTrack = () => {
    const trip = trips.find(t => t.coachNumber?.toLowerCase() === trackCoachNumber.toLowerCase());
    if (trip) {
      setTrackingTripId(trip.id);
      setShowCoachModal(false);
      setTimeout(() => trackingRef.current?.scrollIntoView({ behavior: 'smooth' }), 500);
    } else {
      alert(t('কোচ আইডি পাওয়া যায়নি', 'Coach ID not found'));
    }
  };

  const handleTicketTrack = async () => {
    if (!trackTicketId || !trackPhone) {
      alert(t('অনুগ্রহ করে সব তথ্য পূরণ করুন', 'Please fill all required fields'));
      return;
    }
    setLoading(true);
    try {
      const bookingRef = doc(db, 'bookings', trackTicketId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data() as Booking;
        const passengerRef = doc(db, 'passengers', bookingData.passengerId);
        const passengerSnap = await getDoc(passengerRef);

        if (passengerSnap.exists() && passengerSnap.data().phone === trackPhone) {
          setTrackingTripId(bookingData.tripId);
          setShowTicketModal(false);
          setTimeout(() => trackingRef.current?.scrollIntoView({ behavior: 'smooth' }), 500);
        } else {
          alert(t('টিকিট আইডি বা ফোন নম্বর ভুল।', 'Invalid Ticket ID or Phone Number.'));
        }
      } else {
        alert(t('টিকিট পাওয়া যায়নি।', 'Ticket not found.'));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'bookings');
    } finally {
      setLoading(false);
    }
  };

  const renderTracking = (tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    if (!trip || !route) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-premium border-accent/20 bg-accent/5"
      >
        <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
          <Navigation className="text-accent animate-pulse" />
          {t('লাইভ ট্র্যাকিং', 'Live Tracking')} - {route.name}
        </h3>
        
        <div className="relative py-12">
          {/* Progress Bar Background */}
          <div className="absolute top-1/2 left-0 w-full h-2 bg-slate-200 -translate-y-1/2 rounded-full" />
          {/* Active Progress */}
          <motion.div 
            className="absolute top-1/2 left-0 h-2 bg-accent -translate-y-1/2 rounded-full shadow-[0_0_15px_rgba(0,116,217,0.5)]" 
            initial={{ width: 0 }}
            animate={{ width: `${((trip.currentStopIndex || 0) / (route.stops.length - 1)) * 100}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          
          <div className="flex justify-between relative">
            {route.stops.map((stop, index) => {
              const counterId = typeof stop === 'string' ? stop : stop.counterId;
              const counter = counters.find(c => c.id === counterId);
              const isPassed = index < (trip.currentStopIndex || 0);
              const isCurrent = index === (trip.currentStopIndex || 0);
              const log = trip.stopLogs?.find(l => l.counterId === counterId);

              return (
                <div key={counterId || index} className="flex flex-col items-center group">
                  <div className={`
                    w-6 h-6 rounded-full border-4 z-10 transition-all duration-500
                    ${isPassed ? "bg-accent border-accent scale-110" : 
                      isCurrent ? "bg-white border-accent scale-125 shadow-lg" : 
                      "bg-white border-slate-300"}
                  `}>
                    {isCurrent && <div className="w-full h-full bg-accent/20 rounded-full animate-ping" />}
                  </div>
                  <div className="absolute mt-8 flex flex-col items-center">
                    <span className={`text-xs font-bold mt-2 whitespace-nowrap ${isCurrent ? "text-accent" : "text-slate-500"}`}>
                      {counter?.name || counterId}
                    </span>
                    {log ? (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {t('অতিক্রম', 'Passed')} <span className="font-num">{format(new Date(log.timestamp), 'hh:mm a')}</span>
                      </span>
                    ) : isCurrent ? (
                      <span className="text-[10px] text-accent font-bold animate-pulse">
                        {t('বর্তমান অবস্থান', 'Current Location')}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-16 p-6 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-accent/10 p-3 rounded-xl">
              <BusIcon className="text-accent" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('বাসের অবস্থা', 'Bus Status')}</p>
              <p className="text-lg font-bold text-primary">
                {trip.status === 'departed' ? t('বাসটি বর্তমানে পথে আছে।', 'The bus is currently on its way.') : t('বাসটি এখনো যাত্রা শুরু করেনি।', 'The bus has not started its journey yet.')}
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 text-accent font-bold hover:underline">
            <MapIcon size={18} />
            {t('মানচিত্রে দেখুন', 'View on Map')}
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-16 pb-20">
      <style>{`
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .moving-gradient {
          background: linear-gradient(-45deg, #0074D9, #7FDBFF, #39CCCC, #0074D9);
          background-size: 400% 400%;
          animation: gradientMove 10s ease infinite;
        }
      `}</style>
      {/* Hero Section */}
      <section className="relative py-12 md:py-24 px-4 md:px-8 rounded-[2.5rem] overflow-hidden bg-primary shadow-2xl">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/swiftline/1920/1080?blur=2" alt="Hero" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center space-y-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-white leading-tight">
              {t('আপনার যাত্রা শুরু হোক সুইফটলাইনের সাথে', 'Start Your Journey with SwiftLine')}
            </h1>
            <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto font-medium">
              {t('বাংলাদেশের সবচেয়ে নিরাপদ এবং আরামদায়ক বাস টিকেট বুকিং প্ল্যাটফর্ম।', 'The safest and most comfortable bus ticketing platform in Bangladesh.')}
            </p>
          </motion.div>

          {/* Search Box */}
          <div className="bg-white p-4 md:p-8 rounded-[2.5rem] shadow-2xl grid grid-cols-1 md:grid-cols-7 gap-6 items-end relative mt-12">
            <div className="md:col-span-2 text-left relative">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">{t('কোথা থেকে', 'From')}</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <select 
                  className="input-field pl-12 appearance-none cursor-pointer"
                  value={searchParams.from}
                  onChange={e => setSearchParams({ ...searchParams, from: e.target.value, to: '' })}
                >
                  <option value="">{t('কাউন্টার নির্বাচন করুন', 'Select Counter')}</option>
                  {counters.map(counter => (
                    <option key={counter.id} value={counter.id}>{counter.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-center md:pt-6">
              <button 
                onClick={handleSwapLocations}
                className="p-4 bg-accent text-white rounded-full shadow-lg hover:rotate-180 transition-all duration-500 active:scale-90"
              >
                <ArrowLeftRight size={20} />
              </button>
            </div>

            <div className="md:col-span-2 text-left">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">{t('কোথায়', 'To')}</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <select 
                  className="input-field pl-12 appearance-none cursor-pointer disabled:opacity-50"
                  value={searchParams.to}
                  onChange={e => setSearchParams({ ...searchParams, to: e.target.value })}
                  disabled={!searchParams.from}
                >
                  <option value="">{t('গন্তব্য নির্বাচন করুন', 'Select Destination')}</option>
                  {availableDestinations.map(counter => (
                    <option key={counter.id} value={counter.id}>{counter.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-1 text-left">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">{t('তারিখ', 'Date')}</label>
              <div className="relative group">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <div className="input-field pl-12 flex items-center cursor-pointer relative">
                  <span className="text-primary font-bold">
                    {searchParams.date ? format(new Date(searchParams.date), 'dd-MM-yyyy') : t('তারিখ নির্বাচন করুন', 'Select Date')}
                  </span>
                  <input 
                    type="date" 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={searchParams.date}
                    onClick={(e) => {
                      try {
                        if ('showPicker' in HTMLInputElement.prototype) {
                          (e.target as HTMLInputElement).showPicker();
                        }
                      } catch (err) {}
                    }}
                    onChange={e => setSearchParams({ ...searchParams, date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={handleSearch} 
              className="btn-primary !py-5 rounded-2xl shadow-xl shadow-accent/20"
            >
              <Search size={22} />
              <span className="text-lg">{t('সার্চ করুন', 'Search')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Modals */}
      <AnimatePresence>
        {showCoachModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={() => setShowCoachModal(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
              <div className="text-center space-y-6">
                <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
                  <Navigation className="text-emerald-600" size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-primary">{t('বাস ট্র্যাক করুন', 'Track Your Bus')}</h3>
                  <p className="text-slate-500 font-medium">{t('আপনার বাসের কোচ নম্বর লিখুন', 'Enter your bus coach number')}</p>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="e.g. SL-101"
                    className="input-field text-center text-2xl tracking-widest"
                    value={trackCoachNumber}
                    onChange={e => setTrackCoachNumber(e.target.value.toUpperCase())}
                  />
                  <button onClick={handleCoachTrack} className="btn-primary w-full !py-5 rounded-2xl text-lg">
                    {t('ট্র্যাক করুন', 'Track Now')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showTicketModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={() => setShowTicketModal(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
              <div className="text-center space-y-6">
                <div className="bg-accent/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
                  <Ticket className="text-accent" size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-primary">{t('টিকিট ট্র্যাক করুন', 'Track Your Ticket')}</h3>
                  <p className="text-slate-500 font-medium">{t('আপনার টিকিট আইডি লিখুন', 'Enter your ticket ID')}</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('টিকিট আইডি', 'Ticket ID')}</label>
                    <input 
                      type="text" 
                      placeholder="SL-XXXXXX"
                      className="input-field text-center text-xl tracking-widest"
                      value={trackTicketId}
                      onChange={e => setTrackTicketId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('ফোন নম্বর', 'Phone Number')}</label>
                    <input 
                      type="tel" 
                      placeholder="01XXXXXXXXX"
                      className="input-field text-center text-xl tracking-widest"
                      value={trackPhone}
                      onChange={e => setTrackPhone(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleTicketTrack}
                    disabled={loading}
                    className="btn-primary w-full !py-5 rounded-2xl text-lg disabled:opacity-50"
                  >
                    {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('ট্র্যাক করুন', 'Track Now')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showNoticeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-primary/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] p-10 w-full max-w-lg shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent to-emerald-500" />
              <button onClick={handleDismissNotice} className="absolute top-8 right-8 p-3 hover:bg-slate-100 rounded-full transition-colors group">
                <X size={24} className="text-slate-400 group-hover:text-primary" />
              </button>
              
              <div className="text-center space-y-8">
                <div className="bg-accent/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto animate-bounce">
                  <Info className="text-accent" size={40} />
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-primary leading-tight">
                    {t('আসসালামু আলাইকুম', 'Assalamu Alaikum')}
                  </h3>
                  <div className="h-1 w-20 bg-accent/20 mx-auto rounded-full" />
                </div>

                <div className="space-y-6 text-left">
                  <div className="bg-slate-50 p-6 rounded-3xl border-l-4 border-accent shadow-sm">
                    <p className="text-slate-700 font-bold leading-relaxed">
                      ১। ঈদের সময়ে বাস শুধুমাত্র খালেকপাম্প কাউন্টার হতে ছেড়ে যাবে। অনলাইনে টিকিট করা যাত্রীদের অনুরোধ করা যাচ্ছে খালেকপাম্প থেকে বাসে উঠতে।
                    </p>
                  </div>
                  
                  <div className="bg-emerald-50 p-6 rounded-3xl border-l-4 border-emerald-500 shadow-sm">
                    <p className="text-slate-700 font-bold leading-relaxed">
                      ২। টিকেট ক্রয়ের পরে এবং যাত্রা শুরুর আগে টিকিট ট্র্যাক/যাচাই করে নিবেন। কোনো সমস্যা হলে কল সেন্টার এ যোগাযোগ করুন।
                    </p>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <div className="bg-primary/5 p-6 rounded-3xl">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('কল সেন্টার', 'Call Center')}</p>
                    <p className="text-2xl font-black text-primary tracking-wider">01841-000026, 01841-000036</p>
                    <p className="text-sm font-bold text-slate-500 mt-1">{t('সকাল ৬টা - রাত ১১:৩০ টা', '6 AM - 11:30 PM')}</p>
                  </div>
                  
                  <button 
                    onClick={handleDismissNotice}
                    className="btn-primary w-full !py-5 rounded-2xl text-lg shadow-xl shadow-accent/20"
                  >
                    {t('ঠিক আছে, বুঝেছি', 'Got it, Thanks')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="grid lg:grid-cols-4 gap-8">
        {/* Sidebar Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.aside 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="lg:col-span-1 space-y-6"
            >
              <div className="card-premium sticky top-24">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Filter size={20} className="text-accent" />
                    {t('ফিল্টার', 'Filters')}
                  </h3>
                  <button 
                    onClick={() => setSearchParams({ ...searchParams, timeSlot: 'all', isAC: false, priceRange: [0, 2000] })}
                    className="text-xs font-bold text-accent uppercase tracking-widest hover:underline"
                  >
                    {t('রিসেট', 'Reset')}
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Time Slots */}
                  <div className="space-y-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('সময়', 'Departure Time')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'morning', label: t('সকাল', 'Morning'), icon: Sun },
                        { id: 'afternoon', label: t('দুপুর', 'Afternoon'), icon: CloudSun },
                        { id: 'night', label: t('রাত', 'Night'), icon: Moon },
                        { id: 'all', label: t('সব', 'All'), icon: Info },
                      ].map(slot => (
                        <button
                          key={slot.id}
                          onClick={() => setSearchParams({ ...searchParams, timeSlot: slot.id as any })}
                          className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                            searchParams.timeSlot === slot.id 
                              ? 'bg-accent border-accent text-white shadow-md' 
                              : 'bg-white border-slate-100 text-slate-500 hover:border-accent/30'
                          }`}
                        >
                          <slot.icon size={14} />
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bus Type */}
                  <div className="space-y-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('বাসের ধরন', 'Bus Type')}</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSearchParams({ ...searchParams, isAC: false })}
                        className={`flex-1 p-3 rounded-xl border text-xs font-bold transition-all ${!searchParams.isAC ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        Non-AC
                      </button>
                      <button 
                        onClick={() => setSearchParams({ ...searchParams, isAC: true })}
                        className={`flex-1 p-3 rounded-xl border text-xs font-bold transition-all ${searchParams.isAC ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        AC
                      </button>
                    </div>
                  </div>

                  {/* Price Range */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('ভাড়া', 'Price Range')}</p>
                      <span className="text-xs font-bold text-primary"><span className="font-num">৳ 500 - ৳ {searchParams.priceRange[1]}</span></span>
                    </div>
                    <input 
                      type="range" 
                      min="500" 
                      max="2000" 
                      step="100"
                      value={searchParams.priceRange[1]}
                      onChange={(e) => setSearchParams({ ...searchParams, priceRange: [500, parseInt(e.target.value)] })}
                      className="w-full accent-accent" 
                    />
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Search Results List */}
        <div className={`${showFilters ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-6`}>
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowTicketModal(true)}
              className="group bg-white border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-3 hover:border-accent hover:shadow-xl transition-all duration-500"
            >
              <div className="bg-accent/10 p-4 rounded-2xl group-hover:bg-accent transition-colors">
                <Ticket className="text-accent group-hover:text-white" size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-black text-primary">{t('টিকিট ট্র্যাক করুন', 'Track Your Ticket')}</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">{t('টিকিট আইডি দিয়ে', 'Using Ticket ID')}</p>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCoachModal(true)}
              className="group bg-white border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-3 hover:border-emerald-500 hover:shadow-xl transition-all duration-500"
            >
              <div className="bg-emerald-500/10 p-4 rounded-2xl group-hover:bg-emerald-500 transition-colors">
                <Navigation className="text-emerald-500 group-hover:text-white" size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-black text-primary">{t('বাস ট্র্যাক করুন', 'Track Your Bus')}</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">{t('কোচ আইডি দিয়ে', 'Using Coach ID')}</p>
              </div>
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            {searchResults.length > 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="bg-accent/10 p-2 rounded-lg">
                      <BusIcon size={20} className="text-accent" />
                    </div>
                    <h2 className="text-lg font-bold text-primary">
                      <span className="font-num">{searchResults.length}</span> {t('টি বাস পাওয়া গেছে', 'Buses Found')}
                    </h2>
                  </div>
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      showFilters 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Filter size={14} className={showFilters ? 'text-white' : 'text-accent'} />
                    {t('ফিল্টার', 'Filter')}
                  </button>
                </div>

                <div className="grid gap-6">
                {searchResults.map(trip => {
                  const route = routes.find(r => r.id === trip.routeId);
                  const bus = buses.find(b => b.id === trip.busId);
                  const tripDate = new Date(trip.departureTime);
                  
                  return (
                    <motion.div 
                      key={trip.id} 
                      layout
                      className="card-premium group hover:border-accent/30 transition-all overflow-hidden"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative">
                        {/* Date Highlight with Moving Gradient */}
                        <div className="absolute top-0 left-0 h-full w-1.5 moving-gradient hidden md:block" />
                        
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-center justify-center bg-slate-50 p-4 rounded-2xl group-hover:bg-accent/5 transition-colors min-w-[100px]">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatInTimeZone(tripDate, TZ, 'MMM')}</span>
                            <span className="text-3xl font-black text-primary font-num">{formatInTimeZone(tripDate, TZ, 'dd')}</span>
                            <span className="text-[10px] font-bold text-slate-500">{formatInTimeZone(tripDate, TZ, 'yyyy')}</span>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-black text-primary">{route?.name}</h3>
                              <span className="flex items-center gap-1 bg-yellow-400/10 text-yellow-700 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                <Star size={10} fill="currentColor" /> <span className="font-num">4.9</span>
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 font-medium">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('রওনা', 'Departure')}</span>
                                <span className="flex items-center gap-1.5 text-accent text-xl font-black font-num">
                                  <Clock size={20} /> 
                                  {(() => {
                                    const counterTime = tripCounterTimes.find(t => t.tripId === trip.id && t.counterId === selectedBoarding);
                                    if (counterTime) {
                                      return format(parseISO(counterTime.departureTime), 'hh:mm a');
                                    }
                                    return formatInTimeZone(tripDate, TZ, 'hh:mm a');
                                  })()}
                                </span>
                              </div>
                              
                              <div className="h-8 w-px bg-slate-100 hidden md:block" />
                              
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('বাসের ধরন', 'Bus Type')}</span>
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  <BusIcon size={16} className="text-accent" /> 
                                  {bus?.isAC ? 'AC' : 'Non-AC'}
                                </span>
                              </div>

                              <div className="h-8 w-px bg-slate-100 hidden md:block" />

                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('আসন', 'Seats')}</span>
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  <MapPin size={16} className="text-accent" /> 
                                  <span className="font-num">{bus?.capacity}</span> {t('আসন', 'Seats')}
                                </span>
                              </div>
                              
                              {trip.coachNumber && (
                                <span className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-lg text-xs font-black">
                                  {t('কোচ:', 'Coach:') } <span className="font-num">{trip.coachNumber}</span>
                                </span>
                              )}
                            </div>
                            
                            {/* Amenities Icons */}
                            <div className="flex items-center gap-4 pt-2">
                              <div className="flex items-center gap-1.5 text-slate-400 hover:text-accent transition-colors cursor-help" title="Free Wi-Fi">
                                <Wifi size={16} className={bus?.isWiFi ? "text-emerald-500" : ""} />
                                <span className="text-[10px] font-bold uppercase tracking-tighter">WiFi</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-400 hover:text-accent transition-colors cursor-help" title="Water & Snacks">
                                <Coffee size={16} className={bus?.isFood ? "text-emerald-500" : ""} />
                                <span className="text-[10px] font-bold uppercase tracking-tighter">Food</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-400 hover:text-accent transition-colors cursor-help" title="USB Charging">
                                <Zap size={16} className={bus?.isCharging ? "text-emerald-500" : ""} />
                                <span className="text-[10px] font-bold uppercase tracking-tighter">Power</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between md:flex-col md:items-end gap-4 border-t md:border-t-0 pt-4 md:pt-0">
                          <div className="text-left md:text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{t('ভাড়া', 'Fare')}</p>
                            <p className="text-3xl font-black text-primary"><span className="font-num">৳ {trip.fare || 500}</span></p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setSelectedTrip(trip)}
                              className="btn-primary !px-10 flex items-center gap-2 group/btn"
                            >
                              {t('আসন দেখুন', 'View Seats')}
                              <ChevronRight size={20} className="group-hover/btn:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
            ) : (
              <div className="card-premium py-20 text-center space-y-4">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                  <Search size={32} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-400">{t('কোনো বাস পাওয়া যায়নি', 'No Buses Found')}</h3>
                <p className="text-slate-400 text-sm">{t('অনুগ্রহ করে অন্য কোনো তারিখ বা রুট চেষ্টা করুন।', 'Please try another date or route.')}</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {selectedTrip && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-primary/40 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] w-full max-w-6xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
            >
              <button 
                onClick={() => setSelectedTrip(null)}
                className="absolute top-8 right-8 p-3 bg-slate-100 rounded-full hover:bg-red-50 hover:text-red-500 transition-all z-10"
              >
                <X size={24} />
              </button>

              <div className="p-12 grid lg:grid-cols-5 gap-16">
                {/* Left: Seat Selection */}
                <div className="lg:col-span-3 space-y-10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-primary flex items-center gap-3">
                      <MapIcon className="text-accent" size={32} />
                      {t('আসন নির্বাচন করুন', 'Select Your Seat')}
                    </h3>
                    <div className="text-right">
                      <div className="text-lg font-black text-primary">{formatInTimeZone(new Date(selectedTrip.departureTime), TZ, 'hh:mm a')}</div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{formatInTimeZone(new Date(selectedTrip.departureTime), TZ, 'dd MMM yyyy')}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-slate-200" />
                        <span className="text-xs font-bold text-slate-500">{t('উপলব্ধ', 'Available')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-female" />
                        <span className="text-xs font-bold text-female">{t('মহিলা', 'Female')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-accent" />
                        <span className="text-xs font-bold text-accent">{t('নির্বাচিত', 'Selected')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-12 rounded-[3rem] border border-slate-100">
                    <SeatMap
                      capacity={buses.find(b => b.id === selectedTrip?.busId)?.capacity || 40}
                      layout={buses.find(b => b.id === selectedTrip?.busId)?.layout || '2+2'}
                      bookedSeats={selectedTripBookings.flatMap(b => b.seats)}
                      femaleBookedSeats={selectedTripBookings.filter(b => b.gender === 'female').flatMap(b => b.seats)}
                      selectedSeats={selectedSeats}
                      lockedSeats={[]}
                      onSeatClick={(seat) => {
                        if (selectedSeats.includes(seat)) {
                          setSelectedSeats(prev => prev.filter(s => s !== seat));
                          return;
                        }
                        
                        // Gender check
                        const row = seat.slice(0, -1);
                        const letter = seat.slice(-1);
                        const adjacentLetter = letter === 'A' ? 'B' : letter === 'B' ? 'A' : letter === 'C' ? 'D' : 'C';
                        const adjacentSeat = `${row}${adjacentLetter}`;
                        
                        const adjacentBooking = selectedTripBookings.find(b => b.seats.includes(adjacentSeat));
                        if (adjacentBooking && passengerData.gender === 'male' && adjacentBooking.gender === 'female') {
                          setGenderWarning({ seat });
                          return;
                        }

                        if (selectedSeats.length < 4) setSelectedSeats(prev => [...prev, seat]);
                      }}
                    />
                  </div>
                  
                  {/* Boarding/Dropping Selection */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">{t('বোর্ডিং পয়েন্ট', 'Boarding Point')}</label>
                      <select 
                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent"
                        value={selectedBoarding}
                        onChange={e => setSelectedBoarding(e.target.value)}
                      >
                        <option value="">{t('বোর্ডিং পয়েন্ট নির্বাচন করুন', 'Select Boarding Point')}</option>
                        {(selectedTrip.boardingPoints || routes.find(r => r.id === selectedTrip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => {
                          return (
                            <option key={counterId || idx} value={counterId}>
                              {counters.find(c => c.id === counterId)?.name || counterId}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">{t('ড্রপিং পয়েন্ট', 'Dropping Point')}</label>
                      <select 
                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent"
                        value={selectedDropping}
                        onChange={e => setSelectedDropping(e.target.value)}
                      >
                        <option value="">{t('ড্রপিং পয়েন্ট নির্বাচন করুন', 'Select Dropping Point')}</option>
                        {(selectedTrip.droppingPoints || routes.find(r => r.id === selectedTrip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => {
                          return (
                            <option key={counterId || idx} value={counterId}>
                              {counters.find(c => c.id === counterId)?.name || counterId}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Right: Checkout */}
                <div className="lg:col-span-2">
                  <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 sticky top-0 space-y-10">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-primary">{t('প্যাসেঞ্জার তথ্য', 'Passenger Details')}</h3>
                      <p className="text-sm text-slate-500 font-medium">{t('টিকিট নিশ্চিত করতে আপনার তথ্য দিন।', 'Enter your details to confirm booking.')}</p>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('মোবাইল নম্বর', 'Mobile Number')}</label>
                        <input 
                          type="tel"
                          placeholder="01XXXXXXXXX" 
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                          value={passengerData.phone}
                          onChange={e => setPassengerData({ ...passengerData, phone: e.target.value })}
                        />
                      </div>

                      <AnimatePresence>
                        {isReturning && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3"
                          >
                            <CheckCircle2 className="text-emerald-500" size={20} />
                            <span className="text-xs font-bold text-emerald-700">{t('আপনাকে পুনরায় স্বাগতম!', 'Welcome Back!')}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('লিঙ্গ', 'Gender')}</label>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setPassengerData({ ...passengerData, gender: 'male' })}
                            className={`flex-1 py-3 rounded-xl border font-bold transition-all ${passengerData.gender === 'male' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-100'}`}
                          >
                            {t('পুরুষ', 'Male')}
                          </button>
                          <button 
                            onClick={() => setPassengerData({ ...passengerData, gender: 'female' })}
                            className={`flex-1 py-3 rounded-xl border font-bold transition-all ${passengerData.gender === 'female' ? 'bg-female text-white border-female' : 'bg-white text-slate-500 border-slate-100'}`}
                          >
                            {t('মহিলা', 'Female')}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('পুরো নাম', 'Full Name')}</label>
                        <input 
                          placeholder={t('আপনার নাম লিখুন', 'Enter your name')} 
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                          value={passengerData.name}
                          onChange={e => setPassengerData({ ...passengerData, name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('ইমেইল অ্যাড্রেস', 'Email Address')}</label>
                        <input 
                          type="email"
                          placeholder="example@mail.com" 
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                          value={passengerData.email}
                          onChange={e => setPassengerData({ ...passengerData, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="pt-10 border-t border-slate-200 space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-bold">{t('নির্বাচিত আসন', 'Selected Seats')}</span>
                          <span className="text-primary font-black font-num">{selectedSeats.join(', ') || 'None'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-bold">{t('মোট ভাড়া', 'Total Fare')}</span>
                          <span className="text-4xl font-black text-primary"><span className="font-num">৳ {selectedSeats.length * (selectedTrip.fare || 500)}</span></span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{t('পেমেন্ট মেথড', 'Secure Payment Gateway')}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {['bKash', 'Nagad', 'Rocket', 'Card'].map(p => (
                            <div key={p} className="aspect-square bg-white border border-slate-100 rounded-xl flex items-center justify-center grayscale hover:grayscale-0 cursor-pointer transition-all">
                              <span className="text-[10px] font-black text-slate-400">{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button 
                        onClick={handleBooking}
                        disabled={selectedSeats.length === 0 || !passengerData.name || !passengerData.phone}
                        className="w-full btn-primary !py-5 rounded-[1.5rem] shadow-2xl shadow-accent/30 disabled:opacity-50 flex items-center justify-center gap-3"
                      >
                        <CreditCard size={24} />
                        <span className="text-xl">{t('পেমেন্ট করুন', 'Pay & Confirm')}</span>
                      </button>
                      
                      {/* Seat Timer */}
                      <div className="flex items-center justify-center gap-2 text-slate-400">
                        <Clock size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {t('আসনটি সংরক্ষিত:', 'Seats held for:')} <span className="font-num">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gender Warning Modal */}
      <AnimatePresence>
        {genderWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-8 rounded-[2rem] max-w-md w-full text-center space-y-6 shadow-2xl"
            >
              <div className="bg-female/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <Info className="text-female" size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-primary">{t('লিঙ্গ সতর্কতা', 'Gender Warning')}</h3>
                <p className="text-slate-500 font-medium">
                  {t('এই আসনের পাশের আসনটি একজন মহিলা যাত্রী বুক করেছেন। আপনি কি নিশ্চিত যে আপনি এটি বুক করতে চান?', 'The adjacent seat is booked by a female passenger. Are you sure you want to book this seat?')}
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setGenderWarning(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  {t('না', 'No')}
                </button>
                <button 
                  onClick={() => {
                    setSelectedSeats(prev => [...prev, genderWarning.seat]);
                    setGenderWarning(null);
                  }}
                  className="flex-1 py-4 bg-female text-white font-bold rounded-xl shadow-lg shadow-female/20 hover:scale-105 transition-all"
                >
                  {t('হ্যাঁ, নিশ্চিত', 'Yes, Confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success View */}
      <AnimatePresence>
        {bookingSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto text-center space-y-12 py-20 card-premium border-emerald-100 bg-emerald-50/30"
          >
            <div className="relative inline-flex">
              <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20" />
              <div className="relative bg-emerald-500 p-8 rounded-full shadow-2xl shadow-emerald-200">
                <CheckCircle2 size={64} className="text-white" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-5xl font-black text-primary tracking-tighter">{t('বুকিং সফল হয়েছে!', 'Booking Successful!')}</h2>
              <p className="text-slate-500 font-bold text-xl">{t('আপনার টিকিট আইডি:', 'Your Ticket ID:')} <span className="text-primary font-black font-num">{bookingSuccess.id}</span></p>
              {(() => {
                const trip = trips.find(t => t.id === bookingSuccess.tripId);
                return trip ? <p className="text-slate-500 font-bold text-lg">{t('যাত্রার তারিখ:', 'Travel Date:')} <span className="text-primary font-black font-num">{format(new Date(trip.departureTime), 'dd MMM, yyyy')}</span></p> : null;
              })()}
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="p-6 bg-white rounded-[2.5rem] shadow-2xl shadow-emerald-200/50 border border-emerald-100">
                <QRCodeCanvas id="ticket-qrcode" value={bookingSuccess.id} size={200} level="H" includeMargin />
              </div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{t('টিকিট সংগ্রহের সময় এই কিউআর কোডটি দেখান', 'Show this QR code at the counter')}</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-6 pt-8">
              <button 
                onClick={downloadETicket} 
                className="btn-primary !px-12 !py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
              >
                <Download size={24} />
                <span className="text-lg">{t('ই-টিকিট ডাউনলোড', 'Download E-Ticket')}</span>
              </button>
              <button 
                onClick={() => { setTrackingTripId(bookingSuccess.tripId); setBookingSuccess(null); }} 
                className="px-12 py-5 bg-white border border-slate-200 rounded-2xl font-black text-primary hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-lg"
              >
                <Navigation size={24} className="text-accent" />
                <span className="text-lg">{t('বাস ট্র্যাক করুন', 'Track Bus')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tracking Section */}
      {trackingTripId && (
        <section ref={trackingRef} className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-primary tracking-tighter">{t('বাসের বর্তমান অবস্থান', 'Live Bus Tracking')}</h2>
            <button 
              onClick={() => setTrackingTripId(null)}
              className="text-sm font-bold text-slate-400 hover:text-primary transition-colors"
            >
              {t('বন্ধ করুন', 'Close')}
            </button>
          </div>
          {renderTracking(trackingTripId)}
        </section>
      )}
    </div>
  );
};
