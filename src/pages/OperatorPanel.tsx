import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, where, getDocs, limit, serverTimestamp, setDoc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Counter, Trip, Booking, Passenger, SeatLock, Route, Bus, Operator, Crew } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { SeatMap } from '../components/SeatMap';
import { Bus as BusIcon, Search, User, Phone, Mail, Printer, MapPin, Wallet, Clock, CheckCircle2, AlertCircle, Download, CreditCard, LogOut, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Login } from '../components/Login';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';

export const OperatorPanel = () => {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<Operator | null>(null);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounter, setSelectedCounter] = useState<Counter | null>(null);
  const [lockedSeats, setLockedSeats] = useState<string[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerData, setPassengerData] = useState({ name: '', phone: '', email: '', gender: 'male' as 'male' | 'female' });
  const [boardingPoint, setBoardingPoint] = useState('');
  const [droppingPoint, setDroppingPoint] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);

  const [localCrewIds, setLocalCrewIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTrip) {
      setLocalCrewIds(selectedTrip.crewIds || []);
    }
  }, [selectedTrip]);

  useEffect(() => {
    if (saveStatus) {
      const timer = setTimeout(() => setSaveStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const updateLocalTripCrew = (role: 'driver' | 'supervisor' | 'helper', crewId: string) => {
    if (!selectedTrip) return;
    
    // Remove old crew with this role
    let newCrewIds = localCrewIds.filter(id => {
      const c = crew.find(item => item.id === id);
      return c?.role?.toLowerCase() !== role.toLowerCase();
    });
    
    // Add new crew
    if (crewId) {
      newCrewIds.push(crewId);
    }
    
    setLocalCrewIds(newCrewIds);
  };

  const saveCrew = async () => {
    if (!selectedTrip) return;
    await updateDoc(doc(db, 'trips', selectedTrip.id), { crewIds: localCrewIds });
    setSaveStatus('Saved successfully.');
  };

  useEffect(() => {
    const savedOperator = localStorage.getItem('operator_session');
    if (savedOperator) {
      const opData = JSON.parse(savedOperator);
      setUser(opData);
      setOperatorProfile(opData);
      // Auto-select the counter
      const fetchCounter = async () => {
        const counterDoc = await getDoc(doc(db, 'counters', opData.counterId));
        if (counterDoc.exists()) {
          setSelectedCounter({ id: counterDoc.id, ...counterDoc.data() } as Counter);
        }
      };
      fetchCounter();
    }
    setIsAuthReady(true);

    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Counter)));
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    });
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
    });
    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    });
    const unsubPassengers = onSnapshot(collection(db, 'passengers'), (snapshot) => {
      setPassengers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger)));
    });
    const unsubCrew = onSnapshot(collection(db, 'crew'), (snapshot) => {
      setCrew(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Crew)));
    });

    return () => {
      unsubCounters();
      unsubRoutes();
      unsubBuses();
      unsubTrips();
      unsubPassengers();
      unsubCrew();
    };
  }, []);

  useEffect(() => {
    if (!operatorProfile || !routes.length || !trips.length) {
      setFilteredTrips([]);
      return;
    }

    // Filter trips where the operator's counter is a boarding point AND date matches
    const validTrips = trips.filter(trip => {
      const isBoardingPoint = trip.boardingPoints?.includes(operatorProfile.counterId);
      const isDateMatch = trip.date === selectedDate || format(new Date(trip.departureTime), 'yyyy-MM-dd') === selectedDate;
      return isBoardingPoint && isDateMatch;
    });
    setFilteredTrips(validTrips);
  }, [operatorProfile, routes, trips, selectedDate]);

  useEffect(() => {
    if (!selectedTrip) {
      setBookings([]);
      return;
    }
    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('tripId', '==', selectedTrip.id)),
      (snapshot) => {
        setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      }
    );
    return () => unsubBookings();
  }, [selectedTrip]);

  useEffect(() => {
    if (!selectedTrip) return;
    const unsubLocks = onSnapshot(
      query(collection(db, 'seatLocks'), where('tripId', '==', selectedTrip.id)),
      (snapshot) => {
        const now = new Date();
        const activeLocks = snapshot.docs
          .map(doc => doc.data() as SeatLock)
          .filter(lock => new Date(lock.expiresAt) > now)
          .map(lock => lock.seatNumber);
        setLockedSeats(activeLocks);
      }
    );
    return () => unsubLocks();
  }, [selectedTrip]);

  const handleCustomLogin = async (id: string, pass: string) => {
    setLoginError(null);
    try {
      const q = query(collection(db, 'operators'), where('customId', '==', id), where('password', '==', pass));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const opData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Operator;
        setUser(opData);
        setOperatorProfile(opData);
        localStorage.setItem('operator_session', JSON.stringify(opData));
        
        const counterDoc = await getDoc(doc(db, 'counters', opData.counterId));
        if (counterDoc.exists()) {
          setSelectedCounter({ id: counterDoc.id, ...counterDoc.data() } as Counter);
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
    setOperatorProfile(null);
    setSelectedCounter(null);
    localStorage.removeItem('operator_session');
  };

  if (!isAuthReady) return null;

  if (!operatorProfile) {
    return (
      <Login 
        title="Operator Login" 
        onLogin={handleCustomLogin} 
        error={loginError} 
      />
    );
  }

  const generateTicketId = () => {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const randomChars = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    return `SL-${randomNum}${randomChars}`;
  };

  const handlePhoneChange = async (phone: string) => {
    setPassengerData(prev => ({ ...prev, phone }));
    if (phone.length >= 11) {
      const q = query(collection(db, 'passengers'), where('phone', '==', phone), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as Passenger;
        setPassengerData({ name: data.name, phone: data.phone, email: data.email, gender: data.gender || 'male' });
      }
    }
  };

  const handleSeatClick = async (seat: string) => {
    if (!selectedTrip || !selectedCounter) return;

    // Check if the seat is already booked (not sold)
    const existingBooking = bookings.find(b => b.seats.includes(seat) && b.status === 'booked');
    if (existingBooking) {
      if (window.confirm(`Are you sure you want to unbook seat ${seat}?`)) {
        try {
          if (existingBooking.seats.length === 1) {
            await updateDoc(doc(db, 'bookings', existingBooking.id), { status: 'cancelled' });
          } else {
            const newSeats = existingBooking.seats.filter(s => s !== seat);
            await updateDoc(doc(db, 'bookings', existingBooking.id), { seats: newSeats });
          }
        } catch (error) {
          console.error("Error unbooking seat:", error);
          alert("Failed to unbook seat.");
        }
      }
      return;
    }

    if (selectedSeats.includes(seat)) {
      setSelectedSeats(prev => prev.filter(s => s !== seat));
      // Remove lock
      try {
        const lockToRemove = selectedTrip.lockedSeats?.find(l => l.seatId === seat && l.counterId === selectedCounter.id);
        if (lockToRemove) {
          await updateDoc(doc(db, 'trips', selectedTrip.id), {
            lockedSeats: arrayRemove(lockToRemove)
          });
        }
      } catch (e) {
        console.error("Failed to remove lock", e);
      }
    } else {
      if (selectedSeats.length < 4) {
        // Check if it's already locked by someone else
        const isLockedByOther = selectedTrip.lockedSeats?.some(l => l.seatId === seat && l.counterId !== selectedCounter.id && (Date.now() - new Date(l.timestamp).getTime() < 5 * 60000));
        if (isLockedByOther) {
          alert('Seat is currently being booked by another counter');
          return;
        }

        setSelectedSeats(prev => [...prev, seat]);
        // Add lock
        try {
          await updateDoc(doc(db, 'trips', selectedTrip.id), {
            lockedSeats: arrayUnion({
              seatId: seat,
              counterId: selectedCounter.id,
              timestamp: new Date().toISOString()
            })
          });
        } catch (e) {
          console.error("Failed to add lock", e);
        }
      } else {
        alert('Maximum 4 seats per booking');
      }
    }
  };

  const handleBooking = async (action: 'book' | 'sell') => {
    if (!selectedTrip || !selectedCounter || selectedSeats.length === 0 || !passengerData.name || !passengerData.phone || !boardingPoint || !droppingPoint) {
      alert('Please fill all required fields');
      return;
    }

    const totalFare = selectedSeats.length * selectedTrip.fare;
    if (action === 'sell' && selectedCounter.walletBalance < totalFare) {
      alert('Insufficient wallet balance');
      return;
    }

    setIsBooking(true);
    try {
      // 1. Create/Update Passenger
      let passengerId = '';
      const q = query(collection(db, 'passengers'), where('phone', '==', passengerData.phone), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        const pDoc = await addDoc(collection(db, 'passengers'), { ...passengerData, isBlacklisted: false });
        passengerId = pDoc.id;
      } else {
        passengerId = snapshot.docs[0].id;
      }

      // 2. Create Booking
      const ticketId = generateTicketId();
      const bookingData: Booking = {
        id: ticketId,
        tripId: selectedTrip.id,
        passengerId,
        seats: selectedSeats,
        gender: passengerData.gender,
        withCounter: true,
        boardingStopId: boardingPoint,
        droppingStopId: droppingPoint,
        totalFare,
        timestamp: new Date().toISOString(),
        status: action === 'sell' ? 'sold' : 'booked',
        bookedByCounterId: selectedCounter.id
      };
      
      await setDoc(doc(db, 'bookings', ticketId), bookingData);

      // 3. Update Wallet (only if sold)
      if (action === 'sell') {
        await updateDoc(doc(db, 'counters', selectedCounter.id), {
          walletBalance: selectedCounter.walletBalance - totalFare
        });
        await addDoc(collection(db, 'walletTransactions'), {
          counterId: selectedCounter.id,
          amount: -totalFare,
          type: 'booking',
          timestamp: new Date().toISOString(),
          description: `Booking ${ticketId} for ${selectedSeats.join(', ')}`,
          status: 'completed'
        });
      }

      // 4. Remove locks
      try {
        const locksToRemove = selectedTrip.lockedSeats?.filter(l => selectedSeats.includes(l.seatId) && l.counterId === selectedCounter.id) || [];
        if (locksToRemove.length > 0) {
          await updateDoc(doc(db, 'trips', selectedTrip.id), {
            lockedSeats: arrayRemove(...locksToRemove)
          });
        }
      } catch (e) {
        console.error("Failed to remove locks", e);
      }

      setBookingSuccess(bookingData);
      setSelectedSeats([]);
      setPassengerData({ name: '', phone: '', email: '', gender: 'male' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    } finally {
      setIsBooking(false);
    }
  };

  const handlePrintTicket = () => {
    if (!bookingSuccess) return;
    const trip = trips.find(t => t.id === bookingSuccess.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const bus = buses.find(b => b.id === trip?.busId);
    const bPoint = counters.find(c => c.id === bookingSuccess.boardingStopId);
    const dPoint = counters.find(c => c.id === bookingSuccess.droppingStopId);

    printTicketHTML(
      bookingSuccess,
      trip,
      route,
      bPoint,
      dPoint,
      bus,
      passengerData,
      'ticket-qrcode'
    );
  };

  const handleDownloadETicket = () => {
    if (!bookingSuccess) return;
    const trip = trips.find(t => t.id === bookingSuccess.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const bus = buses.find(b => b.id === trip?.busId);
    const bPoint = counters.find(c => c.id === bookingSuccess.boardingStopId);
    const dPoint = counters.find(c => c.id === bookingSuccess.droppingStopId);

    generateTicketPDF(
      bookingSuccess,
      trip,
      route,
      bPoint,
      dPoint,
      bus,
      passengerData,
      'ticket-qrcode'
    );
  };

  const handleReceiveBus = async (tripId: string) => {
    try {
      await updateDoc(doc(db, 'trips', tripId), {
        status: 'arrived',
        receivedAt: new Date().toISOString(),
        receivedBy: operatorProfile?.name
      });
      alert('Bus received successfully.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/receive');
    }
  };

  const handleDeparted = async (tripId: string) => {
    if (!selectedCounter) return;
    try {
      const tripRef = doc(db, 'trips', tripId);
      const trip = trips.find(t => t.id === tripId);
      if (!trip) return;

      const newStopLog = {
        counterId: selectedCounter.id,
        timestamp: new Date().toISOString()
      };

      await updateDoc(tripRef, {
        status: 'departed',
        currentStopIndex: (trip.currentStopIndex || 0) + 1,
        stopLogs: [...(trip.stopLogs || []), newStopLog]
      });
      alert('Trip status updated to Departed');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'trips/departed');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Counter Dashboard</h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">{operatorProfile?.name} | {selectedCounter?.name}</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
      {/* Left Column: Selection & POS */}
      <div className="lg:col-span-8 space-y-6">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <BusIcon className="text-accent" />
              Ticket Booking POS
            </h2>
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              <Wallet className="text-emerald-600" size={18} />
              <span className="font-bold text-emerald-700">
                ৳ {selectedCounter?.walletBalance.toLocaleString() || 0}
              </span>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-500 mb-1">Select Date</label>
            <div className="relative">
              <input 
                type="date" 
                id="operator-date-input"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent cursor-pointer font-bold text-slate-700"
                value={selectedDate}
                onChange={e => {
                  setSelectedDate(e.target.value);
                  setSelectedTrip(null);
                }}
                onClick={() => (document.getElementById('operator-date-input') as HTMLInputElement)?.showPicker()}
              />
            </div>
          </div>

          {!selectedTrip ? (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 mb-4">Available Trips</h3>
              {filteredTrips.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-slate-500">No trips available on this date.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredTrips.map(trip => {
                    const route = routes.find(r => r.id === trip.routeId);
                    const bus = buses.find(b => b.id === trip.busId);
                    return (
                        <div 
                          key={trip.id}
                          onClick={() => setSelectedTrip(trip)}
                          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-accent hover:shadow-md transition-all cursor-pointer flex justify-between items-center group"
                        >
                          <div>
                            <h4 className="font-black uppercase tracking-tight text-slate-800 text-lg">{route?.name}</h4>
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">
                              <span className="flex items-center gap-1"><Clock size={14} /> {format(new Date(trip.departureTime), 'hh:mm a')}</span>
                              <span className="flex items-center gap-1"><BusIcon size={14} /> {bus?.isAC ? 'AC' : 'Non-AC'} ({trip.coachNumber})</span>
                            </div>
                          </div>
                          <button className="px-4 py-2 bg-accent/10 text-accent font-black uppercase tracking-widest text-[10px] rounded-lg group-hover:bg-accent group-hover:text-white transition-colors">
                            Select
                          </button>
                        </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">{routes.find(r => r.id === selectedTrip.routeId)?.name}</h3>
                  <p className="text-sm text-slate-500 font-medium">{format(new Date(selectedTrip.departureTime), 'hh:mm a')} | Coach: {selectedTrip.coachNumber}</p>
                </div>
                <button 
                  onClick={() => setSelectedTrip(null)}
                  className="px-4 py-2 text-sm font-bold text-accent bg-white border border-accent/20 rounded-xl hover:bg-accent/5 transition-all"
                >
                  Change
                </button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8">
                <SeatMap
                  capacity={buses.find(b => b.id === selectedTrip.busId)?.capacity || 40}
                  bookedSeats={bookings.filter(b => b.status === 'booked').flatMap(b => b.seats)}
                  femaleBookedSeats={bookings.filter(b => b.status === 'booked').filter(b => {
                    const p = passengers.find(pass => pass.id === b.passengerId);
                    return p?.gender === 'female';
                  }).flatMap(b => b.seats)}
                  soldSeats={bookings.filter(b => b.status === 'sold' || b.status === 'confirmed').flatMap(b => b.seats)}
                  femaleSoldSeats={bookings.filter(b => b.status === 'sold' || b.status === 'confirmed').filter(b => {
                    const p = passengers.find(pass => pass.id === b.passengerId);
                    return p?.gender === 'female';
                  }).flatMap(b => b.seats)}
                  selectedSeats={selectedSeats}
                  lockedSeats={selectedTrip.lockedSeats?.filter(l => l.counterId !== selectedCounter?.id && (Date.now() - new Date(l.timestamp).getTime() < 5 * 60000)).map(l => l.seatId) || []}
                  onSeatClick={handleSeatClick}
                  bookings={bookings}
                  passengers={passengers}
                  counters={counters}
                  onReprint={(booking) => {
                    const trip = trips.find(t => t.id === booking.tripId);
                    const route = routes.find(r => r.id === trip?.routeId);
                    const bus = buses.find(b => b.id === trip?.busId);
                    const bPoint = counters.find(c => c.id === booking.boardingStopId);
                    const dPoint = counters.find(c => c.id === booking.droppingStopId);
                    const passenger = passengers.find(p => p.id === booking.passengerId);
                    
                    generateTicketPDF(
                      booking,
                      trip,
                      route,
                      bPoint,
                      dPoint,
                      bus,
                      passenger || { name: 'Unknown', phone: '', email: '', gender: 'male' },
                      'ticket-qrcode'
                    );
                  }}
                  onDetails={(booking) => {
                    alert(`Booking ID: ${booking.id}\nPassenger: ${passengers.find(p => p.id === booking.passengerId)?.name}\nSeats: ${booking.seats.join(', ')}`);
                  }}
                  isOperator={true}
                />
                
                <div className="space-y-6">
                  <div className="bg-accent/5 p-6 rounded-[24px] border border-accent/10 space-y-4">
                  <h3 className="font-black text-accent flex items-center gap-2 uppercase text-sm tracking-wider">
                    <User size={18} />
                    Passenger Info
                  </h3>
                  <div className="space-y-3">
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input
                        type="tel"
                        placeholder="Mobile Number"
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium"
                        value={passengerData.phone}
                        onChange={e => handlePhoneChange(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder="Full Name"
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium"
                        value={passengerData.name}
                        onChange={e => setPassengerData({ ...passengerData, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium"
                        value={passengerData.gender}
                        onChange={e => setPassengerData({ ...passengerData, gender: e.target.value as 'male' | 'female' })}
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                          type="email"
                          placeholder="Email"
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-medium"
                          value={passengerData.email}
                          onChange={e => setPassengerData({ ...passengerData, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4">
                  <h3 className="font-black text-slate-700 flex items-center gap-2 uppercase text-sm tracking-wider">
                    <Users size={18} />
                    Select Crew
                  </h3>
                  <div className="space-y-3">
                    <select 
                      className="w-full p-2 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none disabled:bg-slate-100 disabled:text-slate-500" 
                      value={localCrewIds.find(id => {
                        const c = crew.find(item => item.id === id);
                        return c?.role?.toLowerCase() === 'driver';
                      }) || ''}
                      onChange={(e) => updateLocalTripCrew('driver', e.target.value)}
                      disabled={!!selectedTrip?.crewIds && selectedTrip.crewIds.length > 0}
                    >
                      <option value="">Select Driver</option>
                      {crew.filter(c => c.role?.toLowerCase() === 'driver').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select 
                      className="w-full p-2 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none disabled:bg-slate-100 disabled:text-slate-500" 
                      value={localCrewIds.find(id => {
                        const c = crew.find(item => item.id === id);
                        return c?.role?.toLowerCase() === 'supervisor';
                      }) || ''}
                      onChange={(e) => updateLocalTripCrew('supervisor', e.target.value)}
                      disabled={!!selectedTrip?.crewIds && selectedTrip.crewIds.length > 0}
                    >
                      <option value="">Select Supervisor</option>
                      {crew.filter(c => c.role?.toLowerCase() === 'supervisor').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select 
                      className="w-full p-2 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none disabled:bg-slate-100 disabled:text-slate-500" 
                      value={localCrewIds.find(id => {
                        const c = crew.find(item => item.id === id);
                        return c?.role?.toLowerCase() === 'helper';
                      }) || ''}
                      onChange={(e) => updateLocalTripCrew('helper', e.target.value)}
                      disabled={!!selectedTrip?.crewIds && selectedTrip.crewIds.length > 0}
                    >
                      <option value="">Select Helper</option>
                      {crew.filter(c => c.role?.toLowerCase() === 'helper').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {(!selectedTrip?.crewIds || selectedTrip.crewIds.length === 0) && (
                      <button onClick={saveCrew} className="w-full py-3 bg-accent text-white font-black rounded-xl hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all uppercase tracking-wider text-sm">
                        Save
                      </button>
                    )}
                    {saveStatus && (
                      <p className="text-accent text-sm font-bold text-center mt-2">{saveStatus}</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4">
                  <h3 className="font-black text-slate-700 flex items-center gap-2 uppercase text-sm tracking-wider">
                    <MapPin size={18} />
                    Stop Points
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Boarding</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none"
                        value={boardingPoint}
                        onChange={e => setBoardingPoint(e.target.value)}
                      >
                        <option value="">Select</option>
                        {selectedTrip.boardingPoints?.map(id => (
                          <option key={id} value={id}>{counters.find(c => c.id === id)?.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Dropping</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none"
                        value={droppingPoint}
                        onChange={e => setDroppingPoint(e.target.value)}
                      >
                        <option value="">Select</option>
                        {selectedTrip.droppingPoints?.filter(id => 
                          selectedCounter?.allowedDestinationCounters?.includes(id)
                        ).map(id => (
                          <option key={id} value={id}>{counters.find(c => c.id === id)?.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-accent/10 p-6 rounded-[32px] border border-accent/20 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold">Selected Seats</span>
                    <span className="font-black text-accent tracking-widest text-lg">{selectedSeats.join(', ') || 'None'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xl">
                    <span className="font-black text-slate-800 uppercase tracking-tight">Total Fare</span>
                    <span className="font-black text-accent">৳ {(selectedSeats.length * selectedTrip.fare).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4">
                    <button
                      disabled={isBooking || selectedSeats.length === 0}
                      onClick={() => handleBooking('book')}
                      className="flex-1 bg-slate-800 text-white py-4 flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-slate-800/30 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                    >
                      <CreditCard size={20} />
                      {isBooking ? 'Processing...' : 'Book'}
                    </button>
                    <button
                      disabled={isBooking || selectedSeats.length === 0}
                      onClick={() => handleBooking('sell')}
                      className="flex-1 bg-accent text-white py-4 flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-accent/30 rounded-2xl font-black uppercase tracking-widest hover:bg-accent/90 transition-all"
                    >
                      <CreditCard size={20} />
                      {isBooking ? 'Processing...' : 'Sell'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Success Modal */}
      {bookingSuccess && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-primary/95 backdrop-blur-xl p-4 md:p-8">
          <div className="bg-white rounded-[3.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_50px_100px_rgba(0,0,0,0.5)] relative">
            <button 
              onClick={() => setBookingSuccess(null)} 
              className="absolute top-8 right-8 p-4 bg-slate-100 hover:bg-slate-200 rounded-full transition-all z-10 group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 group-hover:text-primary group-hover:rotate-90 transition-all duration-500"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
                        <p className="text-primary font-black text-xl font-num">{format(new Date(trip.departureTime), 'dd MMMM, yyyy')}</p>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={handlePrintTicket} 
                      className="w-full bg-primary text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Printer size={20} />
                      <span>Print</span>
                    </button>
                    <button 
                      onClick={handleDownloadETicket} 
                      className="w-full bg-accent text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Download size={20} />
                      <span>Download</span>
                    </button>
                  </div>
                  <button 
                    onClick={() => setBookingSuccess(null)} 
                    className="py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-primary hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2"
                  >
                    New Booking
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-[2.5rem] p-8 md:p-12 border border-slate-100 flex flex-col items-center justify-center gap-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent via-emerald-400 to-accent" />
                <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50">
                  <QRCodeCanvas id="ticket-qrcode" value={bookingSuccess.id} size={200} level="H" className="w-full h-auto" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Scan for Details</p>
                  <p className="text-slate-600 font-medium text-sm">Present this QR code while boarding</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right Column: Live Trips */}
      <div className="lg:col-span-4 space-y-6">
        {/* Incoming Trips Section */}
        <div className="card-premium">
          <h3 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
            <Clock className="text-accent" />
            Incoming Buses
          </h3>
          <div className="space-y-4">
            {trips
              .filter(trip => {
                const route = routes.find(r => r.id === trip.routeId);
                if (!route || !selectedCounter) return false;
                const lastStop = route.stops[route.stops.length - 1];
                return lastStop.counterId === selectedCounter.id && trip.status === 'departed';
              })
              .map(trip => {
                const route = routes.find(r => r.id === trip.routeId);
                return (
                  <div key={trip.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-slate-900 uppercase tracking-tight">{route?.name}</p>
                        <p className="text-xs text-slate-500 font-bold">{trip.coachNumber}</p>
                      </div>
                      <span className="px-2 py-1 bg-accent/10 text-accent text-[10px] font-black rounded-full uppercase tracking-wider">
                        {trip.status}
                      </span>
                    </div>
                    <button
                      onClick={() => handleReceiveBus(trip.id)}
                      className="w-full mt-2 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-all flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest shadow-lg shadow-accent/10"
                    >
                      <CheckCircle2 size={16} />
                      Receive Bus
                    </button>
                  </div>
                );
              })}
            {trips.filter(trip => {
              const route = routes.find(r => r.id === trip.routeId);
              if (!route || !selectedCounter) return false;
              const lastStop = route.stops[route.stops.length - 1];
              return lastStop.counterId === selectedCounter.id && trip.status === 'departed';
            }).length === 0 && (
              <p className="text-center text-slate-400 py-4 text-sm font-bold italic">
                No incoming buses
              </p>
            )}
          </div>
        </div>

        <div className="card-premium">
          <h3 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
            <Clock className="text-accent" />
            Live Trip Updates
          </h3>
          <div className="space-y-4">
            {trips.filter(t => t.status !== 'arrived' && format(new Date(t.departureTime), 'yyyy-MM-dd') === selectedDate).map(trip => {
              const route = routes.find(r => r.id === trip.routeId);
              const isDepartedFromHere = trip.stopLogs?.some(log => log.counterId === selectedCounter?.id);

              return (
                <div key={trip.id} className="p-4 border border-slate-100 rounded-2xl hover:bg-accent/5 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tight group-hover:text-accent transition-colors">{route?.name}</h4>
                      <p className="text-xs text-slate-500 font-bold">{format(new Date(trip.departureTime), 'hh:mm a, dd MMM')}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
                      trip.status === 'departed' ? "bg-accent/10 text-accent" : "bg-blue-100 text-blue-700"
                    )}>
                      {trip.status}
                    </span>
                  </div>
                  <button
                    disabled={!selectedCounter || isDepartedFromHere}
                    onClick={() => handleDeparted(trip.id)}
                    className="w-full py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-700 hover:bg-accent hover:text-white hover:border-accent transition-all disabled:opacity-50 disabled:bg-slate-50 uppercase tracking-widest"
                  >
                    {isDepartedFromHere ? 'Already Departed' : 'Bus Departed'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
