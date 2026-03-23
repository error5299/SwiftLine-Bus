import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, where, getDocs, limit, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { Counter, Trip, Booking, Passenger, SeatLock, Route, Bus, Operator, Crew } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { SeatMap } from '../components/SeatMap';
import { Bus as BusIcon, Search, User, Phone, Mail, Printer, MapPin, Wallet, Clock, CheckCircle2, AlertCircle, Download, CreditCard, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { Login } from '../components/Login';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { generateTicketPDF } from '../utils/ticketGenerator';

export const OperatorPanel = () => {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<Operator | null>(null);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounter, setSelectedCounter] = useState<Counter | null>(null);
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
  const [lockedSeats, setLockedSeats] = useState<string[]>([]);
  const [passengerData, setPassengerData] = useState({ name: '', phone: '', email: '', gender: 'male' as 'male' | 'female' });
  const [boardingPoint, setBoardingPoint] = useState('');
  const [droppingPoint, setDroppingPoint] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);

  const updateTripCrew = async (role: 'driver' | 'supervisor' | 'helper', crewId: string) => {
    if (!selectedTrip) return;
    
    // Remove old crew with this role
    let newCrewIds = selectedTrip.crewIds.filter(id => {
      const c = crew.find(c => c.id === id);
      return c?.role !== role;
    });
    
    // Add new crew
    if (crewId) {
      newCrewIds.push(crewId);
    }
    
    await updateDoc(doc(db, 'trips', selectedTrip.id), { crewIds: newCrewIds });
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
        setLoginError(t('ভুল আইডি বা পাসওয়ার্ড।', 'Invalid ID or Password.'));
      }
    } catch (err) {
      setLoginError(t('লগইন করতে সমস্যা হয়েছে।', 'Error during login.'));
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
        title={t('অপারেটর লগইন', 'Operator Login')} 
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

  const handleSeatClick = (seat: string) => {
    if (selectedSeats.includes(seat)) {
      setSelectedSeats(prev => prev.filter(s => s !== seat));
    } else {
      if (selectedSeats.length < 4) {
        setSelectedSeats(prev => [...prev, seat]);
      } else {
        alert('Maximum 4 seats per booking');
      }
    }
  };

  const handleBooking = async () => {
    if (!selectedTrip || !selectedCounter || selectedSeats.length === 0 || !passengerData.name || !passengerData.phone || !boardingPoint || !droppingPoint) {
      alert('Please fill all required fields');
      return;
    }

    const totalFare = selectedSeats.length * selectedTrip.fare;
    if (selectedCounter.walletBalance < totalFare) {
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
        boardingStopId: boardingPoint,
        droppingStopId: droppingPoint,
        totalFare,
        timestamp: new Date().toISOString(),
        status: 'confirmed',
        bookedByCounterId: selectedCounter.id
      };
      
      await setDoc(doc(db, 'bookings', ticketId), bookingData);

      // 3. Update Wallet
      await updateDoc(doc(db, 'counters', selectedCounter.id), {
        walletBalance: selectedCounter.walletBalance - totalFare
      });
      await addDoc(collection(db, 'walletTransactions'), {
        counterId: selectedCounter.id,
        amount: -totalFare,
        type: 'booking',
        timestamp: new Date().toISOString(),
        description: `Booking ${ticketId} for ${selectedSeats.join(', ')}`
      });

      setBookingSuccess(bookingData);
      setSelectedSeats([]);
      setPassengerData({ name: '', phone: '', email: '', gender: 'male' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    } finally {
      setIsBooking(false);
    }
  };

  const printTicket = () => {
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
      alert(t('বাসটি সফলভাবে রিসিভ করা হয়েছে।', 'Bus received successfully.'));
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
          <h1 className="text-3xl font-bold text-slate-900">{t('কাউন্টার ড্যাশবোর্ড', 'Counter Dashboard')}</h1>
          <p className="text-slate-500">{operatorProfile?.name} | {selectedCounter?.name}</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          <span>{t('লগআউট', 'Logout')}</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
      {/* Left Column: Selection & POS */}
      <div className="lg:col-span-8 space-y-6">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <BusIcon className="text-primary" />
              {t('টিকিট বুকিং কাউন্টার', 'Ticket Booking POS')}
            </h2>
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              <Wallet className="text-emerald-600" size={18} />
              <span className="font-bold text-emerald-700">
                ৳ {selectedCounter?.walletBalance.toLocaleString() || 0}
              </span>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-500 mb-1">{t('তারিখ নির্বাচন করুন', 'Select Date')}</label>
            <div className="relative">
              <input 
                type="date" 
                id="operator-date-input"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                value={selectedDate}
                onChange={e => {
                  setSelectedDate(e.target.value);
                  setSelectedTrip(null);
                }}
                onClick={() => document.getElementById('operator-date-input')?.showPicker()}
              />
            </div>
          </div>

          {!selectedTrip ? (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 mb-4">{t('উপলব্ধ ট্রিপসমূহ', 'Available Trips')}</h3>
              {filteredTrips.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-slate-500">{t('এই তারিখে কোনো ট্রিপ নেই।', 'No trips available on this date.')}</p>
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
                        className="bg-white p-4 rounded-xl border border-slate-200 hover:border-primary hover:shadow-md transition-all cursor-pointer flex justify-between items-center"
                      >
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg">{route?.name}</h4>
                          <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                            <span className="flex items-center gap-1"><Clock size={14} /> {format(new Date(trip.departureTime), 'hh:mm a')}</span>
                            <span className="flex items-center gap-1"><BusIcon size={14} /> {bus?.isAC ? 'AC' : 'Non-AC'} ({trip.coachNumber})</span>
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-primary/10 text-primary font-bold rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                          {t('নির্বাচন করুন', 'Select')}
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
                  <h3 className="font-bold text-slate-800">{routes.find(r => r.id === selectedTrip.routeId)?.name}</h3>
                  <p className="text-sm text-slate-500">{format(new Date(selectedTrip.departureTime), 'hh:mm a')} | Coach: {selectedTrip.coachNumber}</p>
                </div>
                <button 
                  onClick={() => setSelectedTrip(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  {t('পরিবর্তন করুন', 'Change')}
                </button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8">
                <SeatMap
                capacity={buses.find(b => b.id === selectedTrip.busId)?.capacity || 40}
                bookedSeats={bookings.flatMap(b => b.seats)}
                femaleBookedSeats={bookings.filter(b => b.gender === 'female').flatMap(b => b.seats)}
                selectedSeats={selectedSeats}
                lockedSeats={lockedSeats}
                onSeatClick={handleSeatClick}
                bookings={bookings}
                passengers={passengers}
                onReprint={(booking) => {
                  setBookingSuccess(booking);
                }}
              />

              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <User size={18} />
                    {t('যাত্রীর তথ্য', 'Passenger Info')}
                  </h3>
                  <div className="space-y-3">
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input
                        type="tel"
                        placeholder={t('মোবাইল নম্বর', 'Mobile Number')}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                        value={passengerData.phone}
                        onChange={e => handlePhoneChange(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder={t('নাম', 'Full Name')}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                        value={passengerData.name}
                        onChange={e => setPassengerData({ ...passengerData, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                        value={passengerData.gender}
                        onChange={e => setPassengerData({ ...passengerData, gender: e.target.value as 'male' | 'female' })}
                      >
                        <option value="male">{t('পুরুষ', 'Male')}</option>
                        <option value="female">{t('মহিলা', 'Female')}</option>
                      </select>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                          type="email"
                          placeholder={t('イমেইল', 'Email')}
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                          value={passengerData.email}
                          onChange={e => setPassengerData({ ...passengerData, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <MapPin size={18} />
                    {t('যাত্রা বিরতি', 'Stop Points')}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">{t('বোর্ডিং', 'Boarding')}</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        value={boardingPoint}
                        onChange={e => setBoardingPoint(e.target.value)}
                      >
                        <option value="">{t('বাছাই করুন', 'Select')}</option>
                        {selectedTrip.boardingPoints?.map(id => (
                          <option key={id} value={id}>{counters.find(c => c.id === id)?.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">{t('ড্রপিং', 'Dropping')}</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        value={droppingPoint}
                        onChange={e => setDroppingPoint(e.target.value)}
                      >
                        <option value="">{t('বাছাই করুন', 'Select')}</option>
                        {selectedTrip.droppingPoints?.filter(id => 
                          selectedCounter?.allowedDestinationCounters?.includes(id)
                        ).map(id => (
                          <option key={id} value={id}>{counters.find(c => c.id === id)?.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">{t('নির্বাচিত আসন', 'Selected Seats')}</span>
                    <span className="font-black text-primary tracking-wider">{selectedSeats.join(', ') || 'None'}</span>
                  </div>
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-bold">{t('মোট ভাড়া', 'Total Fare')}</span>
                    <span className="font-black text-primary">৳ {(selectedSeats.length * selectedTrip.fare).toLocaleString()}</span>
                  </div>
                  <button
                    disabled={isBooking || selectedSeats.length === 0}
                    onClick={handleBooking}
                    className="w-full btn-primary py-4 flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-primary/20"
                  >
                    <CreditCard size={20} />
                    {isBooking ? t('প্রক্রিয়াকরণ হচ্ছে...', 'Processing...') : t('টিকিট নিশ্চিত করুন', 'Confirm Booking')}
                  </button>
                </div>
              </div>
            </div>
            </div>
          )}
        </div>

        {bookingSuccess && (
          <div className="card-premium border-emerald-200 bg-emerald-50/30">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100">
                <QRCodeCanvas id="ticket-qrcode" value={bookingSuccess.id} size={120} />
              </div>
              <div className="flex-1 space-y-4 text-center md:text-left">
                <div>
                  <h3 className="text-2xl font-black text-emerald-800">{t('বুকিং সফল!', 'Booking Success!')}</h3>
                  <p className="text-emerald-600 font-bold">{t('টিকিট আইডি:', 'Ticket ID:')} {bookingSuccess.id}</p>
                </div>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <button onClick={printTicket} className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2">
                    <Printer size={18} />
                    {t('প্রিন্ট টিকিট', 'Print Ticket')}
                  </button>
                  <button onClick={() => setBookingSuccess(null)} className="px-6 py-2 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-all">
                    {t('নতুন বুকিং', 'New Booking')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Live Trips */}
      <div className="lg:col-span-4 space-y-6">
        {/* Incoming Trips Section */}
        <div className="card">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock className="text-primary" />
            {t('আগত বাসসমূহ', 'Incoming Buses')}
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
                  <div key={trip.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-slate-900">{route?.name}</p>
                        <p className="text-xs text-slate-500">{trip.coachNumber}</p>
                      </div>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase">
                        {trip.status}
                      </span>
                    </div>
                    <button
                      onClick={() => handleReceiveBus(trip.id)}
                      className="w-full mt-2 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <CheckCircle2 size={16} />
                      {t('রিসিভ করুন', 'Receive Bus')}
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
              <p className="text-center text-slate-400 py-4 text-sm italic">
                {t('কোন আগত বাস নেই', 'No incoming buses')}
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock className="text-primary" />
            {t('লাইভ ট্রিপ আপডেট', 'Live Trip Updates')}
          </h3>
          <div className="space-y-4">
            {trips.filter(t => t.status !== 'arrived').map(trip => {
              const route = routes.find(r => r.id === trip.routeId);
              const isDepartedFromHere = trip.stopLogs?.some(log => log.counterId === selectedCounter?.id);

              return (
                <div key={trip.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-slate-800">{route?.name}</h4>
                      <p className="text-xs text-slate-500">{format(new Date(trip.departureTime), 'hh:mm a, dd MMM')}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                      trip.status === 'departed' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {trip.status}
                    </span>
                  </div>
                  <button
                    disabled={!selectedCounter || isDepartedFromHere}
                    onClick={() => handleDeparted(trip.id)}
                    className="w-full py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:bg-slate-50"
                  >
                    {isDepartedFromHere ? t('ছেড়ে গেছে', 'Already Departed') : t('বাস ছেড়ে গেছে', 'Bus Departed')}
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
