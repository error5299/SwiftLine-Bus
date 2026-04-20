import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../hooks/useLanguage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { Booking, Passenger, Counter } from '../types';

interface SeatMapProps {
  capacity: number;
  bookedSeats: string[];
  femaleBookedSeats: string[];
  soldSeats?: string[];
  femaleSoldSeats?: string[];
  selectedSeats: string[];
  lockedSeats: string[];
  onSeatClick: (seat: string) => void;
  layout?: '2+2' | '1+2';
  bookings?: Booking[];
  passengers?: Passenger[];
  counters?: Counter[];
  onReprint?: (booking: Booking) => void;
  onDetails?: (booking: Booking) => void;
  isOperator?: boolean;
}

export const SeatMap: React.FC<SeatMapProps> = ({
  capacity,
  bookedSeats,
  femaleBookedSeats,
  soldSeats = [],
  femaleSoldSeats = [],
  selectedSeats,
  lockedSeats,
  onSeatClick,
  layout = '2+2',
  bookings = [],
  passengers = [],
  counters = [],
  onReprint,
  onDetails,
  isOperator = false,
}) => {
  const { t } = useLanguage();
  const is1Plus2 = layout === '1+2';
  const seatsPerRow = is1Plus2 ? 3 : 4;
  const rows = Math.ceil(capacity / seatsPerRow);

  const renderSeat = (row: number, seatIndex: number) => {
    const letters = is1Plus2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    const seatId = `${String.fromCharCode(64 + row)}${seatIndex + 1}`;
    const isBooked = bookedSeats.includes(seatId);
    const isFemaleBooked = femaleBookedSeats.includes(seatId);
    const isSold = soldSeats.includes(seatId);
    const isFemaleSold = femaleSoldSeats.includes(seatId);
    const isSelected = selectedSeats.includes(seatId);
    const isLocked = lockedSeats.includes(seatId);

    const booking = bookings.find(b => b.seats.includes(seatId));
    const passenger = booking ? passengers.find(p => p.id === booking.passengerId) : null;

    const isDisabled = isOperator ? (isSold || isLocked) : (isBooked || isSold || isLocked);

    return (
      <div key={seatId} className="relative group/seat">
        <button
          disabled={isDisabled}
          onClick={() => onSeatClick(seatId)}
          className={cn(
            "w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-black transition-all relative overflow-hidden",
            isSold ? (isFemaleSold ? "bg-female border-female text-white" : "bg-slate-700 border-slate-700 text-white") :
            isBooked ? (isFemaleBooked ? "bg-female/40 border-female/40 text-female-600" : "bg-slate-400 border-slate-400 text-white") :
            isLocked ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed" :
            isSelected ? "bg-accent border-accent text-white shadow-lg shadow-accent/20" :
            "bg-white border-slate-200 hover:border-accent hover:text-accent text-slate-500"
          )}
        >
          <span className="text-[10px] uppercase tracking-tighter opacity-70 mb-0.5">{seatId.charAt(0)}</span>
          <span className="text-xs leading-none">{seatId.substring(1)}</span>
          
          {/* Subtle indicator for female seats */}
          {(isFemaleBooked || isFemaleSold) && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full" />
          )}
        </button>
        
        {(isBooked || isSold) && booking && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 bg-white rounded-[1.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.2)] border border-slate-100 p-4 z-[100] opacity-0 invisible group-hover/seat:opacity-100 group-hover/seat:visible transition-all duration-500 pointer-events-none group-hover/seat:pointer-events-auto transform translate-y-4 group-hover/seat:translate-y-0 backdrop-blur-xl">
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-r border-b border-slate-100" />
             
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('টিকিট বিস্তারিত', 'Booking Detail')}</div>
                <div className="font-black text-primary text-sm truncate max-w-[140px]">{passenger?.name || t('অজানা', 'Unknown')}</div>
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                isSold ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
              )}>
                {isSold ? 'Confirmed' : 'Reserved'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase block tracking-widest">PNR ID</span>
                <span className="text-xs text-slate-700 font-mono font-bold">{booking.id}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase block tracking-widest">Gender</span>
                <span className={cn("text-xs font-black uppercase", passenger?.gender === 'female' ? "text-female" : "text-blue-600")}>
                  {passenger?.gender || 'MALE'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {onDetails && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetails(booking);
                  }}
                  className="flex-1 py-2.5 bg-slate-50 text-slate-600 text-[10px] font-black rounded-xl hover:bg-slate-100 transition-all border border-slate-100 uppercase tracking-widest"
                >
                  {t('ভিউ', 'View')}
                </button>
              )}
              {onReprint && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprint(booking);
                  }}
                  className="flex-1 py-2.5 bg-accent text-white text-[10px] font-black rounded-xl hover:bg-accent/90 transition-all shadow-xl shadow-accent/20 uppercase tracking-widest"
                >
                  {t('প্রিন্ট', 'Print')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pt-24 p-6 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 w-full mx-auto overflow-visible relative">
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center px-4">
        <div className="px-5 py-2 bg-slate-100/50 border border-slate-200 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          {t('প্রবেশ পথ', 'Entry Way')}
        </div>
        <div className="px-5 py-2 bg-slate-700 border border-slate-800 rounded-full text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-lg shadow-slate-900/10">
          {t('ড্রাইভার ককপিট', 'Pilot Cockpit')}
        </div>
      </div>

      <div className="grid gap-4 mt-16">
        {Array.from({ length: rows }).map((_, rowIndex) => {
          const rowNum = rowIndex + 1;
          return (
            <div key={rowNum} className="flex gap-4 items-center justify-center">
              <div className="flex gap-2.5">
                {renderSeat(rowNum, 0)}
                {!is1Plus2 && renderSeat(rowNum, 1)}
              </div>
              <div className="w-12 h-12 flex items-center justify-center opacity-10">
                <div className="w-px h-full bg-slate-900" />
              </div>
              <div className="flex gap-2.5">
                {renderSeat(rowNum, is1Plus2 ? 1 : 2)}
                {renderSeat(rowNum, is1Plus2 ? 2 : 3)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 px-2">
        {[
          { color: "bg-white border-slate-200", label: "Empty" },
          { color: "bg-accent", label: "Selected" },
          { color: "bg-slate-700", label: "Sold (M)" },
          { color: "bg-female", label: "Sold (F)" },
          { color: "bg-slate-400", label: "Res." },
          { color: "bg-female/40", label: "Res. (F)" },
        ].map(legend => (
          <div key={legend.label} className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-md border", legend.color)} />
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none">{legend.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
