import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '../hooks/useLanguage';
import { Bus, Search, Info, Ticket, Navigation, Phone, User, LogOut, Menu, X, Shield, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { RealTimeClock } from './RealTimeClock';

export const Header: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else if (u.email) {
            // Check staff_emails as fallback
            const staffDoc = await getDoc(doc(db, 'staff_emails', u.email));
            if (staffDoc.exists()) {
              setRole(staffDoc.data().role);
            } else {
              const opDoc = await getDoc(doc(db, 'operators', u.uid));
              if (opDoc.exists()) setRole('operator');
              else {
                const supDoc = await getDoc(doc(db, 'supervisors', u.uid));
                if (supDoc.exists()) setRole('supervisor');
                else setRole('passenger');
              }
            }
          } else {
            setRole('passenger');
          }
        } catch (err) {
          console.error("Error fetching role in header:", err);
          setRole('passenger');
        }
      } else {
        setRole(null);
      }
    });
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      unsub();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Home', icon: Search },
    { path: '/about', label: 'About Us', icon: Info },
    { path: '/track-ticket', label: 'Track Ticket', icon: Ticket },
    { path: '/contact', label: 'Contact', icon: Phone },
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  return (
    <header className={`sticky top-0 z-50 transition-all duration-500 flex flex-col ${scrolled ? 'glass-hard shadow-lg' : 'bg-white/95 backdrop-blur-md border-b border-slate-100'}`}>
      <div className="h-20 flex items-center w-full">
        <div className="max-w-7xl mx-auto px-6 w-full flex justify-between items-center">
        {/* Brand Logo */}
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="flex items-center gap-2 cursor-pointer group" 
          >
            <div className="bg-primary p-2 rounded-xl group-hover:scale-110 transition-transform">
              <Bus className="text-white" size={24} />
            </div>
            <span className="text-2xl font-bold tracking-tighter text-primary">SwiftLine</span>
          </Link>
          
          <div className="hidden sm:block">
            <RealTimeClock />
          </div>
        </div>

        {/* Navigation Menu (Center) - Desktop */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                location.pathname === item.path 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-slate-500 hover:text-primary hover:bg-white/50'
              }`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Utility Actions (Right) */}
        <div className="flex items-center gap-4">
          <div className="sm:hidden">
            <RealTimeClock />
          </div>
          
          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <>
                {role && role !== 'passenger' && (
                  <Link 
                    to={role === 'admin' ? '/admin-portal' : role === 'operator' ? '/operator-panel' : '/supervisor-panel'}
                    className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-xl text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Shield size={18} />
                    <span className="hidden md:inline">Dashboard</span>
                  </Link>
                )}
                <Link 
                  to="/profile"
                  className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl text-sm font-bold text-primary hover:bg-slate-200 transition-colors"
                >
                  <User size={18} />
                  <span className="hidden md:inline">{user.displayName || 'My Profile'}</span>
                </Link>
                <button 
                  onClick={() => signOut(auth).then(() => navigate('/'))} 
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <Link 
                to="/login"
                className="btn-primary !py-2 !px-5 flex items-center gap-2 text-sm"
              >
                <User size={18} />
                <span>Login</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden p-2 text-primary hover:bg-slate-100 rounded-xl transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
    </div>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-slate-100 bg-white overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-end items-center mb-6">
                {user && (
                  <button 
                    onClick={() => signOut(auth).then(() => navigate('/'))} 
                    className="flex items-center gap-2 text-red-500 font-bold text-sm"
                  >
                    <LogOut size={18} />
                    <span>Logout</span>
                  </button>
                )}
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all ${
                      location.pathname === item.path 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              {!user && (
                <Link 
                  to="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full btn-primary mt-4 flex items-center justify-center gap-2"
                >
                  <User size={20} />
                  <span>Login</span>
                </Link>
              )}
              {user && (
                <div className="space-y-2">
                  {role && role !== 'passenger' && (
                    <Link 
                      to={role === 'admin' ? '/admin-portal' : role === 'operator' ? '/operator-panel' : '/supervisor-panel'}
                      onClick={() => setIsMenuOpen(false)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl text-base font-bold bg-primary/10 text-primary"
                    >
                      <Shield size={20} />
                      <span>Dashboard</span>
                    </Link>
                  )}
                  <Link 
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-base font-bold bg-slate-100 text-primary"
                  >
                    <User size={20} />
                    <span>{user.displayName || 'My Profile'}</span>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
