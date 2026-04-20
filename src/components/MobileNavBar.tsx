import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Ticket, MapPin, User, Compass } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export const MobileNavBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path || (path === '/passenger' && (currentPath === '/' || currentPath === '/passenger'));

  const navItems = [
    { name: 'Search', path: '/passenger', icon: Search },
    { name: 'Tracker', path: '/track-journey', icon: Compass },
    { name: 'Tickets', path: '/tickets', icon: Ticket },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-5 left-4 right-4 bg-white/95 backdrop-blur-2xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 rounded-3xl p-2">
      <div className="flex items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button 
              key={item.path} 
              onClick={() => navigate(item.path)} 
              className="flex flex-col items-center gap-1 w-16 py-2 relative"
            >
              {active && (
                <motion.div 
                  layoutId="nav-pill" 
                  className="absolute -top-[13px] w-8 h-1 rounded-full bg-accent" 
                />
              )}
              <div className={cn(
                "p-2.5 rounded-2xl transition-all duration-300", 
                active ? "bg-accent/10 text-accent" : "text-slate-400 group-hover:text-slate-600"
              )}>
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-widest", 
                active ? "text-accent" : "text-slate-400"
              )}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
