import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { Booking, Passenger } from '../types';

interface SeatMapProps {
  capacity: number;
  bookedSeats: string[];
  femaleBookedSeats: string[];
  selectedSeats: string[];
  lockedSeats: string[];
  onSeatClick: (seat: string) => void;
  layout?: '2+2' | '1+2';
  bookings?: Booking[];
  passengers?: Passenger[];
  onReprint?: (booking: Booking) => void;
}

export const SeatMap: React.FC<SeatMapProps> = ({
  capacity,
  bookedSeats,
  femaleBookedSeats,
  selectedSeats,
  lockedSeats,
  onSeatClick,
  layout = '2+2',
  bookings = [],
  passengers = [],
  onReprint,
}) => {
  const is1Plus2 = layout === '1+2';
  const seatsPerRow = is1Plus2 ? 3 : 4;
  const rows = Math.ceil(capacity / seatsPerRow);

  const renderSeat = (row: number, seatIndex: number) => {
    const letters = is1Plus2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    const seatId = `${String.fromCharCode(64 + row)}${seatIndex + 1}`;
    const isBooked = bookedSeats.includes(seatId);
    const isFemaleBooked = femaleBookedSeats.includes(seatId);
    const isSelected = selectedSeats.includes(seatId);
    const isLocked = lockedSeats.includes(seatId);

    const booking = bookings.find(b => b.seats.includes(seatId));
    const passenger = booking ? passengers.find(p => p.id === booking.passengerId) : null;

    return (
      <div key={seatId} className="relative group/seat">
        <button
          disabled={isBooked || isLocked}
          onClick={() => onSeatClick(seatId)}
          className={cn(
            "w-10 h-10 rounded-md border-2 flex items-center justify-center text-xs font-bold transition-all",
            isBooked ? (isFemaleBooked ? "bg-female border-female text-white" : "bg-slate-400 border-slate-400 text-white") :
            isLocked ? "bg-slate-200 border-slate-200 text-slate-400 cursor-not-allowed" :
            isSelected ? "bg-accent border-accent text-white" :
            "bg-white border-slate-200 hover:border-accent text-slate-600"
          )}
        >
          {seatId}
        </button>
        
        {isBooked && booking && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 p-3 z-[100] opacity-0 invisible group-hover/seat:opacity-100 group-hover/seat:visible transition-all pointer-events-none group-hover/seat:pointer-events-auto">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Info</div>
            <div className="font-bold text-slate-800 text-xs truncate">{passenger?.name || 'Unknown'}</div>
            <div className="text-[10px] text-slate-500 font-mono mb-2">{booking.id}</div>
            {onReprint && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onReprint(booking);
                }}
                className="w-full py-1.5 bg-primary text-white text-[10px] font-bold rounded-lg hover:bg-blue-800 transition-colors"
              >
                Reprint Ticket
              </button>
            )}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 w-full mx-auto overflow-x-auto">
      <div className="flex justify-between items-center mb-8 px-2 min-w-[200px]">
        <div className="w-12 h-12 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
          Door
        </div>
        <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
          Driver
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
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-400 rounded" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-female rounded" />
          <span>Female Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-accent rounded" />
          <span>Selected</span>
        </div>
      </div>
    </div>
  );
};
