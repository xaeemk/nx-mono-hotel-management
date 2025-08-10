// Room Types
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
}

// Rate Management
export interface Rate {
  id: string;
  roomType: RoomType;
  baseRate: number;
  seasonalRates: SeasonalRate[];
  weekendMultiplier: number;
  minimumStay?: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
}

export interface SeasonalRate {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  multiplier: number;
  fixedRate?: number;
}

// Policy Types
export interface Policy {
  id: string;
  type: PolicyType;
  title: string;
  description: string;
  rules: PolicyRule[];
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  applicableRoomTypes: RoomType[];
}

export enum PolicyType {
  CANCELLATION = 'CANCELLATION',
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  PAYMENT = 'PAYMENT',
  OCCUPANCY = 'OCCUPANCY',
  PET = 'PET',
  SMOKING = 'SMOKING',
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: string;
  penalty?: number;
  grace_period?: number;
}

// Inventory Types
export interface Inventory {
  id: string;
  name: string;
  category: InventoryCategory;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lastRestocked: Date;
  expiryDate?: Date;
  location: string;
}

export enum InventoryCategory {
  LINENS = 'LINENS',
  TOILETRIES = 'TOILETRIES',
  CLEANING = 'CLEANING',
  FOOD_BEVERAGE = 'FOOD_BEVERAGE',
  MAINTENANCE = 'MAINTENANCE',
  OFFICE = 'OFFICE',
}

// Analytics Types
export interface Analytics {
  occupancyRate: number;
  averageRate: number;
  revenue: number;
  totalRooms: number;
  availableRooms: number;
  checkInsToday: number;
  checkOutsToday: number;
  maintenanceRooms: number;
  period: 'today' | 'week' | 'month' | 'year';
}

export interface RevenueData {
  date: string;
  revenue: number;
  occupancy: number;
  averageRate: number;
}

// Staff Types
export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  department: Department;
  isActive: boolean;
  hireDate: Date;
  permissions: Permission[];
}

export enum StaffRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  FRONT_DESK = 'FRONT_DESK',
  HOUSEKEEPING = 'HOUSEKEEPING',
  MAINTENANCE = 'MAINTENANCE',
}

export enum Department {
  ADMINISTRATION = 'ADMINISTRATION',
  FRONT_OFFICE = 'FRONT_OFFICE',
  HOUSEKEEPING = 'HOUSEKEEPING',
  MAINTENANCE = 'MAINTENANCE',
  FOOD_BEVERAGE = 'FOOD_BEVERAGE',
}

export interface Permission {
  id: string;
  resource: string;
  actions: string[];
}
