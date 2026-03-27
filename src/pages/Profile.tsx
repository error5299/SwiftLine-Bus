import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Phone, History, Ticket, Download, LogOut, Shield, MapPin, Bus as BusIcon, ChevronRight } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Booking, Trip, Route, Passenger, Counter, Bus } from '../types';
import { format } from 'date-fns';
import { generateTicketPDF } from '../utils/ticketGenerator';
import { QRCodeCanvas } from 'qrcode.react';

export const Profile: React.FC = () => {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // Fetch passenger data based on email or phone
        const q = query(collection(db, 'passengers'), where('email', '==', currentUser.email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const pData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Passenger;
          setPassenger(pData);
          
          // Fetch bookings
          const bQuery = query(collection(db, 'bookings'), where('passengerId', '==', pData.id));
          const bSnapshot = await getDocs(bQuery);
          setBookings(bSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
        }
      }
      setLoading(false);
    });

    // Fetch trips and routes for booking details
    const unsubTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setTrips(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Trip)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snapshot) => {
      setRoutes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Route)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'routes'));
    const unsubCounters = onSnapshot(collection(db, 'counters'), (snapshot) => {
      setCounters(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Counter)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'counters'));
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      setBuses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bus)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));

    return () => {
      unsubscribe();
      unsubTrips();
      unsubRoutes();
      unsubCounters();
      unsubBuses();
    };
  }, []);

  const downloadETicket = (booking: Booking) => {
    const trip = trips.find(t => t.id === booking.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const boarding = counters.find(c => c.id === booking.boardingStopId);
    const dropping = counters.find(c => c.id === booking.droppingStopId);
    const bus = buses.find(b => b.id === trip?.busId);
    
    generateTicketPDF(
      booking,
      trip,
      route,
      boarding,
      dropping,
      bus,
      passenger || undefined,
      `ticket-qrcode-${booking.id}`
    );
  };

  if (loading) return <div className="py-20 text-center">Loading...</div>;

  if (!user) return (
    <div className="py-20 text-center space-y-6">
      <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
        <Shield className="text-slate-300" size={48} />
      </div>
      <h3 className="text-2xl font-black text-primary">Please Login</h3>
      <p className="text-slate-500">Login to view your profile and manage tickets.</p>
    </div>
  );

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="relative py-20 px-8 rounded-[2.5rem] overflow-hidden bg-primary text-white">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/profile/1920/1080" alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative flex flex-col md:flex-row items-center gap-8 max-w-4xl mx-auto">
          <div className="w-32 h-32 rounded-full border-4 border-white/20 overflow-hidden shadow-2xl">
            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-4xl font-black tracking-tighter">{user.displayName}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-white/70 font-medium">
              <span className="flex items-center gap-2"><Mail size={16} /> {user.email}</span>
              {passenger?.phone && <span className="flex items-center gap-2"><Phone size={16} /> {passenger.phone}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Stats */}
        <div className="lg:col-span-1 space-y-8">
          <div className="card-premium space-y-8">
            <h3 className="text-xl font-black text-primary">At a Glance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-primary">{bookings.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Bookings</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-accent">{bookings.filter(b => b.status === 'confirmed').length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Successful</p>
              </div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <button className="w-full py-4 px-6 bg-slate-50 text-primary font-bold rounded-xl flex items-center justify-between hover:bg-slate-100 transition-all">
                <div className="flex items-center gap-3">
                  <User size={18} className="text-accent" />
                  Edit Profile
                </div>
                <ChevronRight size={16} />
              </button>
              <button 
                onClick={() => auth.signOut()}
                className="w-full py-4 px-6 bg-red-50 text-red-600 font-bold rounded-xl flex items-center justify-between hover:bg-red-100 transition-all"
              >
                <div className="flex items-center gap-3">
                  <LogOut size={18} />
                  Logout
                </div>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Booking History */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-primary flex items-center gap-3">
              <History className="text-accent" />
              Booking History
            </h3>
          </div>

          <div className="space-y-6">
            {bookings.length > 0 ? (
              bookings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(booking => {
                const trip = trips.find(t => t.id === booking.tripId);
                const route = routes.find(r => r.id === trip?.routeId);
                
                return (
                  <motion.div 
                    key={booking.id}
                    layout
                    className="card-premium group hover:border-accent/30 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl group-hover:bg-accent/5 transition-colors">
                          <BusIcon className="text-primary group-hover:text-accent transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-primary">{route?.name || 'Unknown Route'}</h4>
                          <div className="flex items-center gap-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
                            <span>{trip ? format(new Date(trip.departureTime), 'dd MMM, yyyy') : 'N/A'}</span>
                            <span>•</span>
                            <span>{booking.seats.length} Seats</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:flex-col md:items-end gap-4 border-t md:border-t-0 pt-4 md:pt-0">
                        <div className="text-left md:text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Fare</p>
                          <p className="text-xl font-black text-primary">৳ {booking.totalFare}</p>
                        </div>
                        <button 
                          onClick={() => downloadETicket(booking)}
                          className="p-3 bg-slate-50 text-accent rounded-xl hover:bg-accent hover:text-white transition-all shadow-sm"
                          title="Download Ticket"
                        >
                          <Download size={20} />
                        </button>
                        {/* Hidden QR Code for PDF generation */}
                        <div className="hidden">
                          <QRCodeCanvas id={`ticket-qrcode-${booking.id}`} value={booking.id} size={200} level="H" includeMargin />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="card-premium py-20 text-center space-y-4">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                  <Ticket size={32} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-400">No Bookings Found</h3>
                <p className="text-slate-400 text-sm">You haven't booked any tickets yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
