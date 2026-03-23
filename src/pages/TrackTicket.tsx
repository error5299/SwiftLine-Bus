import React, { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Ticket, Phone, Navigation, Download, Clock, MapPin, Bus as BusIcon, CheckCircle2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Booking, Trip, Route, Counter, Passenger, Bus } from '../types';
import { format } from 'date-fns';
import { generateTicketPDF } from '../utils/ticketGenerator';
import { QRCodeCanvas } from 'qrcode.react';

export const TrackTicket: React.FC = () => {
  const { t } = useLanguage();
  const [ticketId, setTicketId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBooking(null);

    try {
      const bookingRef = doc(db, 'bookings', ticketId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        const bookingData = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
        
        // Verify phone number
        const passengerRef = doc(db, 'passengers', bookingData.passengerId);
        const passengerSnap = await getDoc(passengerRef);
        
        if (passengerSnap.exists() && passengerSnap.data().phone === phone) {
          setBooking(bookingData);
          setPassenger({ id: passengerSnap.id, ...passengerSnap.data() } as Passenger);
          
          // Fetch trip and route
          const tripRef = doc(db, 'trips', bookingData.tripId);
          const tripSnap = await getDoc(tripRef);
          if (tripSnap.exists()) {
            const tripData = { id: tripSnap.id, ...tripSnap.data() } as Trip;
            setTrip(tripData);
            
            const routeRef = doc(db, 'routes', tripData.routeId);
            const routeSnap = await getDoc(routeRef);
            if (routeSnap.exists()) {
              setRoute({ id: routeSnap.id, ...routeSnap.data() } as Route);
            }

            const busRef = doc(db, 'buses', tripData.busId);
            const busSnap = await getDoc(busRef);
            if (busSnap.exists()) {
              setBus({ id: busSnap.id, ...busSnap.data() } as Bus);
            }
          }

          // Fetch counters for tracking
          const countersSnap = await getDocs(collection(db, 'counters'));
          setCounters(countersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Counter)));
        } else {
          setError(t('টিকিট আইডি বা ফোন নম্বর ভুল।', 'Invalid Ticket ID or Phone Number.'));
        }
      } else {
        setError(t('টিকিট পাওয়া যায়নি।', 'Ticket not found.'));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'bookings');
      setError(t('সার্ভার ত্রুটি। আবার চেষ্টা করুন।', 'Server error. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const downloadETicket = () => {
    if (!booking) return;
    const boarding = counters.find(c => c.id === booking.boardingStopId);
    const dropping = counters.find(c => c.id === booking.droppingStopId);

    generateTicketPDF(
      booking,
      trip || undefined,
      route || undefined,
      boarding,
      dropping,
      bus || undefined,
      passenger || undefined,
      'ticket-qrcode'
    );
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Hero */}
      <section className="relative py-20 px-8 rounded-[2.5rem] overflow-hidden bg-primary text-center">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/track/1920/1080" alt="Track" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative max-w-4xl mx-auto space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl font-black tracking-tighter text-white"
          >
            {t('আপনার টিকিট ট্র্যাক করুন', 'Track Your Ticket')}
          </motion.h1>
          <p className="text-white/70 text-lg font-medium">
            {t('টিকিট আইডি এবং ফোন নম্বর দিয়ে আপনার বুকিং ডিটেইলস এবং বাসের অবস্থান দেখুন।', 'Check your booking details and bus location with Ticket ID and Phone Number.')}
          </p>
        </div>
      </section>

      <div className="max-w-xl mx-auto">
        <div className="card-premium">
          <form onSubmit={handleTrack} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('টিকিট আইডি', 'Ticket ID')}</label>
              <div className="relative group">
                <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <input 
                  required
                  type="text" 
                  placeholder="SL-XXXXXX"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                  value={ticketId}
                  onChange={e => setTicketId(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('ফোন নম্বর', 'Phone Number')}</label>
              <div className="relative group">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <input 
                  required
                  type="tel" 
                  placeholder="01XXXXXXXXX"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

            <button 
              type="submit" 
              disabled={loading}
              className="btn-primary !py-5 w-full rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-50"
            >
              {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search size={20} />}
              <span className="text-lg">{t('ট্র্যাক করুন', 'Track Ticket')}</span>
            </button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {booking && trip && route && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="grid md:grid-cols-3 gap-8">
              {/* Ticket Summary */}
              <div className="md:col-span-1 card-premium space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-primary">{t('টিকিট ডিটেইলস', 'Ticket Details')}</h3>
                  <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {booking.status}
                  </span>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t('টিকিট আইডি', 'Ticket ID')}</span>
                    <span className="text-primary font-bold font-num">{booking.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t('আসন', 'Seats')}</span>
                    <span className="text-primary font-bold font-num">{booking.seats.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t('ভাড়া', 'Fare')}</span>
                    <span className="text-primary font-bold font-num">৳ {booking.totalFare}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t('তারিখ', 'Date')}</span>
                    <span className="text-primary font-bold font-num">{format(new Date(trip.departureTime), 'dd MMM, yyyy')}</span>
                  </div>
                </div>

                <button 
                  onClick={downloadETicket}
                  className="w-full py-4 bg-slate-50 text-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all"
                >
                  <Download size={18} />
                  {t('টিকিট ডাউনলোড', 'Download Ticket')}
                </button>
                {/* Hidden QR Code for PDF generation */}
                <div className="hidden">
                  <QRCodeCanvas id="ticket-qrcode" value={booking.id} size={200} level="H" includeMargin />
                </div>
              </div>

              {/* Live Tracking */}
              <div className="md:col-span-2 card-premium space-y-8">
                <h3 className="text-xl font-black text-primary flex items-center gap-3">
                  <Navigation className="text-accent animate-pulse" />
                  {t('লাইভ বাস ট্র্যাকিং', 'Live Bus Tracking')}
                </h3>

                <div className="relative py-12">
                  <div className="absolute top-1/2 left-0 w-full h-2 bg-slate-100 -translate-y-1/2 rounded-full" />
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
                                <span className="font-num">{format(new Date(log.timestamp), 'hh:mm a')}</span>
                              </span>
                            ) : isCurrent ? (
                              <span className="text-[10px] text-accent font-bold animate-pulse">
                                {t('বর্তমান', 'Current')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-8 p-6 bg-slate-50 rounded-2xl flex items-center justify-between">
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
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
