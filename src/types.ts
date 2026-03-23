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
  userId: string;
  password?: string; // Only for admin view
  counterId: string;
  role: 'operator' | 'admin' | 'supervisor';
}

export interface WalletTransaction {
  id: string;
  counterId: string;
  amount: number;
  type: 'topup' | 'booking';
  timestamp: string;
  description: string;
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
}

export interface Passenger {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: 'male' | 'female';
  isBlacklisted: boolean;
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
}

export interface Trip {
  id: string;
  coachNumber: string;
  routeId: string;
  busId: string;
  crewIds: string[];
  date: string;
  baseDepartureTime: string;
  departureTime: string; // Keep for backward compatibility or as first stop time
  status: 'scheduled' | 'departed' | 'arrived' | 'cancelled';
  currentStopIndex: number;
  stopLogs: StopLog[];
  fare: number;
  boardingPoints?: string[]; // Array of counter IDs
  droppingPoints?: string[]; // Array of counter IDs
  repeatDaily?: boolean;
  currentLocation?: { lat: number; lng: number; timestamp: string };
  nextStopId?: string;
  emergencyAlert?: { message: string; timestamp: string; type: 'accident' | 'breakdown' | 'traffic' | 'other' };
}

export interface Booking {
  id: string;
  tripId: string;
  passengerId: string;
  seats: string[];
  gender: 'male' | 'female';
  boardingStopId: string;
  droppingStopId: string;
  totalFare: number;
  timestamp: string;
  status: 'confirmed' | 'cancelled';
  bookedByCounterId: string;
}

export interface SeatLock {
  id: string;
  tripId: string;
  seatNumber: string;
  lockedBy: string;
  expiresAt: string;
}
