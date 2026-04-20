import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, History, Loader2, Bus as BusIcon, Ticket, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

export const TrackPage: React.FC = () => {
  const navigate = useNavigate();
  const [coachNumber, setCoachNumber] = useState('');
  const [trackingData, setTrackingData] = useState(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('recentCoachSearches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const handleSearch = () => {
    if (!coachNumber.trim()) return;
    setLoading(true);

    // Save to recents
    const updated = [coachNumber, ...recentSearches.filter(s => s !== coachNumber)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentCoachSearches', JSON.stringify(updated));

    // Simulate search
    setTimeout(() => {
      setLoading(false);
      setTrackingData(null); // Will integrate real logic later
    }, 1500);
  };

  return (
    <div className="space-y-8 pb-20 pt-24 px-4 md:px-8 max-w-2xl mx-auto">
      {/* Search Header */}
      <section className="bg-primary p-8 md:p-10 rounded-[2.5rem] text-white shadow-xl shadow-primary/20">
        <h1 className="text-3xl font-black tracking-tighter mb-6">Live Bus Tracking</h1>
        <div className="flex gap-3 bg-white p-2 rounded-[1.8rem]">
          <input 
            type="text" 
            placeholder="Enter Coach Number (e.g. SL-101)"
            value={coachNumber}
            onChange={(e) => setCoachNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-6 py-4 rounded-2xl text-primary font-bold outline-none bg-transparent"
          />
          <button 
            onClick={handleSearch} 
            disabled={loading}
            className="px-8 bg-accent font-black rounded-2xl uppercase tracking-widest hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Search size={22} />}
          </button>
        </div>

        {/* New: Track by Ticket Link */}
        <button 
          onClick={() => navigate('/track-ticket')}
          className="mt-6 flex items-center gap-3 text-white/60 hover:text-white transition-colors group mx-auto"
        >
          <div className="bg-white/10 p-2 rounded-lg group-hover:bg-white/20 transition-colors">
            <Ticket size={18} />
          </div>
          <span className="text-sm font-bold tracking-tight">Have a ticket? Track by Ticket ID</span>
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </section>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Recent Searches</h3>
          <div className="flex gap-3 flex-wrap">
            {recentSearches.map(coach => (
              <button 
                key={coach}
                onClick={() => { setCoachNumber(coach); }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-slate-600 font-bold text-sm hover:bg-accent hover:text-white transition-all"
              >
                <History size={14} />
                {coach}
              </button>
            ))}
          </div>
        </div>
      )}
        
      {/* Results Section */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card-premium flex flex-col items-center gap-4 py-16"
          >
            <Loader2 className="animate-spin text-accent" size={32} />
            <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Fetching Location...</p>
          </motion.div>
        ) : trackingData ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className="card-premium"
          >                
            Track results here
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card-premium text-center flex flex-col items-center gap-6 py-16"
          >
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
              <BusIcon size={32} className="text-slate-300" />
            </div>
            <p className="font-bold text-slate-400 uppercase tracking-widest text-xs max-w-[200px]">Enter a coach number to view live tracking information</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
