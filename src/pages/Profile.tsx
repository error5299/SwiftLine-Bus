import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Phone, History as HistoryIcon, Ticket, Download, LogOut, Shield, MapPin, Bus as BusIcon, ChevronRight, Printer, XCircle, Info, Calendar, Clock, CreditCard, Edit2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Booking, Trip, Route, Passenger, Counter, Bus } from '../types';
import { format, isAfter, subHours } from 'date-fns';
import { generateTicketPDF, printTicketHTML } from '../utils/ticketGenerator';

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
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '', address: '' });

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

  const printETicket = (booking: Booking) => {
    const trip = trips.find(t => t.id === booking.tripId);
    const route = routes.find(r => r.id === trip?.routeId);
    const boarding = counters.find(c => c.id === booking.boardingStopId);
    const dropping = counters.find(c => c.id === booking.droppingStopId);
    const bus = buses.find(b => b.id === trip?.busId);
    
    printTicketHTML(
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

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    setCancelling(true);
    try {
      // 1. Update booking status to cancelled
      await updateDoc(doc(db, 'bookings', selectedBooking.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      });

      // 2. Add notification for admin
      await addDoc(collection(db, 'notifications'), {
        type: 'cancellation',
        message: `Booking ${selectedBooking.id} cancelled by passenger ${user.displayName}`,
        senderId: user.uid,
        senderName: user.displayName,
        read: false,
        timestamp: serverTimestamp()
      });

      // 3. Log security event
      await addDoc(collection(db, 'securityLogs'), {
        type: 'booking_cancelled',
        message: `Passenger cancelled booking ${selectedBooking.id}`,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        ip: 'User Action'
      });

      setShowCancelModal(false);
      setSelectedBooking(null);
      // Refresh bookings
      const bQuery = query(collection(db, 'bookings'), where('passengerId', '==', passenger?.id));
      const bSnapshot = await getDocs(bQuery);
      setBookings(bSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    } catch (error) {
      console.error("Cancellation error:", error);
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!passenger) return;
    try {
      await updateDoc(doc(db, 'passengers', passenger.id), {
        name: editData.name,
        phone: editData.phone,
        address: editData.address
      });
      setPassenger(prev => prev ? { ...prev, ...editData } : null);
      setShowEditProfile(false);
    } catch (error) {
      console.error("Profile update error:", error);
    }
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
        {/* Stats & Profile Details */}
        <div className="lg:col-span-1 space-y-8">
          <div className="card-premium space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-primary">Profile Details</h3>
              <button 
                onClick={() => {
                  setEditData({ name: passenger?.name || user.displayName, phone: passenger?.phone || '', address: passenger?.address || '' });
                  setShowEditProfile(true);
                }}
                className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
              >
                <Edit2 size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</p>
                <p className="text-sm font-bold text-slate-800">{passenger?.name || user.displayName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</p>
                <p className="text-sm font-bold text-slate-800">{user.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone Number</p>
                <p className="text-sm font-bold text-slate-800">{passenger?.phone || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Address</p>
                <p className="text-sm font-bold text-slate-800">{passenger?.address || 'Not provided'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
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

          {/* Profile Edit Modal */}
          <AnimatePresence>
            {showEditProfile && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6"
                >
                  <h3 className="text-2xl font-black text-primary">Edit Profile</h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Full Name</label>
                      <input 
                        type="text" 
                        value={editData.name}
                        onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Phone Number</label>
                      <input 
                        type="text" 
                        value={editData.phone}
                        onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Address</label>
                      <textarea 
                        value={editData.address}
                        onChange={(e) => setEditData(prev => ({ ...prev, address: e.target.value }))}
                        className="input-field min-h-[100px]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setShowEditProfile(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-xs rounded-2xl">Cancel</button>
                    <button onClick={handleUpdateProfile} className="flex-1 py-4 bg-accent text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-accent/20">Save Changes</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Booking History */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-primary flex items-center gap-3">
              <HistoryIcon className="text-accent" />
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
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setSelectedBooking(booking)}
                            className="p-3 bg-slate-50 text-primary rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm"
                            title="View Details"
                          >
                            <Info size={20} />
                          </button>
                          <button 
                            onClick={() => printETicket(booking)}
                            className="p-3 bg-slate-50 text-accent rounded-xl hover:bg-accent hover:text-white transition-all shadow-sm"
                            title="Print Ticket"
                          >
                            <Printer size={20} />
                          </button>
                          <button 
                            onClick={() => downloadETicket(booking)}
                            className="p-3 bg-slate-50 text-accent rounded-xl hover:bg-accent hover:text-white transition-all shadow-sm"
                            title="Download Ticket"
                          >
                            <Download size={20} />
                          </button>
                          {booking.status === 'confirmed' && trip && isAfter(new Date(trip.departureTime), subHours(new Date(), 12)) && (
                            <button 
                              onClick={() => { setSelectedBooking(booking); setShowCancelModal(true); }}
                              className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              title="Cancel Booking"
                            >
                              <XCircle size={20} />
                            </button>
                          )}
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

      {/* Booking Details Modal */}
      <AnimatePresence>
        {selectedBooking && !showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="bg-primary p-8 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black tracking-tighter">Ticket Details</h3>
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">Booking ID: {selectedBooking.id}</p>
                </div>
                <button onClick={() => setSelectedBooking(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                {(() => {
                  const trip = trips.find(t => t.id === selectedBooking.tripId);
                  const route = routes.find(r => r.id === trip?.routeId);
                  const bus = buses.find(b => b.id === trip?.busId);
                  const boarding = counters.find(c => c.id === selectedBooking.boardingStopId);
                  const dropping = counters.find(c => c.id === selectedBooking.droppingStopId);

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><MapPin size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Route</p>
                              <p className="text-sm font-bold text-slate-800">{route?.name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><Calendar size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</p>
                              <p className="text-sm font-bold text-slate-800">{trip ? format(new Date(trip.departureTime), 'dd MMM, yyyy') : 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><Clock size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Time</p>
                              <p className="text-sm font-bold text-slate-800">{trip ? format(new Date(trip.departureTime), 'hh:mm a') : 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><BusIcon size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bus</p>
                              <p className="text-sm font-bold text-slate-800">{bus?.regNo} ({bus?.type})</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><Ticket size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seats</p>
                              <p className="text-sm font-bold text-slate-800">{selectedBooking.seats.join(', ')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg text-accent"><CreditCard size={16} /></div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fare</p>
                              <p className="text-sm font-bold text-slate-800">৳ {selectedBooking.totalFare}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-slate-50 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="text-center flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Boarding</p>
                            <p className="text-sm font-bold text-slate-800">{boarding?.name}</p>
                          </div>
                          <div className="w-12 h-[1px] bg-slate-200" />
                          <div className="text-center flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dropping</p>
                            <p className="text-sm font-bold text-slate-800">{dropping?.name}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button onClick={() => printETicket(selectedBooking)} className="flex-1 py-4 bg-slate-100 text-primary font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2">
                          <Printer size={16} /> Print
                        </button>
                        <button onClick={() => downloadETicket(selectedBooking)} className="flex-1 py-4 bg-slate-100 text-primary font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2">
                          <Download size={16} /> Download
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancellation Modal */}
      <AnimatePresence>
        {showCancelModal && selectedBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <XCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-primary">Cancel Booking?</h3>
                <p className="text-slate-500 text-sm">Are you sure you want to cancel this booking? This action cannot be undone.</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => { setShowCancelModal(false); setSelectedBooking(null); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-xs rounded-2xl"
                >
                  No, Keep it
                </button>
                <button 
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="flex-1 py-4 bg-red-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {cancelling ? 'Processing...' : 'Yes, Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
