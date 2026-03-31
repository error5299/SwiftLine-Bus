import React, { useState } from 'react';
import { Counter, RouteStop } from '../types';
import { Plus, Trash2, ArrowDown, MapPin, Clock, Ruler } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface RouteMapperProps {
  counters: Counter[];
  stops?: RouteStop[];
  onChange: (stops: RouteStop[]) => void;
}

export const RouteMapper: React.FC<RouteMapperProps> = ({ counters, stops = [], onChange }) => {
  const { t } = useLanguage();

  const addStop = () => {
    const newStops = [...stops, { counterId: '', distance: 0, travelTime: 0 }];
    onChange(newStops);
  };

  const removeStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    onChange(newStops);
  };

  const updateStop = (index: number, field: keyof RouteStop, value: any) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], [field]: value };
    onChange(newStops);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{t('রুট ম্যাপ', 'Route Map')}</h4>
        <button
          type="button"
          onClick={addStop}
          className="flex items-center gap-1 text-xs font-bold text-primary hover:text-blue-700 transition-colors"
        >
          <Plus size={14} />
          {t('স্টপ যোগ করুন', 'Add Stop')}
        </button>
      </div>

      <div className="space-y-4 relative before:absolute before:left-[19px] before:top-8 before:bottom-8 before:w-0.5 before:bg-slate-100">
        {stops.map((stop, index) => (
          <div key={index} className="relative flex items-start gap-4 animate-in slide-in-from-left-2 duration-300">
            <div className="z-10 mt-2 bg-white border-2 border-primary w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-primary shadow-sm">
              {index + 1}
            </div>
            
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-primary/20 transition-all">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <MapPin size={10} />
                  {t('কাউন্টার', 'Counter')}
                </label>
                <select
                  value={stop.counterId}
                  onChange={(e) => updateStop(index, 'counterId', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">{t('বাছাই করুন', 'Select')}</option>
                  {counters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Ruler size={10} />
                  {t('দূরত্ব (কি.মি.)', 'Distance (km)')}
                </label>
                <input
                  type="number"
                  value={stop.distance}
                  onChange={(e) => updateStop(index, 'distance', Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0"
                  min="0"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock size={10} />
                  {t('সময় (মিনিট)', 'Time (min)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={stop.travelTime}
                    onChange={(e) => updateStop(index, 'travelTime', Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    placeholder="0"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={() => removeStop(index)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {stops.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-sm text-slate-400">{t('কোনো স্টপ যোগ করা হয়নি', 'No stops added yet')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
