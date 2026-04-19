import { format, isValid } from 'date-fns';

export const safeFormat = (date: string | number | Date | undefined | null, formatStr: string) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (!isValid(d)) return 'Invalid Date';
  return format(d, formatStr);
};

export const safeGetTime = (date: string | number | Date | undefined | null) => {
  if (!date) return 0;
  const d = new Date(date);
  if (!isValid(d)) return 0;
  return d.getTime();
};

export const formatTimeString = (timeStr: string | undefined | null) => {
  if (!timeStr) return '--:--';
  if (typeof timeStr !== 'string') timeStr = String(timeStr);
  if (timeStr.includes('T')) return safeFormat(timeStr, 'hh:mm a'); // Handle ISO as well
  
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return '--:--';
  
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return format(d, 'hh:mm a');
};

export const subtractMinutes = (timeStr: string, minutesToSub: number) => {
  if (!timeStr) return '';
  let hours, minutes;
  if (timeStr.includes(':')) {
    [hours, minutes] = timeStr.split(':').map(Number);
  } else {
    return timeStr;
  }
  
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  d.setMinutes(d.getMinutes() - minutesToSub);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const calculateStopTime = (tripDepartureTime: string | undefined | null, route: any, counterId: string) => {
  if (!tripDepartureTime || !route || !route.stops) return tripDepartureTime;
  const tripDate = new Date(tripDepartureTime);
  if (!isValid(tripDate)) return null;

  const stop = route.stops.find((s: any) => (typeof s === 'string' ? s : s.counterId) === counterId);
  if (!stop || typeof stop === 'string' || !stop.travelTime) return tripDepartureTime;

  const travelTimeStr = String(stop.travelTime);
  if (!travelTimeStr.includes(':')) return tripDepartureTime;

  const [hours, minutes] = travelTimeStr.split(':').map(Number);
  if (!isNaN(hours)) tripDate.setHours(tripDate.getHours() + hours);
  if (!isNaN(minutes)) tripDate.setMinutes(tripDate.getMinutes() + minutes);

  return tripDate.toISOString();
};
