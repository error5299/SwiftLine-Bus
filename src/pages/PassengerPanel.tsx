import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Trip, Route, Bus, Booking, Passenger, Counter, TripCounterTime } from '../types';
import { cn } from '../lib/utils';
import { useLanguage } from '../hooks/useLanguage';
import { useFirebaseData } from '../context/FirebaseProvider';

import { SeatMap } from '../components/SeatMap';
import { 
  Search, MapPin, Calendar, Clock, Bus as BusIcon, ChevronRight, 
  CheckCircle2, Download, Map as MapIcon, Navigation, 
  Wifi, Coffee, Zap, Info, ArrowLeftRight, LocateFixed, Star,
  Filter, Sun, Moon, CloudSun, CreditCard, Ticket, X,
  Plus, Edit2, Trash2, UserCheck, Users, User, Smartphone, Wallet, Globe, AlertCircle,
  ChevronDown, ChevronUp, Printer, Phone, Mail, Map, ShieldCheck, Shield, Check, Lock as LockIcon
} from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { safeFormat, safeGetTime } from '../utils/dateUtils';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';
import { motion, AnimatePresence } from 'motion/react';

interface PassengerPanelProps {
  initialTracking?: boolean;
}

export const PassengerPanel: React.FC<PassengerPanelProps> = ({ initialTracking }) => {
  const { t } = useLanguage();
  const data = useFirebaseData();
  const trips = data.trips || [];
  const routes = data.routes || [];
  const buses = data.buses || [];
  const counters = data.counters || [];
  const operators = data.operators || [];
  const tripCounterTimes = data.tripCounterTimes || [];
  
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
    const currentCounters = data.counters || [];
    if (!searchParams.from) {
      setAvailableDestinations(currentCounters);
      return;
    }

    const fromCounter = currentCounters.find((c: Counter) => c.id === searchParams.from);
    if (fromCounter && fromCounter.allowedDestinationCounters) {
      const allowed = currentCounters.filter((c: Counter) => fromCounter.allowedDestinationCounters.includes(c.id));
      setAvailableDestinations(allowed);
    } else {
      setAvailableDestinations([]);
    }
  }, [searchParams.from, data.counters]);

  const [searchResults, setSearchResults] = useState<Trip[]>([]);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripBookings, setSelectedTripBookings] = useState<Booking[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [bookingFor, setBookingFor] = useState<'self' | 'others'>('self');
  const [passengerData, setPassengerData] = useState({ name: '', phone: '', email: '', gender: 'male' as 'male' | 'female' });

  // Auto-fill passenger data if booking for self and user is logged in
  useEffect(() => {
    if (bookingFor === 'self' && auth.currentUser) {
      setPassengerData({
        name: auth.currentUser.displayName || '',
        phone: auth.currentUser.phoneNumber || '',
        email: auth.currentUser.email || '',
        gender: 'male' // Default or fetch from profile if available
      });
    } else if (bookingFor === 'self' && !auth.currentUser) {
      // If not logged in but selected self, maybe prompt login or just leave empty
    }
  }, [bookingFor]);
  const [isReturning, setIsReturning] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [popupSettings, setPopupSettings] = useState({ title: 'Your ticket will be temporarily booked for 20 minutes', description: 'Complete payment before the booking expires to secure your seat.' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'passengerPopup'), (doc) => {
      if (doc.exists()) {
        setPopupSettings(doc.data() as any);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/passengerPopup');
    });
    return () => unsub();
  }, []);

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
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [bookingStep, setBookingStep] = useState(1); // 1: Seats, 2: Details, 3: Payment
  const [genderWarning, setGenderWarning] = useState<{ seat: string } | null>(null);
  const [selectedBoarding, setSelectedBoarding] = useState('');
  const [selectedDropping, setSelectedDropping] = useState('');
  const trackingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentTrips = data.trips || [];
    if (initialTracking && currentTrips.length > 0) {
      setTrackingTripId(currentTrips[0].id);
      setTimeout(() => {
        trackingRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [initialTracking, data.trips]);

  useEffect(() => {
    if (selectedTrip?.id) {
      const q = query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id));
      const unsub = onSnapshot(q, (snapshot) => {
        setSelectedTripBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'bookings'));
      
      setTimeLeft(600);
      
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        unsub();
        clearInterval(timer);
      };
    }
  }, [selectedTrip?.id]);

  useEffect(() => {
    if (timeLeft === 0) {
      setSelectedTrip(null);
      setSelectedSeats([]);
    }
  }, [timeLeft]);

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
    const currentTrips = data.trips || [];
    const currentRoutes = data.routes || [];
    const currentBuses = data.buses || [];

    const results = currentTrips.filter((trip: Trip) => {
      const route = currentRoutes.find((r: Route) => r.id === trip.routeId);
      const bus = currentBuses.find((b: Bus) => b.id === trip.busId);
      
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
    setSearchResults(results);
  }, [data.trips, data.routes, data.buses, searchParams, TZ]);

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

    setLoading(true);
    try {
      // Check if seats are already booked
      const qBookings = query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id));
      const bookingsSnapshot = await getDocs(qBookings);
      const existingBookings = bookingsSnapshot.docs.map(d => d.data() as Booking);
      const isBooked = existingBookings.some(b => b.seats.some(s => selectedSeats.includes(s)) && (b.status === 'booked' || b.status === 'sold' || b.status === 'confirmed'));
      
      if (isBooked) {
        alert('One or more selected seats have already been booked by someone else. Please select different seats.');
        setShowConfirmationModal(false);
        setLoading(false);
        return;
      }

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

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
        id: ticketId,
        tripId: selectedTrip.id,
        passengerId,
        seats: selectedSeats,
        gender: passengerData.gender,
        boardingStopId: selectedBoarding, 
        droppingStopId: selectedDropping, 
        totalFare: selectedSeats.length * (selectedTrip.fare || 500),
        timestamp: new Date().toISOString(),
        status: 'confirmed',
        bookedByCounterId: 'online',
        paymentMethod,
        paymentStatus: 'completed'
      };
      
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
      setBookingStep(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    } finally {
      setLoading(false);
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

  const printETicket = () => {
    if (!bookingSuccess) return;
    const trip = trips.find(t => t.id === bookingSuccess.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const boarding = counters.find(c => c.id === bookingSuccess.boardingStopId);
    const dropping = counters.find(c => c.id === bookingSuccess.droppingStopId);
    const bus = buses.find(b => b.id === trip?.busId);

    printTicketHTML(
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
        className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-sm relative overflow-hidden group"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent via-emerald-400 to-accent" />
        <h3 className="text-2xl font-black text-primary mb-12 flex items-center gap-4">
          <div className="bg-accent/10 p-3 rounded-2xl">
            <Navigation className="text-accent animate-pulse" size={28} />
          </div>
          Live Tracking - {route.name}
        </h3>
        
        <div className="relative py-16 px-8">
          {/* Progress Bar Background */}
          <div className="absolute top-1/2 left-8 right-8 h-3 bg-slate-100 -translate-y-1/2 rounded-full" />
          {/* Active Progress */}
          <motion.div 
            className="absolute top-1/2 left-8 h-3 bg-accent -translate-y-1/2 rounded-full shadow-[0_0_20px_rgba(58,175,169,0.5)]" 
            initial={{ width: 0 }}
            animate={{ width: `calc(${((trip.currentStopIndex || 0) / (route.stops.length - 1)) * 100}% - 16px)` }}
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
                <div key={counterId || index} className="flex flex-col items-center group relative">
                  <div className={`
                    w-8 h-8 rounded-full border-4 z-10 transition-all duration-700
                    ${isPassed ? "bg-accent border-accent scale-110 shadow-lg shadow-accent/20" : 
                      isCurrent ? "bg-white border-accent scale-150 shadow-2xl shadow-accent/40" : 
                      "bg-white border-slate-200"}
                  `}>
                    {isCurrent && <div className="w-full h-full bg-accent/20 rounded-full animate-ping" />}
                  </div>
                  <div className="absolute top-12 flex flex-col items-center min-w-[120px]">
                    <span className={`text-sm font-black tracking-tight transition-colors duration-500 ${isCurrent ? "text-accent" : "text-slate-500"}`}>
                      {counter?.name || counterId}
                    </span>
                    {log ? (
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                        Passed <span className="font-num text-primary">{log.timestamp ? format(new Date(log.timestamp), 'hh:mm a') : 'N/A'}</span>
                      </span>
                    ) : isCurrent ? (
                      <span className="text-[10px] text-accent font-black uppercase tracking-widest mt-1 animate-pulse">
                        Current Location
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-20 p-8 bg-slate-50 rounded-[1.5rem] border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <BusIcon className="text-accent" size={24} />
            </div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Bus Status</p>
              <p className="text-lg font-black text-primary tracking-tight">
                {trip.status === 'departed' ? 'The bus is currently on its way.' : 'The bus has not started its journey yet.'}
              </p>
            </div>
          </div>
          <button className="flex items-center gap-3 px-8 py-4 bg-white text-accent font-black rounded-2xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-95 text-sm uppercase tracking-widest">
            <MapIcon size={20} />
            View on Map
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#DEF2F1] selection:bg-accent selection:text-white font-sans">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(58,175,169,0.1)_0%,transparent_70%)] pointer-events-none" />
      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
        }
        .text-glow {
          text-shadow: 0 0 15px rgba(58, 175, 169, 0.4);
        }
        .font-num {
          font-variant-numeric: tabular-nums;
        }
      `}</style>
      {/* Hero Section */}
      <section className="relative py-12 md:py-24 bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/20 to-primary/40" />
        
        <div className="relative w-full text-center space-y-12">
          <div className="space-y-4 px-4 md:px-8">
            <h1 className="text-3xl md:text-6xl font-bold tracking-tighter text-white leading-tight">
              Travel <span className="text-accent">Beyond</span> Limits With <span className="text-accent">SwiftLine</span>
            </h1>
            <p className="text-white/90 text-base md:text-xl max-w-3xl mx-auto font-medium tracking-wide">
              Experience the next generation of bus travel in Bangladesh. Safe, smart, and exceptionally comfortable.
            </p>
          </div>

          {/* Search Box */}
          <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.1)] grid grid-cols-1 md:grid-cols-10 gap-8 items-center relative mt-10 border border-slate-100 w-full max-w-[96%] mx-auto">
            <div className="md:col-span-2 text-left relative px-2">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-4">From</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-accent group-focus-within:text-primary transition-colors" size={20} />
                <select 
                   className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary appearance-none cursor-pointer focus:ring-2 focus:ring-accent/20 transition-all text-base"
                  value={searchParams.from}
                  onChange={e => setSearchParams({ ...searchParams, from: e.target.value, to: '' })}
                >
                  <option value="" className="text-slate-900">Select Counter</option>
                  {counters.map(counter => (
                    <option key={counter.id} value={counter.id} className="text-slate-900">{counter.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-center md:col-span-1">
              <button 
                onClick={handleSwapLocations}
                className="p-4 bg-accent text-white rounded-full shadow-lg hover:rotate-180 transition-all duration-500 active:scale-90 border-4 border-white"
              >
                <ArrowLeftRight size={20} />
              </button>
            </div>

            <div className="md:col-span-2 text-left px-2">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-4">To</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-accent group-focus-within:text-primary transition-colors" size={20} />
                <select 
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary appearance-none cursor-pointer disabled:opacity-50 focus:ring-2 focus:ring-accent/20 transition-all text-base"
                  value={searchParams.to}
                  onChange={e => setSearchParams({ ...searchParams, to: e.target.value })}
                  disabled={!searchParams.from}
                >
                  <option value="" className="text-slate-900">Select Destination</option>
                  {availableDestinations.map(counter => (
                    <option key={counter.id} value={counter.id} className="text-slate-900">{counter.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2 text-left px-2">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-4">Date</label>
              <div className="relative group">
                <label htmlFor="date-input" className="cursor-pointer">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-accent group-focus-within:text-primary transition-colors" size={20} />
                </label>
                <div className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-[1.5rem] flex items-center cursor-pointer relative focus-within:ring-2 focus-within:ring-accent/20 transition-all">
                  <span className="font-black text-base text-primary whitespace-nowrap">
                    {searchParams.date ? (isNaN(Date.parse(searchParams.date)) ? 'Invalid Date' : format(new Date(searchParams.date), 'dd-MM-yyyy')) : 'Select Date'}
                  </span>
                  <input 
                    id="date-input"
                    type="date" 
                    min={format(new Date(), 'yyyy-MM-dd')}
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

            <div className="md:col-span-3 px-2">
              <button 
                onClick={onSearchClick} 
                className="w-full py-5 rounded-[1.5rem] bg-accent text-white font-black shadow-xl shadow-accent/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 mt-4 md:mt-0 px-8"
              >
                <Search size={22} />
                <span className="text-sm uppercase tracking-[0.2em]">Search Buses</span>
              </button>
            </div>
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
              className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl relative"
            >
              <button onClick={() => setShowCoachModal(false)} className="absolute top-6 right-6 p-3 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
              <div className="text-center space-y-8">
                <div className="bg-emerald-100 w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto">
                  <Navigation className="text-emerald-600" size={36} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-3xl font-black text-primary">Track Your Bus</h3>
                  <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">Enter your bus coach number</p>
                </div>
                <div className="space-y-6">
                  <input 
                    type="text" 
                    placeholder="e.g. SL-101"
                    className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] text-center text-2xl font-black tracking-widest text-primary focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    value={trackCoachNumber}
                    onChange={e => setTrackCoachNumber(e.target.value.toUpperCase())}
                  />
                  <button onClick={handleCoachTrack} className="w-full py-5 rounded-[1.5rem] bg-emerald-500 text-white font-black shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all text-lg">
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
              className="bg-white rounded-[3rem] p-10 w-full max-w-sm shadow-2xl relative"
            >
              <button onClick={() => setShowTicketModal(false)} className="absolute top-6 right-6 p-3 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
              <div className="text-center space-y-8">
                <div className="bg-accent/10 w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto">
                  <Ticket className="text-accent" size={36} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-3xl font-black text-primary">Track Your Ticket</h3>
                  <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">Enter your ticket ID</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Ticket ID</label>
                    <input 
                      type="text" 
                      placeholder="SL-XXXXXX"
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-[1.5rem] text-center text-lg font-black tracking-widest text-primary focus:ring-2 focus:ring-accent/20 transition-all"
                      value={trackTicketId}
                      onChange={e => setTrackTicketId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Phone Number</label>
                    <input 
                      type="tel" 
                      placeholder="01XXXXXXXXX"
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-[1.5rem] text-center text-lg font-black tracking-widest text-primary focus:ring-2 focus:ring-accent/20 transition-all"
                      value={trackPhone}
                      onChange={e => setTrackPhone(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleTicketTrack}
                    disabled={loading}
                    className="w-full py-5 rounded-[1.5rem] bg-accent text-white font-black shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all text-lg disabled:opacity-50"
                  >
                    {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Track Now'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        {/* Main Content Area */}
        <div className="grid lg:grid-cols-4 gap-10">
          {/* Sidebar Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.aside 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="lg:col-span-1 space-y-8"
              >
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 sticky top-24">
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-lg font-black flex items-center gap-3 text-primary">
                      <Filter size={22} className="text-accent" />
                      Filters
                    </h3>
                    <button 
                      onClick={() => setSearchParams({ ...searchParams, timeSlot: 'all', isAC: false, priceRange: [0, 2000] })}
                      className="text-xs font-black text-accent uppercase tracking-[0.2em] hover:underline"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-10">
                    {/* Time Slots */}
                    <div className="space-y-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Departure Time</p>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { id: 'morning', label: 'Morning', icon: Sun },
                          { id: 'afternoon', label: 'Afternoon', icon: CloudSun },
                          { id: 'night', label: 'Night', icon: Moon },
                          { id: 'all', label: 'All', icon: Info },
                        ].map(slot => (
                          <button
                            key={slot.id}
                            onClick={() => setSearchParams({ ...searchParams, timeSlot: slot.id as any })}
                            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-[1.5rem] border-2 transition-all ${
                              searchParams.timeSlot === slot.id 
                                ? 'bg-primary border-primary text-white shadow-lg' 
                                : 'bg-white border-slate-50 text-slate-500 hover:border-accent/30'
                            }`}
                          >
                            <slot.icon size={18} />
                            <span className="text-[10px] uppercase tracking-widest font-black">{slot.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bus Type */}
                    <div className="space-y-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Bus Type</p>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setSearchParams({ ...searchParams, isAC: false })}
                          className={`flex-1 py-4 rounded-[1.2rem] border-2 text-xs font-black uppercase tracking-widest transition-all ${!searchParams.isAC ? 'bg-primary text-white border-primary shadow-lg' : 'bg-white text-slate-500 border-slate-50'}`}
                        >
                          Non-AC
                        </button>
                        <button 
                          onClick={() => setSearchParams({ ...searchParams, isAC: true })}
                          className={`flex-1 py-4 rounded-[1.2rem] border-2 text-xs font-black uppercase tracking-widest transition-all ${searchParams.isAC ? 'bg-primary text-white border-primary shadow-lg' : 'bg-white text-slate-500 border-slate-50'}`}
                        >
                          AC
                        </button>
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="space-y-8">
                      <div className="flex justify-between items-center px-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Price Range</p>
                        <span className="text-sm font-black text-primary tracking-tighter">৳ 500 - ৳ {searchParams.priceRange[1]}</span>
                      </div>
                      <input 
                        type="range" 
                        min="500" 
                        max="2000" 
                        step="100"
                        value={searchParams.priceRange[1]}
                        onChange={(e) => setSearchParams({ ...searchParams, priceRange: [500, parseInt(e.target.value)] })}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-accent" 
                      />
                    </div>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Search Results List */}
          <div ref={resultsRef} className={`${showFilters ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-8`}>
            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <motion.button
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowTicketModal(true)}
                className="group bg-white p-8 rounded-[2.5rem] flex items-center justify-between px-10 shadow-sm hover:shadow-xl transition-all duration-500 border border-slate-50"
              >
                <div className="flex items-center gap-6">
                  <div className="bg-accent/10 p-4 rounded-[1.5rem] group-hover:bg-accent transition-colors">
                    <Ticket className="text-accent group-hover:text-white" size={24} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-black text-primary">Track Your Ticket</h3>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Real-time status check</p>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-full group-hover:bg-accent group-hover:text-white transition-all">
                  <ChevronRight size={20} />
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCoachModal(true)}
                className="group bg-white p-8 rounded-[2.5rem] flex items-center justify-between px-10 shadow-sm hover:shadow-xl transition-all duration-500 border border-slate-50"
              >
                <div className="flex items-center gap-6">
                  <div className="bg-emerald-500/10 p-4 rounded-[1.5rem] group-hover:bg-emerald-500 transition-colors">
                    <Navigation className="text-emerald-500 group-hover:text-white" size={24} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-black text-primary">Track Your Bus</h3>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Live location tracking</p>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <ChevronRight size={20} />
                </div>
              </motion.button>
            </div>


          <AnimatePresence mode="wait">
            {hasSearched && searchResults.length > 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center bg-white p-5 rounded-[2rem] border border-slate-50 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-accent/10 p-3 rounded-[1rem]">
                      <BusIcon size={24} className="text-accent" />
                    </div>
                    <h2 className="text-lg font-black text-primary">
                      <span className="font-num text-2xl">{searchResults.length}</span> Buses Found
                    </h2>
                  </div>
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-3 px-6 py-3 rounded-[1.2rem] text-sm font-black transition-all ${
                      showFilters 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Filter size={18} className={showFilters ? 'text-white' : 'text-accent'} />
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
                      className="bg-white rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all duration-500 border border-slate-50 group"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative">
                        
                        <div className="flex items-center gap-8">
                          <div className="flex flex-col items-center justify-center bg-slate-50 p-5 rounded-[1.5rem] min-w-[80px] border border-slate-100 group-hover:bg-accent/5 transition-colors">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{formatInTimeZone(tripDate, TZ, 'MMM')}</span>
                            <span className="text-2xl font-black text-primary font-num leading-none">{formatInTimeZone(tripDate, TZ, 'dd')}</span>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center gap-4">
                              <h3 className="text-xl font-black text-primary tracking-tight group-hover:text-accent transition-colors">{route?.name}</h3>
                              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-xs font-black border border-amber-100">
                                <Star size={12} fill="currentColor" /> <span className="font-num">4.9</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 font-bold">
                              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full">
                                <Clock size={16} className="text-accent" /> 
                                <span className="text-primary font-black">
                                  {(() => {
                                    const counterTime = tripCounterTimes.find(t => t.tripId === trip.id && t.counterId === selectedBoarding);
                                    return counterTime ? format(parseISO(counterTime.departureTime), 'hh:mm a') : formatInTimeZone(tripDate, TZ, 'hh:mm a');
                                  })()}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full">
                                <BusIcon size={16} className="text-accent" /> 
                                <span className="text-primary font-black">{bus?.isAC ? 'AC' : 'Non-AC'}</span>
                              </div>

                              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full">
                                <Users size={16} className="text-accent" /> 
                                <span className="text-primary font-black font-num">{bus?.capacity} Seats</span>
                              </div>
                              
                              {trip.coachNumber && (
                                <span className="bg-primary text-white px-4 py-2 rounded-full text-[10px] font-black tracking-[0.2em] uppercase">
                                  Coach: {trip.coachNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between md:flex-col md:items-end gap-4 border-t md:border-t-0 pt-6 md:pt-0 border-slate-50">
                          <div className="text-left md:text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Per Person</p>
                            <p className="text-2xl font-black text-primary tracking-tighter"><span className="font-num">৳ {trip.fare || 500}</span></p>
                          </div>
                          <button 
                            onClick={() => setExpandedTripId(expandedTripId === trip.id ? null : trip.id)}
                            className={`px-8 py-4 rounded-[1.5rem] text-sm font-black transition-all flex items-center gap-3 shadow-lg active:scale-95 ${
                              expandedTripId === trip.id 
                                ? 'bg-slate-900 text-white hover:bg-black' 
                                : 'bg-accent text-white hover:bg-accent/90 hover:shadow-accent/40'
                            }`}
                          >
                            {expandedTripId === trip.id ? 'Close' : 'Book Seats'}
                            {expandedTripId === trip.id ? <X size={18} /> : <ChevronRight size={18} />}
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
                            <div className="pt-8 mt-8 border-t border-slate-50 space-y-8">
                              {/* Progress Indicator */}
                              <div className="max-w-md mx-auto mb-8">
                                <div className="relative flex justify-between items-center px-6">
                                  <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 z-0 rounded-full" />
                                  <div 
                                    className="absolute top-1/2 left-0 h-1 bg-accent -translate-y-1/2 z-0 transition-all duration-700 ease-in-out rounded-full shadow-[0_0_15px_rgba(58,175,169,0.4)]" 
                                    style={{ width: `${((bookingStep - 1) / 2) * 100}%` }}
                                  />
                                  
                                  {[
                                    { step: 1, label: 'Seats', icon: BusIcon },
                                    { step: 2, label: 'Details', icon: UserCheck },
                                    { step: 3, label: 'Payment', icon: CreditCard },
                                  ].map((s) => (
                                    <div key={s.step} className="relative z-10 flex flex-col items-center gap-2">
                                      <motion.div 
                                        initial={false}
                                        animate={{ 
                                          scale: bookingStep === s.step ? 1.1 : 1,
                                          backgroundColor: bookingStep >= s.step ? '#3AAFA9' : '#fff',
                                          borderColor: bookingStep >= s.step ? '#fff' : '#f1f5f9'
                                        }}
                                        className={cn(
                                          "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-4 shadow-md",
                                          bookingStep >= s.step ? "text-white" : "text-slate-300"
                                        )}
                                      >
                                        <s.icon size={18} />
                                      </motion.div>
                                      <span className={cn(
                                        "text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-500",
                                        bookingStep >= s.step ? "text-accent" : "text-slate-300"
                                      )}>
                                        {s.label}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <AnimatePresence mode="wait">
                                {bookingStep === 1 && (
                                  <motion.div 
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-4 pb-24 lg:pb-0"
                                  >
                                    {/* Legend */}
                                    <div className="flex flex-wrap items-center justify-center gap-8 bg-white p-6 rounded-[1.5rem] border border-slate-50 shadow-sm">
                                      {[
                                        { label: 'Booked (M)', color: 'bg-slate-400' },
                                        { label: 'Booked (F)', color: 'bg-female' },
                                        { label: 'Available', color: 'bg-white border-2 border-slate-100' },
                                        { label: 'Selected', color: 'bg-accent' },
                                        { label: 'Sold (M)', color: 'bg-red-500' },
                                        { label: 'Sold (F)', color: 'bg-pink-400' },
                                      ].map((item) => (
                                        <div key={item.label} className="flex items-center gap-3">
                                          <div className={`w-5 h-5 rounded-md ${item.color}`} />
                                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{item.label}</span>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="grid lg:grid-cols-2 gap-8 items-start">
                                      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-50 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(58,175,169,0.03)_0%,transparent_70%)] pointer-events-none" />
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

                                      <div className="space-y-6">
                                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-8">
                                          <h3 className="text-xl font-black text-primary tracking-tight">Selected Seats</h3>
                                          {selectedSeats.length > 0 ? (
                                            <div className="space-y-8">
                                              <div className="flex flex-wrap gap-4">
                                                {selectedSeats.map(seat => (
                                                  <span key={seat} className="px-6 py-3 bg-accent text-white font-black rounded-full shadow-lg animate-in zoom-in duration-300 text-sm tracking-tighter">
                                                    {seat}
                                                  </span>
                                                ))}
                                              </div>
                                              <div className="p-6 bg-slate-50 rounded-[1.5rem] space-y-4 border border-slate-100">
                                                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                  <span>Seat Fare ({selectedSeats.length}x)</span>
                                                  <span className="text-primary font-num">৳ {selectedSeats.length * (trip.fare || 500)}</span>
                                                </div>
                                                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                  <span>Processing Fee</span>
                                                  <span className="text-emerald-500">FREE</span>
                                                </div>
                                                <div className="pt-6 border-t border-slate-200 flex justify-between items-end">
                                                  <span className="text-xs font-black text-primary uppercase tracking-[0.2em]">Total</span>
                                                  <span className="text-3xl font-black text-accent font-num tracking-tighter leading-none">৳ {selectedSeats.length * (trip.fare || 500)}</span>
                                                </div>
                                              </div>
                                              <button 
                                                onClick={() => setBookingStep(2)}
                                                className="w-full py-5 bg-accent text-white font-black rounded-[1.5rem] shadow-xl shadow-accent/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-lg"
                                              >
                                                Continue to Details
                                                <ChevronRight size={22} />
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="py-12 text-center space-y-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                                              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                                                <Users className="text-slate-300" size={28} />
                                              </div>
                                              <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] max-w-[200px] mx-auto leading-relaxed">Please select up to 4 seats to continue</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}

                                {bookingStep === 2 && (
                                  <motion.div 
                                    key="step2"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="grid lg:grid-cols-2 gap-8 pb-24 lg:pb-0"
                                  >
                                                              {/* Passenger Details Card */}
                                    <div className="space-y-6">
                                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-8">
                                        <div className="flex items-center justify-between">
                                          <h3 className="text-xl font-black text-primary tracking-tight flex items-center gap-4">
                                            <UserCheck className="text-accent" size={24} />
                                            Passenger Details
                                          </h3>
                                          <div className="flex bg-slate-50 p-1.5 rounded-full border border-slate-100">
                                            {(['self', 'others'] as const).map(type => (
                                              <button
                                                key={type}
                                                onClick={() => setBookingFor(type)}
                                                className={cn(
                                                  "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500",
                                                  bookingFor === type 
                                                    ? "bg-white text-accent shadow-md scale-105" 
                                                    : "text-slate-400 hover:text-slate-600"
                                                )}
                                              >
                                                {type}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                        
                                        <div className="space-y-8">
                                          <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Full Name*</label>
                                              <input 
                                                type="text"
                                                placeholder="Enter your name" 
                                                className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all placeholder:text-slate-300 text-base"
                                                value={passengerData.name}
                                                onChange={e => setPassengerData({ ...passengerData, name: e.target.value })}
                                              />
                                            </div>
                                            <div className="space-y-3">
                                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Gender*</label>
                                              <div className="flex gap-4">
                                                {['male', 'female'].map(g => (
                                                  <button
                                                    key={g}
                                                    onClick={() => setPassengerData({ ...passengerData, gender: g as any })}
                                                    className={cn(
                                                      "flex-1 py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[10px] transition-all duration-500",
                                                      passengerData.gender === g 
                                                        ? "bg-primary text-white shadow-xl scale-105" 
                                                        : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                                    )}
                                                  >
                                                    {g}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Mobile Number*</label>
                                              <input 
                                                type="tel"
                                                placeholder="+8801XXXXXXXXX" 
                                                className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all placeholder:text-slate-300 text-base"
                                                value={passengerData.phone}
                                                onChange={e => setPassengerData({ ...passengerData, phone: e.target.value })}
                                              />
                                            </div>
                                            <div className="space-y-3">
                                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Email Address</label>
                                              <input 
                                                type="email"
                                                placeholder="example@mail.com" 
                                                className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all placeholder:text-slate-300 text-base"
                                                value={passengerData.email}
                                                onChange={e => setPassengerData({ ...passengerData, email: e.target.value })}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-8">
                                        <h3 className="text-xl font-black text-primary tracking-tight flex items-center gap-4">
                                          <MapPin className="text-emerald-500" size={24} />
                                          Route Selection
                                        </h3>
                                        
                                        <div className="space-y-6">
                                          <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Boarding Point*</label>
                                            <div className="relative">
                                              <select 
                                                className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all appearance-none cursor-pointer text-base"
                                                value={selectedBoarding}
                                                onChange={e => setSelectedBoarding(e.target.value)}
                                              >
                                                <option value="">Select boarding point</option>
                                                {(trip.boardingPoints || routes.find(r => r.id === trip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => (
                                                  <option key={counterId || idx} value={counterId}>
                                                    {counters.find(c => c.id === counterId)?.name || counterId}
                                                  </option>
                                                ))}
                                              </select>
                                              <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
                                            </div>
                                          </div>

                                          <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">Dropping Point*</label>
                                            <div className="relative">
                                              <select 
                                                className="w-full px-6 py-5 bg-slate-50 border-none rounded-[1.5rem] font-black text-primary outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all appearance-none cursor-pointer text-base"
                                                value={selectedDropping}
                                                onChange={e => setSelectedDropping(e.target.value)}
                                              >
                                                <option value="">Select dropping point</option>
                                                {(trip.droppingPoints || routes.find(r => r.id === trip.routeId)?.stops.map(s => typeof s === 'string' ? s : s.counterId) || []).map((counterId, idx) => (
                                                  <option key={counterId || idx} value={counterId}>
                                                    {counters.find(c => c.id === counterId)?.name || counterId}
                                                  </option>
                                                ))}
                                              </select>
                                              <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
                                             </div>
                                           </div>
                                         </div>
                                       </div>
                                     </div>

                                    <div className="space-y-6">
                                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-8 sticky top-24">
                                        <h3 className="text-xl font-black text-primary tracking-tight">Booking Summary</h3>
                                        <div className="space-y-4">
                                          <div className="flex justify-between items-center p-5 bg-slate-50 rounded-[1.5rem]">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Route</span>
                                            <span className="text-sm font-black text-primary">{route?.name}</span>
                                          </div>
                                          <div className="flex justify-between items-center p-5 bg-slate-50 rounded-[1.5rem]">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selected Seats</span>
                                            <span className="text-sm font-black text-accent">{selectedSeats.join(', ')}</span>
                                          </div>
                                          <div className="flex justify-between items-center p-5 bg-slate-50 rounded-[1.5rem]">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Departure Time</span>
                                            <span className="text-sm font-black text-primary">{format(new Date(trip.departureTime), 'MMM dd, hh:mm a')}</span>
                                          </div>
                                          <div className="pt-8 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-lg font-black text-primary uppercase tracking-widest">Total Payable</span>
                                            <div className="text-right">
                                              <span className="text-3xl font-black text-accent tracking-tighter leading-none">৳ {selectedSeats.length * (trip.fare || 500)}</span>
                                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">Inclusive of all taxes</p>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex gap-6 mt-10">
                                          <button 
                                            onClick={() => setBookingStep(1)}
                                            className="flex-1 py-5 bg-slate-50 text-slate-600 font-black rounded-[1.5rem] hover:bg-slate-100 transition-all active:scale-95 text-base"
                                          >
                                            Go Back
                                          </button>
                                          <button 
                                            disabled={!selectedBoarding || !selectedDropping || !passengerData.name || !passengerData.phone}
                                            onClick={() => setBookingStep(3)}
                                            className="flex-[2] py-5 bg-accent text-white font-black rounded-[1.5rem] shadow-xl shadow-accent/30 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center justify-center gap-3 text-lg"
                                          >
                                            Confirm & Pay
                                            <ChevronRight size={22} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}

                                {bookingStep === 3 && (
                                  <motion.div 
                                    key="step3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="max-w-3xl mx-auto pb-24 lg:pb-0"
                                  >
                                      <div className="bg-white p-10 rounded-[3rem] border border-slate-50 shadow-sm space-y-10 relative overflow-hidden group glossy-overlay">
                                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent via-emerald-400 to-accent" />
                                        <div className="text-center space-y-4">
                                          <h3 className="text-3xl font-black text-primary tracking-tight">Secure Checkout</h3>
                                          <p className="text-slate-400 font-bold text-sm">Select your preferred payment method to complete booking</p>
                                        </div>

                                        <div className="grid md:grid-cols-3 gap-8">
                                          {[
                                            { id: 'bKash', label: 'bKash', color: 'bg-[#D12053]', icon: Smartphone },
                                            { id: 'Nagad', label: 'Nagad', color: 'bg-[#F7941D]', icon: Wallet },
                                            { id: 'Card', label: 'Card', color: 'bg-primary', icon: CreditCard },
                                          ].map(method => (
                                            <button
                                              key={method.id}
                                              onClick={() => setPaymentMethod(method.id)}
                                              className={cn(
                                                "p-8 rounded-[2rem] border-2 transition-all duration-500 flex flex-col items-center gap-4 relative overflow-hidden group",
                                                paymentMethod === method.id 
                                                  ? "border-accent bg-accent/5 scale-105 shadow-xl" 
                                                  : "border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-white"
                                              )}
                                            >
                                              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl transition-transform duration-500 group-hover:scale-110", method.color)}>
                                                <method.icon size={32} />
                                              </div>
                                              <span className="font-black text-slate-900 uppercase tracking-[0.15em] text-sm">{method.label}</span>
                                              {paymentMethod === method.id && (
                                                <motion.div 
                                                  initial={{ scale: 0 }}
                                                  animate={{ scale: 1 }}
                                                  className="absolute top-4 right-4 text-accent"
                                                >
                                                  <CheckCircle2 size={24} fill="currentColor" className="text-accent bg-white rounded-full" />
                                                </motion.div>
                                              )}
                                            </button>
                                          ))}
                                        </div>

                                        <div className="bg-slate-50/50 p-10 rounded-[2rem] border border-slate-100 backdrop-blur-sm space-y-10">
                                          <div className="space-y-6">
                                            <div className="flex justify-between items-center text-slate-500 font-bold">
                                              <span className="text-base uppercase tracking-widest">Subtotal</span>
                                              <span className="text-2xl font-black text-slate-900 font-num">৳ {selectedSeats.length * (trip.fare || 500)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-slate-500 font-bold">
                                              <span className="text-base uppercase tracking-widest">Processing Fee</span>
                                              <span className="text-2xl font-black text-emerald-500 font-num">FREE</span>
                                            </div>
                                            <div className="pt-10 border-t border-slate-200 flex justify-between items-end">
                                              <div className="space-y-2">
                                                <span className="text-base font-black text-slate-400 uppercase tracking-widest">Total Amount</span>
                                                <p className="text-slate-500 text-sm font-medium">Final price including all charges</p>
                                              </div>
                                              <span className="text-5xl font-black text-accent tracking-tighter font-num leading-none">৳ {selectedSeats.length * (trip.fare || 500)}</span>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-6 bg-white p-8 rounded-[1.5rem] border border-slate-200 shadow-sm">
                                            <input 
                                              type="checkbox" 
                                              id="terms"
                                              checked={termsAccepted}
                                              onChange={e => setTermsAccepted(e.target.checked)}
                                              className="w-8 h-8 rounded-md accent-accent cursor-pointer"
                                            />
                                            <label htmlFor="terms" className="text-base font-bold text-slate-600 cursor-pointer">
                                              I agree to the <span className="text-accent hover:underline">Terms of Service</span> and <span className="text-accent hover:underline">Privacy Policy</span>
                                            </label>
                                          </div>

                                          <div className="flex gap-6 mt-10">
                                            <button 
                                              onClick={() => setBookingStep(2)}
                                              className="flex-1 py-5 bg-white text-slate-600 font-black rounded-[1.5rem] border border-slate-200 hover:bg-slate-50 transition-all active:scale-95 shadow-sm text-base"
                                            >
                                              Go Back
                                            </button>
                                            <button 
                                              disabled={!termsAccepted || !paymentMethod || loading}
                                              onClick={() => handleBooking()}
                                              className="flex-[2] py-5 bg-accent text-white font-black rounded-[1.5rem] shadow-xl shadow-accent/20 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center justify-center gap-3 relative overflow-hidden group text-lg"
                                            >
                                              {loading ? (
                                                <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                              ) : (
                                                <>
                                                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                                  <LockIcon size={24} />
                                                  Pay Securely Now
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                  </motion.div>
                                )}
                                </AnimatePresence>
                              </div>
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

        {/* Confirmation Modal */}
        <AnimatePresence>
          {showConfirmationModal && selectedTrip && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/80 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="bg-white rounded-[3rem] w-full max-w-lg md:max-w-3xl lg:max-w-5xl shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col border border-white/20"
              >
                {/* Header */}
                <div className="bg-primary p-10 text-white flex justify-between items-center relative overflow-hidden shrink-0">
                  <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(58,175,169,0.3)_0%,transparent_70%)]" />
                  <div className="relative z-10">
                    <h2 className="text-3xl font-black tracking-tighter mb-2">Confirm Your Booking</h2>
                    <p className="text-white/60 font-bold text-sm uppercase tracking-widest">Review details and complete payment</p>
                  </div>
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
                    className="relative z-10 p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-90"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="p-10 overflow-y-auto bg-slate-50/50">
                  <div className="mb-12 text-center">
                    <p className="text-3xl font-black text-primary tracking-tight">{popupSettings.title}</p>
                    <p className="text-base font-bold text-slate-400 mt-3">{popupSettings.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Left Column */}
                    <div className="space-y-8">
                      {/* Booking Details Card */}
                      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-2 h-full bg-accent" />
                        <div className="flex justify-between items-center mb-8">
                          <h4 className="font-black text-primary text-base uppercase tracking-widest flex items-center gap-3">
                            <div className="bg-accent/10 p-2 rounded-xl">
                              <BusIcon size={20} className="text-accent" />
                            </div>
                            Journey Details
                          </h4>
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">Onward</span>
                        </div>
                        
                        <div className="space-y-8">
                          <div>
                            <h3 className="font-black text-accent text-2xl tracking-tight">{operators.find(o => o.id === selectedTrip.operatorId)?.name || 'Unknown Operator'}</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{routes.find(r => r.id === selectedTrip.routeId)?.name || 'Unknown Route'}</p>
                          </div>
                          
                          <div className="flex justify-between items-center bg-slate-50/50 p-6 rounded-[1.5rem] border border-slate-50">
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Departure</p>
                              <p className="font-black text-primary text-2xl font-num">{safeFormat(selectedTrip.departureTime, 'hh:mm a')}</p>
                              <p className="text-xs font-bold text-slate-500 mt-1">{counters.find(c => c.id === searchParams.from)?.name || 'Unknown'}</p>
                            </div>
                            
                            <div className="flex-1 px-4 flex flex-col items-center justify-center relative">
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-4">
                                <Calendar size={12} />
                                <span className="font-num">{safeFormat(selectedTrip.departureTime, 'yyyy-MM-dd')}</span>
                              </div>
                              <div className="w-full h-[3px] bg-slate-200 relative flex items-center justify-center rounded-full">
                                <div className="absolute w-4 h-4 rounded-full bg-accent left-0 shadow-lg shadow-accent/20"></div>
                                <div className="absolute w-4 h-4 rounded-full bg-accent right-0 shadow-lg shadow-accent/20"></div>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-4">
                                <Clock size={12} />
                                <span className="font-num">{
                                  (() => {
                                    try {
                                      const dep = new Date(selectedTrip.departureTime);
                                      const arr = new Date(selectedTrip.arrivalTime);
                                      const diffMs = arr.getTime() - dep.getTime();
                                      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                                      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                      return `${diffHrs.toString().padStart(2, '0')}h ${diffMins.toString().padStart(2, '0')}m`;
                                    } catch (e) {
                                      return '00h 00m';
                                    }
                                  })()
                                }</span>
                              </div>
                            </div>
                            
                            <div className="flex-1 text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Arrival</p>
                              <p className="font-black text-primary text-2xl font-num">{safeFormat(selectedTrip.arrivalTime, 'hh:mm a')}</p>
                              <p className="text-xs font-bold text-slate-500 mt-1">{counters.find(c => c.id === searchParams.to)?.name || 'Unknown'}</p>
                            </div>
                          </div>
                          
                          <div className="pt-6 flex items-center gap-4">
                            <div className="bg-accent/10 p-3 rounded-2xl">
                              <Ticket size={24} className="text-accent" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Selected Seats</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedSeats.map(s => (
                                  <span key={s} className="px-4 py-1.5 bg-primary text-white rounded-xl text-sm font-black font-num shadow-sm">{s}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Passenger Details Card */}
                      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                        <h4 className="font-black text-primary text-base uppercase tracking-widest mb-8 flex items-center gap-3">
                          <div className="bg-primary/5 p-2 rounded-xl">
                            <User size={20} className="text-primary" />
                          </div>
                          Passenger Details
                        </h4>
                        <div className="space-y-6">
                          <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Name</p>
                            <p className="text-base font-black text-primary">{passengerData.name}</p>
                          </div>
                          <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Phone</p>
                            <p className="text-base font-black text-primary font-num">{passengerData.phone}</p>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Email</p>
                            <p className="text-base font-black text-primary">{passengerData.email}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-8">
                      {/* Fare Details Card */}
                      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                        <h4 className="font-black text-primary text-base uppercase tracking-widest mb-8 flex items-center gap-3">
                          <div className="bg-emerald-50 p-2 rounded-xl">
                            <CreditCard size={20} className="text-emerald-500" />
                          </div>
                          Fare Summary
                        </h4>
                        <div className="space-y-5">
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-bold text-slate-500">Seat Fare ({selectedSeats.length} seats)</p>
                            <p className="text-lg font-black text-primary font-num">৳ {(selectedSeats.length * (selectedTrip.fare || 500)).toLocaleString()}</p>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-bold text-slate-500">Processing Fee</p>
                            <p className="text-lg font-black text-primary font-num">৳ 40</p>
                          </div>
                          <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <p className="text-sm font-black text-emerald-600 uppercase tracking-widest">Discount Applied</p>
                            <p className="text-lg font-black text-emerald-600 font-num">- ৳ 40</p>
                          </div>
                          <div className="pt-6 border-t border-slate-100 flex justify-between items-end">
                            <div>
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Amount</p>
                              <p className="text-[10px] font-bold text-slate-400">Inclusive of all taxes</p>
                            </div>
                            <p className="text-4xl font-black text-accent tracking-tighter font-num">
                              ৳ {(selectedSeats.length * (selectedTrip.fare || 500)).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Payment and Coupon */}
                      <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Payment Method<span className="text-accent">*</span></label>
                            <div className="relative">
                              <select 
                                className="w-full pl-6 pr-12 py-4 bg-white border-2 border-slate-100 rounded-[1.2rem] font-black text-primary appearance-none focus:border-accent transition-all text-sm cursor-pointer"
                                value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value)}
                              >
                                <option>bKash</option>
                                <option>Nagad</option>
                                <option>Rocket</option>
                              </select>
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Coupon Code</label>
                            <div className="flex gap-2">
                              <input 
                                className="flex-1 px-6 py-4 bg-white border-2 border-slate-100 rounded-[1.2rem] font-black text-primary placeholder:text-slate-300 focus:border-accent transition-all text-sm"
                                placeholder="CODE"
                                value={couponCode}
                                onChange={e => setCouponCode(e.target.value)}
                              />
                              <button className="px-4 bg-primary text-white rounded-[1rem] font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95">
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Cancellation Policy & Terms */}
                        <div className="p-6 bg-white rounded-[1.5rem] border-2 border-dashed border-slate-200 flex items-center justify-between group hover:border-accent/30 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="bg-amber-50 p-3 rounded-xl">
                              <Info size={20} className="text-amber-500" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-primary">Cancellation Policy</p>
                              <p className="text-xs font-bold text-slate-400">Tickets are non-refundable during Eid holidays.</p>
                            </div>
                          </div>
                          <span className="bg-red-50 text-red-500 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border border-red-100">Non-Refundable</span>
                        </div>

                        <div className="space-y-6 pt-4">
                          <label className="flex items-center gap-4 cursor-pointer group">
                            <div className="relative flex items-center">
                              <input 
                                type="checkbox" 
                                checked={termsAccepted}
                                onChange={e => setTermsAccepted(e.target.checked)}
                                className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 bg-white checked:bg-accent checked:border-accent transition-all"
                              />
                              <Check className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" size={14} strokeWidth={4} />
                            </div>
                            <span className="text-xs font-bold text-slate-500 leading-relaxed">
                              I agree to the <span className="text-accent hover:underline">Terms & Conditions</span> and <span className="text-accent hover:underline">Privacy Policy</span>.
                            </span>
                          </label>

                          <button 
                            onClick={handleBooking}
                            disabled={!termsAccepted}
                            className="w-full py-6 bg-accent text-white font-black rounded-[1.5rem] shadow-2xl shadow-accent/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg uppercase tracking-widest"
                          >
                            <Shield size={24} />
                            Confirm & Purchase
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-female" />
              <div className="w-20 h-20 bg-female/10 rounded-[1.5rem] flex items-center justify-center mx-auto animate-pulse">
                <Info className="text-female" size={40} />
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-primary tracking-tight">Gender Warning</h3>
                <p className="text-slate-500 font-bold text-base leading-relaxed">
                  The adjacent seat is booked by a <span className="text-female font-black">female passenger</span>. Are you sure you want to book this seat?
                </p>
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setGenderWarning(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-[1.2rem] hover:bg-slate-200 transition-all text-sm uppercase tracking-widest"
                >
                  No, Cancel
                </button>
                <button 
                  onClick={() => {
                    setSelectedSeats(prev => [...prev, genderWarning.seat]);
                    setGenderWarning(null);
                  }}
                  className="flex-1 py-4 bg-female text-white font-black rounded-[1.2rem] shadow-xl shadow-female/20 hover:scale-[1.05] active:scale-95 transition-all text-sm uppercase tracking-widest"
                >
                  Yes, Proceed
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
            className="fixed inset-0 z-[150] flex items-center justify-center bg-primary/95 backdrop-blur-xl p-4 md:p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_50px_100px_rgba(0,0,0,0.5)] relative"
            >
              <button 
                onClick={() => setBookingSuccess(null)} 
                className="absolute top-8 right-8 p-4 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all z-10 group"
              >
                <X size={28} className="text-slate-500 group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
              </button>

              <div className="p-10 md:p-16 grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-10 text-center md:text-left">
                  <div className="relative inline-flex">
                    <div className="absolute inset-0 bg-emerald-400 rounded-[1.5rem] animate-ping opacity-20" />
                    <div className="relative bg-emerald-500 p-6 rounded-[1.5rem] shadow-2xl shadow-emerald-200">
                      <CheckCircle2 size={48} className="text-white" />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h2 className="text-5xl font-black text-primary tracking-tighter leading-tight">Booking<br />Successful!</h2>
                    <p className="text-slate-500 font-bold text-2xl">Your Ticket ID: <span className="text-accent font-black font-num">{bookingSuccess.id}</span></p>
                    {(() => {
                      const trip = trips.find(t => t.id === bookingSuccess.tripId);
                      return trip ? (
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 inline-block">
                          <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Travel Date</p>
                          <p className="text-primary font-black text-2xl font-num">{safeFormat(trip.departureTime, 'dd MMMM, yyyy')}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="flex flex-col gap-6">
                    <button 
                      onClick={downloadETicket} 
                      className="w-full bg-primary text-white py-5 rounded-[1.5rem] font-black text-xl flex items-center justify-center gap-4 shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Download size={28} />
                      <span>Download E-Ticket</span>
                    </button>
                    <div className="grid grid-cols-2 gap-6">
                      <button 
                        onClick={() => { setTrackingTripId(bookingSuccess.tripId); setBookingSuccess(null); }} 
                        className="py-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-black text-primary hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-3 text-base"
                      >
                        <Navigation size={24} />
                        <span>Track Bus</span>
                      </button>
                      <button 
                        onClick={printETicket} 
                        className="py-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-black text-primary hover:border-emerald-500 hover:text-emerald-500 transition-all flex items-center justify-center gap-3 text-base"
                      >
                        <Printer size={24} />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-10 bg-slate-50 p-10 rounded-[2.5rem] border border-slate-100">
                  <div className="p-10 bg-white rounded-[2rem] shadow-2xl shadow-slate-200 border border-slate-100">
                    <QRCodeCanvas id="ticket-qrcode" value={bookingSuccess.id} size={240} level="H" includeMargin />
                  </div>
                  <div className="text-center space-y-3">
                    <p className="text-sm text-slate-400 font-black uppercase tracking-[0.4em]">Digital Ticket QR</p>
                    <p className="text-base text-slate-500 font-bold">Show this QR code at the counter for verification</p>
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
  </div>
);
};
