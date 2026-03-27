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
