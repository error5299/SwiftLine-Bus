import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '../hooks/useLanguage';
import { Search, Info, Ticket, Navigation, Phone, User, LogOut, Menu, X, Shield, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { RealTimeClock } from './RealTimeClock';

import { useAuth } from '../context/FirebaseProvider';
import { cn } from '../lib/utils';

export const Header: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, isAuthReady } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Home', icon: Search },
    { path: '/about', label: 'Fleet', icon: Info },
    { path: '/track-journey', label: 'Journey Hub', icon: Navigation },
    { path: '/contact', label: 'Support', icon: Phone },
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  return (
    <header 
      className={cn(
        "sticky top-0 z-[60] transition-all duration-500",
        scrolled 
          ? "py-2" 
          : "py-6"
      )}
    >
      <div className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-500",
        scrolled ? "max-w-[98%]" : "max-w-7xl"
      )}>
        <div className={cn(
          "relative flex items-center justify-between px-8 h-20 transition-all duration-500 rounded-[2.5rem] border overflow-hidden",
          scrolled 
            ? "bg-white/95 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] border-white/50" 
            : "bg-white border-slate-100 shadow-sm"
        )}>
          {/* Brand Logo */}
          <Link 
            to="/"
            className="flex items-center gap-3 group relative z-10" 
          >
            <div className="relative w-12 h-12 flex items-center justify-center overflow-hidden">
               <img src="https://www.belayet.pro.bd/wp-content/uploads/2026/03/SwiftLine.png" alt="SwiftLine Logo" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="flex flex-col -space-y-0.5">
              <span className="text-2xl font-bold tracking-tighter text-primary">SwiftLine</span>
              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-accent">Premium Fleet</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-50 p-1.5 rounded-full border border-slate-100">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex items-center gap-2 px-5 py-3 rounded-full text-[11px] font-black transition-all uppercase tracking-[0.2em] group",
                  location.pathname === item.path 
                    ? 'bg-white text-accent shadow-sm' 
                    : 'text-slate-500 hover:text-primary'
                )}
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
               <span className="text-[10px] font-black text-slate-400">Time:</span>
               <RealTimeClock />
             </div>

            {user ? (
              <div className="flex items-center gap-2">
                <Link 
                  to="/profile"
                  className="flex items-center gap-2 p-1.5 pr-4 bg-primary text-white rounded-full hover:bg-accent transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black overflow-hidden border border-white/20">
                    {user.photoURL ? <img src={user.photoURL} alt="" /> : <User size={16} />}
                  </div>
                  <span className="text-xs font-black truncate max-w-[80px]">{user.displayName?.split(' ')?.[0] || 'User'}</span>
                </Link>
                <button onClick={() => signOut(auth).then(() => navigate('/'))} className="p-3 text-slate-400 hover:text-red-500 transition-colors">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link 
                to="/login"
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:bg-accent transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                <User size={14} />
                <span>Login</span>
              </Link>
            )}

            {/* Mobile Toggle */}
            <button 
              className="lg:hidden p-3 bg-slate-50 text-primary rounded-2xl border border-slate-100 active:scale-90 transition-transform"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
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
                      to={role === 'admin' ? '/admin' : role === 'operator' ? '/operator' : '/supervisor'}
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
