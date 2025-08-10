// Shared types (reused from admin-console for consistency)
export interface Room {
  id: string;
  number: string;
  type: RoomType;
  floor: number;
  status: RoomStatus;
  rate: number;
  amenities: string[];
  lastCleaned?: Date;
  maintenanceNotes?: string;
  currentGuest?: Guest;
  expectedCheckIn?: Date;
  expectedCheckOut?: Date;
}

export enum RoomType {
  STANDARD = 'STANDARD',
  DELUXE = 'DELUXE',
  SUITE = 'SUITE',
  PRESIDENTIAL = 'PRESIDENTIAL',
}

export enum RoomStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  CLEANING = 'CLEANING',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  RESERVED = 'RESERVED',
}

// Guest and Reservation types
export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  checkInDate: Date;
  checkOutDate: Date;
  reservationId: string;
  specialRequests?: string;
  loyaltyLevel?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
}

export interface Reservation {
  id: string;
  guestId: string;
  roomId: string;
  checkInDate: Date;
  checkOutDate: Date;
  status: ReservationStatus;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  specialRequests?: string;
  createdAt: Date;
  guest: Guest;
  room: Room;
  services: Service[];
}

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

// Billing and Services
export interface Service {
  id: string;
  name: string;
  amount: number;
  date: Date;
  category: ServiceCategory;
}

export enum ServiceCategory {
  ROOM_SERVICE = 'ROOM_SERVICE',
  LAUNDRY = 'LAUNDRY',
  SPA = 'SPA',
  RESTAURANT = 'RESTAURANT',
  MINIBAR = 'MINIBAR',
  PHONE = 'PHONE',
  INTERNET = 'INTERNET',
  PARKING = 'PARKING',
  OTHER = 'OTHER',
}

// Front desk specific types
export interface CheckInData {
  reservationId: string;
  roomId?: string;
  actualCheckIn: Date;
  keyCards: number;
  depositAmount?: number;
  notes?: string;
}

export interface CheckOutData {
  reservationId: string;
  actualCheckOut: Date;
  finalBill: number;
  paymentMethod: PaymentMethod;
  damages?: string;
  keyCardsReturned: boolean;
  notes?: string;
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  DIGITAL_WALLET = 'DIGITAL_WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

// Dashboard data
export interface FrontDeskSummary {
  totalRooms: number;
  occupiedRooms: number;
  checkInsToday: number;
  checkOutsToday: number;
  maintenanceRooms: number;
  availableRooms: number;
  expectedArrivals: number;
  expectedDepartures: number;
}

// Real-time updates
export interface RoomUpdate {
  roomId: string;
  oldStatus: RoomStatus;
  newStatus: RoomStatus;
  timestamp: Date;
  updatedBy: string;
}

export interface GuestNotification {
  id: string;
  type: 'check_in' | 'check_out' | 'service_request' | 'maintenance';
  roomNumber: string;
  guestName: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  read: boolean;
}
