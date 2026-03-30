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
            "w-10 h-10 rounded-md border-2 flex items-center justify-center text-xs font-bold transition-all",
            isSold ? (isFemaleSold ? "bg-pink-600 border-pink-600 text-white" : "bg-slate-600 border-slate-600 text-white") :
            isBooked ? (isFemaleBooked ? "bg-pink-400 border-pink-400 text-white" : "bg-slate-400 border-slate-400 text-white") :
            isLocked ? "bg-slate-200 border-slate-200 text-slate-400 cursor-not-allowed" :
            isSelected ? "bg-accent border-accent text-white" :
            "bg-white border-slate-200 hover:border-accent text-slate-600"
          )}
        >
          {seatId}
        </button>
        
        {(isBooked || isSold) && booking && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 p-4 z-[100] opacity-0 invisible group-hover/seat:opacity-100 group-hover/seat:visible transition-all duration-300 pointer-events-none group-hover/seat:pointer-events-auto transform translate-y-2 group-hover/seat:translate-y-0">
            <div className="flex justify-between items-start mb-3">
              <div className="space-y-0.5">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('টিকিট তথ্য', 'Ticket Info')}</div>
                <div className="font-black text-primary text-sm truncate max-w-[120px]">{passenger?.name || t('অজানা', 'Unknown')}</div>
              </div>
              <div className={cn(
                "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
                isSold ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
              )}>
                {isSold ? 'Sold' : 'Booked'}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-slate-400 uppercase">ID:</span>
                <span className="text-slate-700 font-mono">{booking.id.slice(-8)}</span>
              </div>
              {isOperator && booking.bookedByCounterId && (
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-400 uppercase">Counter:</span>
                  <span className="text-slate-700">{booking.bookedByCounterId === 'online' ? 'Online' : (counters.find(c => c.id === booking.bookedByCounterId)?.name || 'Unknown')}</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-slate-400 uppercase">Gender:</span>
                <span className={cn("font-black", passenger?.gender === 'female' ? "text-female" : "text-blue-600")}>
                  {passenger?.gender?.toUpperCase() || 'MALE'}
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
                  className="flex-1 py-2 bg-slate-50 text-slate-600 text-[10px] font-black rounded-xl hover:bg-slate-100 transition-all border border-slate-100 uppercase tracking-widest"
                >
                  {t('বিস্তারিত', 'Details')}
                </button>
              )}
              {onReprint && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprint(booking);
                  }}
                  className="flex-1 py-2 bg-accent text-white text-[10px] font-black rounded-xl hover:bg-accent/90 transition-all shadow-lg shadow-accent/20 uppercase tracking-widest"
                >
                  {t('প্রিন্ট', 'Print')}
                </button>
              )}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pt-32 p-6 bg-slate-50 rounded-2xl border border-slate-200 w-full mx-auto overflow-visible">
      <div className="flex justify-between items-center mb-8 px-2 min-w-[200px]">
        <div className="w-12 h-12 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
          {t('দরজা', 'Door')}
        </div>
        <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
          {t('ড্রাইভার', 'Driver')}
        </div>
      </div>

      <div className="grid gap-4 min-w-[200px]">
        {Array.from({ length: rows }).map((_, rowIndex) => {
          const rowNum = rowIndex + 1;
          return (
            <div key={rowNum} className="flex gap-4 items-center">
              <div className="flex gap-2">
                {renderSeat(rowNum, 0)}
                {!is1Plus2 && renderSeat(rowNum, 1)}
              </div>
              <div className="w-8" /> {/* Aisle */}
              <div className="flex gap-2">
                {renderSeat(rowNum, is1Plus2 ? 1 : 2)}
                {renderSeat(rowNum, is1Plus2 ? 2 : 3)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 text-xs font-medium">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border-2 border-slate-200 rounded" />
          <span>{t('ফাঁকা', 'Available')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-accent rounded" />
          <span>{t('নির্বাচিত', 'Selected')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-200 rounded" />
          <span>{t('ব্লকড', 'Blocked')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-400 rounded" />
          <span>Booked (M)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-pink-400 rounded" />
          <span>Booked (F)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-600 rounded" />
          <span>Sold (M)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-pink-600 rounded" />
          <span>Sold (F)</span>
        </div>
      </div>
    </div>
  );
};
