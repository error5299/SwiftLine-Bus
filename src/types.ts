export interface Counter {
  id: string;
  name: string;
  location: string;
  walletBalance: number;
  allowedDestinationCounters: string[];
  status: 'active' | 'inactive';
  isReportingCounter?: boolean;
}

export interface Operator {
  id: string;
  userId?: string;
  customId?: string;
  password?: string;
  counterId: string;
  role: 'operator' | 'admin' | 'supervisor';
  email?: string;
  name?: string;
}

export interface WalletTransaction {
  id: string;
  counterId: string;
  amount: number;
  type: 'topup' | 'booking' | 'reload';
  timestamp: any;
  description: string;
  status?: 'completed' | 'pending' | 'failed';
}

export interface RouteStop {
  counterId: string;
  distance: number;
  travelTime: number; // Minutes from previous stop
}

export interface Route {
  id: string;
  name: string;
  stops: RouteStop[];
  orderedCounterList: string[];
}

export interface Bus {
  id: string;
  regNo: string;
  model: string;
  isAC: boolean;
  capacity: number;
  layout?: '2+2' | '1+2';
  isWiFi: boolean;
  isFood: boolean;
  isCharging: boolean;
}

export interface Crew {
  id: string;
  name: string;
  role: 'driver' | 'supervisor' | 'helper';
  nid: string;
  photo: string;
  phone: string;
  license: string;
  assignedTripId?: string;
  customId?: string;
  password?: string;
}

export interface Passenger {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: 'male' | 'female';
  isBlacklisted: boolean;
  totalTrips?: number;
}

export interface StopLog {
  counterId: string;
  timestamp: string;
}

export interface TripCounterTime {
  id: string;
  tripId: string;
  counterId: string;
  arrivalTime: string;
  departureTime: string;
  isReportingCounter?: boolean;
}

export interface TripTemplate {
  id: string;
  name: string; // e.g., "Kushtia -> Dhaka Morning 1"
  coachNumber: string;
  routeId: string;
  busId: string;
  crewIds: string[];
  baseDepartureTime: string; // HH:mm
  fare: number;
  boardingPoints?: string[];
  droppingPoints?: string[];
  repeatDaily: boolean;
  activeDays?: number[]; // [0,1,2,3,4,5,6] for Sun-Sat
}

export interface CounterTimeTemplate {
  id: string;
  templateId: string;
  counterId: string;
  arrivalTimeOffset: number; // Minutes from baseDepartureTime
  departureTimeOffset: number; // Minutes from baseDepartureTime
  isReportingCounter?: boolean;
}

export interface Trip {
  id: string;
  templateId?: string; // Link to parent template
  coachNumber: string;
  routeId: string;
  busId: string;
  crewIds: string[];
  date: string;
  baseDepartureTime: string; // HH:mm
  departureTime: string; // ISO string for the specific date
  status: 'scheduled' | 'departed' | 'arrived' | 'cancelled';
  currentStopIndex: number;
  stopLogs: StopLog[];
  fare: number;
  boardingPoints?: string[];
  droppingPoints?: string[];
  repeatDaily?: boolean;
  currentLocation?: { lat: number; lng: number; timestamp: string };
  nextStopId?: string;
  emergencyAlert?: { message: string; timestamp: string; type: 'accident' | 'breakdown' | 'traffic' | 'other' };
  lockedSeats?: { seatId: string; counterId: string; timestamp: string }[];
}

export interface Booking {
  id: string;
  tripId: string;
  passengerId: string;
  seats: string[];
  gender: 'male' | 'female';
  withCounter?: boolean;
  boardingStopId: string;
  droppingStopId: string;
  totalFare: number;
  timestamp: any;
  status: 'confirmed' | 'cancelled' | 'booked' | 'sold';
  bookedByCounterId: string;
  paymentMethod?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed';
}

export interface SeatLock {
  id: string;
  tripId: string;
  seatNumber: string;
  lockedBy: string;
  expiresAt: string;
}
