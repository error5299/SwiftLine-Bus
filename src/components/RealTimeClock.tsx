import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export const RealTimeClock: React.FC = () => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      // Time formatting
      const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      const timeString = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
      setTime(timeString);

      // Date formatting (e.g., 29 MAR)
      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Dhaka',
        day: '2-digit',
        month: 'short',
      };
      const dateString = new Intl.DateTimeFormat('en-US', dateOptions).format(now);
      setDate(dateString.toUpperCase());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 glass-hard rounded-full text-primary font-black text-[11px] tracking-widest uppercase shadow-sm border border-white/50">
      <div className="flex items-center gap-1.5 border-r border-slate-200/50 pr-3">
        <Clock size={12} className="text-accent animate-pulse" />
        <span className="font-num">{time}</span>
      </div>
      <span className="text-slate-500">{date}</span>
    </div>
  );
};
