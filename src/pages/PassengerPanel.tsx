import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
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
import { safeFormat, safeGetTime } from '../utils/dateUtils';
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
  const [hasSearched, setHasSearched] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

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
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripBookings, setSelectedTripBookings] = useState<Booking[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerData, setPassengerData] = useState({ name: '', phone: '', email: '', gender: 'male' as 'male' | 'female' });
  const [isReturning, setIsReturning] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('bKash');
  const [couponCode, setCouponCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const sessionId = useRef(Math.random().toString(36).substring(2, 15)).current;

  useEffect(() => {
    if (expandedTripId) {
      const trip = searchResults.find(t => t.id === expandedTripId);
      setSelectedTrip(trip || null);
    } else {
      setSelectedTrip(null);
    }
  }, [expandedTripId, searchResults]);
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
      }, (err) => handleFirestoreError(err, OperationType.GET, 'bookings'));
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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'routes'));
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));
    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'counters'));
    const unsubTripCounterTimes = onSnapshot(collection(db, 'tripCounterTimes'), (snapshot) => {
      setTripCounterTimes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripCounterTime)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tripCounterTimes'));

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
    console.log("Searching with params:", searchParams);
    const results = trips.filter(trip => {
      const route = routes.find(r => r.id === trip.routeId);
      const bus = buses.find(b => b.id === trip.busId);
      
      if (!trip.departureTime) {
        console.warn("Trip missing departureTime:", trip);
        return false;
      }
      
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

      const isDateMatch = tripDate === searchParams.date;
      const isFuture = new Date(trip.departureTime) > new Date();
      
      return isDateMatch && 
             isFuture &&
             (!searchParams.isAC || bus?.isAC) &&
             matchesTime &&
             trip.status !== 'cancelled' &&
             (!searchParams.from || routeHasFrom) &&
             (!searchParams.to || routeHasTo) &&
             correctOrder &&
             (trip.fare || 500) <= searchParams.priceRange[1];
    });
    console.log("Results:", results);
    setSearchResults(results);
  }, [trips, routes, buses, searchParams, TZ]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const onSearchClick = () => {
    handleSearch();
    setHasSearched(true);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

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
      alert('Please fill all required fields');
      return;
    }

    try {
      // Check if seats are already booked
      const qBookings = query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id));
      const bookingsSnapshot = await getDocs(qBookings);
      const existingBookings = bookingsSnapshot.docs.map(d => d.data() as Booking);
      const isBooked = existingBookings.some(b => b.seats.some(s => selectedSeats.includes(s)) && (b.status === 'booked' || b.status === 'sold' || b.status === 'confirmed'));
      
      if (isBooked) {
        alert('One or more selected seats have already been booked by someone else. Please select different seats.');
        setShowConfirmationModal(false);
        return;
      }

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
      
      // Remove locks
      try {
        const locksToRemove = selectedTrip.lockedSeats?.filter(l => selectedSeats.includes(l.seatId) && l.counterId === (auth.currentUser?.uid || sessionId)) || [];
        if (locksToRemove.length > 0) {
          await updateDoc(doc(db, 'trips', selectedTrip.id), {
            lockedSeats: arrayRemove(...locksToRemove)
          });
        }
      } catch (e) {
        console.error("Failed to remove locks", e);
      }
      
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
      alert('Coach ID not found');
    }
  };

  const handleTicketTrack = async () => {
    if (!trackTicketId || !trackPhone) {
      alert('Please fill all required fields');
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
          alert('Invalid Ticket ID or Phone Number.');
        }
      } else {
        alert('Ticket not found.');
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
          Live Tracking - {route.name}
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
                        Passed <span className="font-num">{log.timestamp ? format(new Date(log.timestamp), 'hh:mm a') : 'N/A'}</span>
                      </span>
                    ) : isCurrent ? (
                      <span className="text-[10px] text-accent font-bold animate-pulse">
                        Current Location
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bus Status</p>
              <p className="text-lg font-bold text-primary">
                {trip.status === 'departed' ? 'The bus is currently on its way.' : 'The bus has not started its journey yet.'}
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 text-accent font-bold hover:underline">
            <MapIcon size={18} />
            View on Map
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <style>{`
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .moving-gradient {
          background: linear-gradient(-45deg, #1a1a1a, #28a745, #218838, #1a1a1a);
          background-size: 400% 400%;
          animation: gradientMove 10s ease infinite;
        }
      `}</style>
      {/* Hero Section */}
      <section className="relative py-12 md:py-24 px-4 md:px-8 bg-primary shadow-2xl">
        <div className="absolute inset-0 opacity-20">
          <img src="https://img.freepik.com/free-photo/portrait-girl-standing-near-bus-stop-waiting-her-public-transport-schecks-schedule-sm_1258-151520.jpg?blur=2" alt="Hero" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative max-w-7xl mx-auto text-center space-y-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <h1 className="text-4xl md:text-7xl font-semi bold tracking-tighter text-white leading-tight">
              Start Your Journey with SwiftLine
            </h1>
            <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto font-medium">
              The safest and most comfortable bus ticketing platform in Bangladesh.
            </p>
          </motion.div>

          {/* Search Box */}
          <div className="bg-white p-4 md:p-8 rounded-[2.5rem] shadow-2xl grid grid-cols-1 md:grid-cols-7 gap-6 items-end relative mt-12">
            <div className="md:col-span-2 text-left relative">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">From</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <select 
                  className="input-field pl-12 appearance-none cursor-pointer"
                  value={searchParams.from}
                  onChange={e => setSearchParams({ ...searchParams, from: e.target.value, to: '' })}
                >
                  <option value="">Select Counter</option>
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
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">To</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <select 
                  className="input-field pl-12 appearance-none cursor-pointer disabled:opacity-50"
                  value={searchParams.to}
                  onChange={e => setSearchParams({ ...searchParams, to: e.target.value })}
                  disabled={!searchParams.from}
                >
                  <option value="">Select Destination</option>
                  {availableDestinations.map(counter => (
                    <option key={counter.id} value={counter.id}>{counter.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-1 text-left">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">Date</label>
              <div className="relative group">
                <label htmlFor="date-input" className="cursor-pointer">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-accent transition-colors" size={20} />
                </label>
                <div className="input-field pl-10 flex items-center cursor-pointer relative">
                  <span className="text-primary font-medium">
                    {searchParams.date ? (isNaN(Date.parse(searchParams.date)) ? 'Invalid Date' : format(new Date(searchParams.date), 'dd-MM-yyyy')) : 'Select Date'}
                  </span>
                  <input 
                    id="date-input"
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
              onClick={onSearchClick} 
              className="btn-primary !py-5 rounded-2xl shadow-xl shadow-accent/20"
            >
              <Search size={15} />
              <span className="text-lg">Search</span>
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
                  <h3 className="text-2xl font-black text-primary">Track Your Bus</h3>
                  <p className="text-slate-500 font-medium">Enter your bus coach number</p>
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
                    Track Now
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
                  <h3 className="text-2xl font-black text-primary">Track Your Ticket</h3>
                  <p className="text-slate-500 font-medium">Enter your ticket ID</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Ticket ID</label>
                    <input 
                      type="text" 
                      placeholder="SL-XXXXXX"
                      className="input-field text-center text-xl tracking-widest"
                      value={trackTicketId}
                      onChange={e => setTrackTicketId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone Number</label>
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
                    {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Track Now'}
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
                    Assalamu Alaikum
                  </h3>
                  <div className="h-1 w-20 bg-accent/20 mx-auto rounded-full" />
                </div>

                <div className="space-y-6 text-left">
                  <div className="bg-slate-50 p-6 rounded-3xl border-l-4 border-accent shadow-sm">
                    <p className="text-slate-700 font-bold leading-relaxed">
                      1. During Eid, buses will only depart from the Khalekpump counter. Passengers who have booked tickets online are requested to board the bus from Khalekpump.
                    </p>
                  </div>
                  
                  <div className="bg-emerald-50 p-6 rounded-3xl border-l-4 border-emerald-500 shadow-sm">
                    <p className="text-slate-700 font-bold leading-relaxed">
                      2. Please track/verify your ticket after purchase and before the journey starts. Contact the call center if you face any issues.
                    </p>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <div className="bg-primary/5 p-6 rounded-3xl">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Call Center</p>
                    <p className="text-2xl font-black text-primary tracking-wider">01841-000026, 01841-000036</p>
                    <p className="text-sm font-bold text-slate-500 mt-1">6 AM - 11:30 PM</p>
                  </div>
                  
                  <button 
                    onClick={handleDismissNotice}
                    className="btn-primary w-full !py-5 rounded-2xl text-lg shadow-xl shadow-accent/20"
                  >
                    Got it, Thanks
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
                    Filters
                  </h3>
                  <button 
                    onClick={() => setSearchParams({ ...searchParams, timeSlot: 'all', isAC: false, priceRange: [0, 2000] })}
                    className="text-xs font-bold text-accent uppercase tracking-widest hover:underline"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Time Slots */}
                  <div className="space-y-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Departure Time</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'morning', label: 'Morning', icon: Sun },
                        { id: 'afternoon', label: 'Afternoon', icon: CloudSun },
                        { id: 'night', label: 'Night', icon: Moon },
                        { id: 'all', label: 'All', icon: Info },
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
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Bus Type</p>
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
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Price Range</p>
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
        <div ref={resultsRef} className={`${showFilters ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-6`}>
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
                <h3 className="text-lg font-black text-primary">Track Your Ticket</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Using Ticket ID</p>
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
                <h3 className="text-lg font-black text-primary">Track Your Bus</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Using Coach ID</p>
              </div>
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            {hasSearched && searchResults.length > 0 ? (
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
                      <span className="font-num">{searchResults.length}</span> Buses Found
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
                    Filter
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
                      className="bg-white border-2 border-slate-100 rounded-3xl p-6 hover:border-accent/30 hover:shadow-2xl transition-all duration-500 overflow-hidden group"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                        
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-center justify-center bg-slate-50 p-4 rounded-2xl min-w-[80px] border border-slate-100 group-hover:bg-accent/5 transition-colors">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{formatInTimeZone(tripDate, TZ, 'MMM')}</span>
                            <span className="text-3xl font-black text-primary font-num leading-none">{formatInTimeZone(tripDate, TZ, 'dd')}</span>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-black text-primary tracking-tight">{route?.name}</h3>
                              <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-lg text-[10px] font-black border border-amber-100">
                                <Star size={10} fill="currentColor" /> <span className="font-num">4.9</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-bold">
                              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                <Clock size={14} className="text-accent" /> 
                                <span className="text-slate-700">
                                  {(() => {
                                    const counterTime = tripCounterTimes.find(t => t.tripId === trip.id && t.counterId === selectedBoarding);
                                    return counterTime ? format(parseISO(counterTime.departureTime), 'hh:mm a') : formatInTimeZone(tripDate, TZ, 'hh:mm a');
                                  })()}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                <BusIcon size={14} className="text-accent" /> 
                                <span className="text-slate-700">{bus?.isAC ? 'AC' : 'Non-AC'}</span>
                              </div>

                              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                <MapPin size={14} className="text-accent" /> 
                                <span className="text-slate-700 font-num">{bus?.capacity} Seats</span>
                              </div>
                              
                              {trip.coachNumber && (
                                <span className="bg-primary text-white px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase">
                                  {trip.coachNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between md:flex-col md:items-end gap-4 border-t md:border-t-0 pt-6 md:pt-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Total Fare</p>
                            <p className="text-3xl font-black text-primary"><span className="font-num">৳ {trip.fare || 500}</span></p>
                          </div>
                          <button 
                            onClick={() => setExpandedTripId(expandedTripId === trip.id ? null : trip.id)}
                            className={`px-8 py-3 rounded-2xl text-sm font-black transition-all flex items-center gap-2 shadow-lg ${
                              expandedTripId === trip.id 
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                                : 'bg-accent text-white hover:bg-accent/90 hover:shadow-accent/20'
                            }`}
                          >
                            {expandedTripId === trip.id ? 'Hide Seats' : 'Select Seats'}
                            {expandedTripId === trip.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedTripId === trip.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-4 border-t border-slate-100">
                              {/* Legend */}
                              <div className="flex flex-wrap items-center justify-center gap-6 mb-8 bg-white p-4 rounded-xl border border-slate-100">
                                {[
                                  { label: 'Booked (M)', color: 'bg-slate-400' },
                                  { label: 'Booked (F)', color: 'bg-female' },
                                  { label: 'Blocked', color: 'bg-slate-200' },
                                  { label: 'Available', color: 'bg-white border border-slate-300' },
                                  { label: 'Selected', color: 'bg-accent' },
                                  { label: 'Sold (M)', color: 'bg-red-500' },
                                  { label: 'Sold (F)', color: 'bg-pink-400' },
                                ].map((item) => (
                                  <div key={item.label} className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded ${item.color}`} />
                                    <span className="text-xs font-bold text-slate-600 uppercase">{item.label}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="grid lg:grid-cols-3 gap-8">
                                {/* Col 1: Seat Selection */}
                                <div className="space-y-6">
                                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
                                    <SeatMap
                                      capacity={buses.find(b => b.id === trip?.busId)?.capacity || 40}
                                      layout={buses.find(b => b.id === trip?.busId)?.layout || '2+2'}
                                      bookedSeats={selectedTripBookings.filter(b => b.status === 'booked').flatMap(b => b.seats)}
                                      femaleBookedSeats={selectedTripBookings.filter(b => b.status === 'booked' && b.gender === 'female').flatMap(b => b.seats)}
                                      soldSeats={selectedTripBookings.filter(b => b.status === 'sold' || b.status === 'confirmed').flatMap(b => b.seats)}
                                      femaleSoldSeats={selectedTripBookings.filter(b => (b.status === 'sold' || b.status === 'confirmed') && b.gender === 'female').flatMap(b => b.seats)}
                                      selectedSeats={selectedSeats}
                                      lockedSeats={trip?.lockedSeats?.filter(l => l.counterId !== (auth.currentUser?.uid || sessionId) && (Date.now() - new Date(l.timestamp).getTime() < 5 * 60000)).map(l => l.seatId) || []}
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

                                        if (selectedSeats.length < 4) {
                                          // Check if it's already locked by someone else
                                          const isLockedByOther = trip?.lockedSeats?.some(l => l.seatId === seat && l.counterId !== (auth.currentUser?.uid || sessionId) && (Date.now() - new Date(l.timestamp).getTime() < 5 * 60000));
                                          if (isLockedByOther) {
                                            alert('Seat is currently being booked by someone else');
                                            return;
                                          }

                                          setSelectedSeats(prev => [...prev, seat]);
                                        }
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Col 2: Boarding/Dropping & Seat Info */}
                                <div className="space-y-6">
                                  <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
                                    <h3 className="text-lg font-black text-accent uppercase tracking-widest">BOARDING/DROPPING:</h3>
                                    
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Boarding Point*</label>
                                        <select 
                                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                          value={selectedBoarding}
                                          onChange={e => setSelectedBoarding(e.target.value)}
                                        >
                                          <option value="">Select boarding point</option>
                                          {(trip.boardingPoints || routes.find(r => r.id === trip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => {
                                            return (
                                              <option key={counterId || idx} value={counterId}>
                                                {counters.find(c => c.id === counterId)?.name || counterId}
                                              </option>
                                            );
                                          })}
                                        </select>
                                        {selectedBoarding && tripCounterTimes.find(t => t.tripId === trip.id && t.counterId === selectedBoarding) && (
                                          <div className="p-4 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-2xl flex items-center gap-3 border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
                                            <div className="bg-emerald-500 p-1.5 rounded-lg">
                                              <Clock size={16} className="text-white" />
                                            </div>
                                            <span>
                                              The {counters.find(c => c.id === selectedBoarding)?.name} counter's time is {tripCounterTimes.find(t => t.tripId === trip.id && t.counterId === selectedBoarding)?.time}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Dropping Point*</label>
                                        <select 
                                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                          value={selectedDropping}
                                          onChange={e => setSelectedDropping(e.target.value)}
                                        >
                                          <option value="">Select dropping point</option>
                                          {(trip.droppingPoints || routes.find(r => r.id === trip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => {
                                            return (
                                              <option key={counterId || idx} value={counterId}>
                                                {counters.find(c => c.id === counterId)?.name || counterId}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </div>
                                    </div>

                                    <div className="border-t border-dashed border-slate-300 pt-6 space-y-4">
                                      <h3 className="text-lg font-black text-accent uppercase tracking-widest">SEAT INFORMATION:</h3>
                                      <div className="text-sm text-slate-600 space-y-1">
                                        <p>Seat Fare: ৳ {selectedSeats.length * (trip.fare || 500)}</p>
                                        <p>Platform Fee: ৳ 0</p>
                                        <p>Payment Fee: ৳ 0</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Col 3: Passenger Information */}
                                <div className="space-y-6">
                                  <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
                                    <h3 className="text-lg font-black text-accent uppercase tracking-widest">PASSENGER INFORMATION:</h3>
                                    
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Booking For</label>
                                        <div className="flex gap-2">
                                          <button className="flex-1 py-2 border-2 border-accent text-accent font-bold rounded-lg">Self</button>
                                          <button className="flex-1 py-2 border border-slate-300 text-slate-500 font-bold rounded-lg">Others</button>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <label className="text-xs font-bold text-slate-700">Mobile Number*</label>
                                          <input 
                                            type="tel"
                                            placeholder="+8801XXXXXXXXX" 
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                            value={passengerData.phone}
                                            onChange={e => setPassengerData({ ...passengerData, phone: e.target.value })}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-xs font-bold text-slate-700">Email</label>
                                          <input 
                                            type="email"
                                            placeholder="example@mail.com" 
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                            value={passengerData.email}
                                            onChange={e => setPassengerData({ ...passengerData, email: e.target.value })}
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <label className="text-xs font-bold text-slate-700">First Name*</label>
                                          <input 
                                            placeholder="First Name" 
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                            value={passengerData.name.split(' ')[0] || ''}
                                            onChange={e => setPassengerData({ ...passengerData, name: `${e.target.value} ${passengerData.name.split(' ')[1] || ''}`.trim() })}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-xs font-bold text-slate-700">Last Name*</label>
                                          <input 
                                            placeholder="Last Name" 
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-accent"
                                            value={passengerData.name.split(' ')[1] || ''}
                                            onChange={e => setPassengerData({ ...passengerData, name: `${passengerData.name.split(' ')[0] || ''} ${e.target.value}`.trim() })}
                                          />
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-700">Gender*</label>
                                        <div className="flex gap-2">
                                          <button 
                                            onClick={() => setPassengerData({ ...passengerData, gender: 'male' })}
                                            className={`flex-1 py-2 rounded-lg border-2 font-bold transition-all ${passengerData.gender === 'male' ? 'bg-white text-accent border-accent' : 'bg-white text-slate-500 border-slate-300'}`}
                                          >
                                            Male
                                          </button>
                                          <button 
                                            onClick={() => setPassengerData({ ...passengerData, gender: 'female' })}
                                            className={`flex-1 py-2 rounded-lg border font-bold transition-all ${passengerData.gender === 'female' ? 'bg-white text-accent border-accent' : 'bg-white text-slate-500 border-slate-300'}`}
                                          >
                                            Female
                                          </button>
                                        </div>
                                      </div>

                                      <button 
                                        onClick={async () => {
                                          // Check if seats are already booked or locked
                                          const isLockedByOther = trip?.lockedSeats?.some(l => selectedSeats.includes(l.seatId) && l.counterId !== (auth.currentUser?.uid || sessionId) && (Date.now() - new Date(l.timestamp).getTime() < 5 * 60000));
                                          const isBooked = selectedTripBookings.some(b => b.seats.some(s => selectedSeats.includes(s)) && (b.status === 'booked' || b.status === 'sold' || b.status === 'confirmed'));
                                          
                                          if (isLockedByOther || isBooked) {
                                            alert('One or more selected seats are no longer available. Please select different seats.');
                                            return;
                                          }

                                          // Lock the seats
                                          if (trip) {
                                            try {
                                              const newLocks = selectedSeats.map(seat => ({
                                                seatId: seat,
                                                counterId: auth.currentUser?.uid || sessionId,
                                                timestamp: new Date().toISOString()
                                              }));
                                              await updateDoc(doc(db, 'trips', trip.id), {
                                                lockedSeats: arrayUnion(...newLocks)
                                              });
                                            } catch (e) {
                                              console.error("Failed to add locks", e);
                                            }
                                          }
                                          setShowConfirmationModal(true);
                                        }}
                                        disabled={selectedSeats.length === 0 || !passengerData.name || !passengerData.phone}
                                        className="w-full bg-accent text-white font-black py-3 rounded-lg hover:bg-secondary transition-all disabled:opacity-50"
                                      >
                                        Proceed
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Confirmation Modal */}
                      <AnimatePresence>
                        {showConfirmationModal && selectedTrip && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                          >
                            <motion.div 
                              initial={{ scale: 0.9, y: 20 }}
                              animate={{ scale: 1, y: 0 }}
                              className="bg-white rounded-2xl p-8 w-full max-w-4xl shadow-2xl relative max-h-[90vh] overflow-y-auto"
                            >
                              <button 
                                onClick={async () => {
                                  setShowConfirmationModal(false);
                                  if (selectedTrip) {
                                    try {
                                      const locksToRemove = selectedTrip.lockedSeats?.filter(l => selectedSeats.includes(l.seatId) && l.counterId === (auth.currentUser?.uid || sessionId)) || [];
                                      if (locksToRemove.length > 0) {
                                        await updateDoc(doc(db, 'trips', selectedTrip.id), {
                                          lockedSeats: arrayRemove(...locksToRemove)
                                        });
                                      }
                                    } catch (e) {
                                      console.error("Failed to remove locks", e);
                                    }
                                  }
                                }} 
                                className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors"
                              >
                                <X size={20} />
                              </button>
                              <h2 className="text-2xl font-black text-slate-900 mb-6">Please confirm!</h2>
                              
                              <div className="space-y-6">
                                <div className="p-4 bg-gradient-to-r from-slate-100 to-slate-50 text-primary rounded-lg font-bold border border-slate-200">
                                  <p className="text-lg">Your ticket will be temporarily booked for 20 minutes</p>
                                  <p className="text-sm">Complete payment before the booking expires.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Booking Details Card */}
                                  <div className="border border-slate-200 rounded-xl p-6 bg-white">
                                    <h4 className="font-bold text-primary mb-4">Booking Details (Onward): <span className="text-accent font-black">{routes.find(r => r.id === selectedTrip.routeId)?.name || 'Unknown Route'}</span></h4>
                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                      <p className="font-black text-primary text-lg">{buses.find(b => b.id === selectedTrip.busId)?.model || 'Unknown Bus'}</p>
                                      <p className="text-sm text-accent">{buses.find(b => b.id === selectedTrip.busId)?.regNo || ''}</p>
                                      <div className="flex justify-between mt-4">
                                        <div>
                                          <p className="text-xs text-slate-400">Departure</p>
                                          <p className="font-black text-primary">{safeFormat(selectedTrip.departureTime, 'hh:mm a')}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-slate-400">Arrival</p>
                                          <p className="font-black text-primary">{safeFormat(selectedTrip.arrivalTime, 'hh:mm a')}</p>
                                        </div>
                                      </div>
                                      <p className="text-sm text-primary mt-4">Seats: <span className="font-bold text-accent">{selectedSeats.join(', ')}</span></p>
                                    </div>
                                  </div>

                                  {/* Fare Details Card */}
                                  <div className="border border-slate-200 rounded-xl p-6 bg-white">
                                    <h4 className="font-bold text-primary mb-4">Fare Details:</h4>
                                    <div className="space-y-2 text-sm text-primary">
                                      <div className="flex justify-between"><p>Seat Fare ({selectedSeats.length} seats):</p><p className="font-bold">৳ {selectedSeats.length * (selectedTrip.fare || 500)}</p></div>
                                      <div className="flex justify-between"><p>Platform Fee:</p><p className="font-bold">৳ 40</p></div>
                                      <div className="flex justify-between"><p>Payment Fee:</p><p className="font-bold">৳ 80</p></div>
                                      <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-primary"><p>Subtotal</p><p>৳ {selectedSeats.length * (selectedTrip.fare || 500) + 120}</p></div>
                                      <div className="flex justify-between text-emerald-600"><p>Total Discount:</p><p className="font-bold">- ৳ 120</p></div>
                                      <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-lg text-accent"><p>Total Fare</p><p>৳ {selectedSeats.length * (selectedTrip.fare || 500)}</p></div>
                                    </div>
                                  </div>
                                </div>

                                {/* Passenger Details Card */}
                                <div className="border border-slate-200 rounded-xl p-6 bg-white">
                                  <h4 className="font-bold text-primary mb-4">Passenger Details:</h4>
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    <p className="text-slate-500">Name</p><p className="col-span-2 font-bold text-primary">: {passengerData.name}</p>
                                    <p className="text-slate-500">Phone Number</p><p className="col-span-2 font-bold text-primary">: {passengerData.phone}</p>
                                    <p className="text-slate-500">Email</p><p className="col-span-2 font-bold text-primary">: {passengerData.email}</p>
                                  </div>
                                </div>

                                {/* Payment and Coupon */}
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <div className="flex gap-2">
                                      <button className="flex-1 py-3 border-2 border-primary text-primary font-bold rounded-lg">Pay Now</button>
                                      <button className="flex-1 py-3 border border-slate-200 text-slate-500 font-bold rounded-lg">Book Only</button>
                                    </div>
                                    <label className="text-sm font-bold text-primary">Payment Method*</label>
                                    <select 
                                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg font-bold text-primary"
                                      value={paymentMethod}
                                      onChange={e => setPaymentMethod(e.target.value)}
                                    >
                                      <option>bKash</option>
                                      <option>Nagad</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-bold text-primary">Coupon Code</label>
                                    <div className="flex gap-2">
                                      <input 
                                        className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-lg font-bold text-primary"
                                        placeholder="COUPON CODE"
                                        value={couponCode}
                                        onChange={e => setCouponCode(e.target.value)}
                                      />
                                      <button className="px-6 py-3 border border-[#ffaf00] text-[#ffaf00] font-bold rounded-lg">Apply</button>
                                    </div>
                                  </div>
                                </div>

                                {/* Cancellation Policy & Terms */}
                                <div className="border border-[#e4e4e4] rounded-xl p-4 flex justify-between items-center bg-white">
                                  <div>
                                    <p className="font-bold text-[#142143]">Cancellation Policy</p>
                                    <p className="text-sm text-slate-500">Eid tickets are non-refundable.</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <span className="bg-[#e4e4e4] text-[#142143] text-xs font-bold px-2 py-1 rounded">Non-Refundable</span>
                                    <a href="#" className="text-[#1a5d94] text-sm font-bold">View Full Policy &gt;</a>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input 
                                    type="checkbox" 
                                    checked={termsAccepted}
                                    onChange={e => setTermsAccepted(e.target.checked)}
                                    className="w-5 h-5 accent-[#142143]"
                                  />
                                  <label className="text-sm text-[#142143]">
                                    I AGREE TO ALL THE 
                                    <span className="text-[#1a5d94] font-bold cursor-pointer">TERMS & CONDITIONS</span>
                                     and 
                                    <span className="text-[#1a5d94] font-bold cursor-pointer">PRIVACY NOTICE</span>
                                  </label>
                                </div>

                                <button 
                                  onClick={() => {
                                    setShowConfirmationModal(false);
                                    handleBooking();
                                  }}
                                  disabled={!termsAccepted}
                                  className="w-full bg-[#142143] text-white font-black py-4 rounded-lg hover:bg-[#1a5d94] transition-all disabled:opacity-50"
                                >
                                  Purchase Now
                                </button>
                              </div>


                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
            ) : hasSearched ? (
              <div className="card-premium py-20 text-center space-y-4">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                  <Search size={32} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-400">No Buses Found</h3>
                <p className="text-slate-400 text-sm">Please try another date or route.</p>
              </div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>



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
                <h3 className="text-2xl font-black text-primary">Gender Warning</h3>
                <p className="text-slate-500 font-medium">
                  The adjacent seat is booked by a female passenger. Are you sure you want to book this seat?
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setGenderWarning(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  No
                </button>
                <button 
                  onClick={() => {
                    setSelectedSeats(prev => [...prev, genderWarning.seat]);
                    setGenderWarning(null);
                  }}
                  className="flex-1 py-4 bg-female text-white font-bold rounded-xl shadow-lg shadow-female/20 hover:scale-105 transition-all"
                >
                  Yes, Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {bookingSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-primary/95 backdrop-blur-xl p-4 md:p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              className="bg-white rounded-[3.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_50px_100px_rgba(0,0,0,0.5)] relative"
            >
              <button 
                onClick={() => setBookingSuccess(null)} 
                className="absolute top-8 right-8 p-4 bg-slate-100 hover:bg-slate-200 rounded-full transition-all z-10 group"
              >
                <X size={24} className="text-slate-500 group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
              </button>

              <div className="p-8 md:p-16 grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-8 text-center md:text-left">
                  <div className="relative inline-flex">
                    <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20" />
                    <div className="relative bg-emerald-500 p-6 rounded-3xl shadow-2xl shadow-emerald-200">
                      <CheckCircle2 size={48} className="text-white" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-5xl font-black text-primary tracking-tighter leading-tight">Booking<br />Successful!</h2>
                    <p className="text-slate-500 font-bold text-xl">Your Ticket ID: <span className="text-accent font-black font-num">{bookingSuccess.id}</span></p>
                    {(() => {
                      const trip = trips.find(t => t.id === bookingSuccess.tripId);
                      return trip ? (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 inline-block">
                          <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mb-1">Travel Date</p>
                          <p className="text-primary font-black text-xl font-num">{safeFormat(trip.departureTime, 'dd MMMM, yyyy')}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={downloadETicket} 
                      className="w-full bg-primary text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Download size={24} />
                      <span>Download E-Ticket</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => { setTrackingTripId(bookingSuccess.tripId); setBookingSuccess(null); }} 
                        className="py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-primary hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2"
                      >
                        <Navigation size={20} />
                        <span>Track Bus</span>
                      </button>
                      <button 
                        onClick={() => window.print()} 
                        className="py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-primary hover:border-emerald-500 hover:text-emerald-500 transition-all flex items-center justify-center gap-2"
                      >
                        <Printer size={20} />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-8 bg-slate-50 p-12 rounded-[3rem] border border-slate-100">
                  <div className="p-8 bg-white rounded-[3rem] shadow-2xl shadow-slate-200 border border-slate-100">
                    <QRCodeCanvas id="ticket-qrcode" value={bookingSuccess.id} size={240} level="H" includeMargin />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest">Digital Ticket QR</p>
                    <p className="text-sm text-slate-500 font-bold">Show this QR code at the counter for verification</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tracking Section */}
      {trackingTripId && (
        <section ref={trackingRef} className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-primary tracking-tighter">Live Bus Tracking</h2>
            <button 
              onClick={() => setTrackingTripId(null)}
              className="text-sm font-bold text-slate-400 hover:text-primary transition-colors"
            >
              Close
            </button>
          </div>
          {renderTracking(trackingTripId)}
        </section>
      )}
    </div>
  );
};
