export const SHIPMENT_STATUSES = [
  'RECEIVED',
  'REGISTERED',
  'DOCS_VALIDATION',
  'PROCESSING',
  'IN_TRANSIT',
  'AT_TERMINAL',
  'CLEARANCE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'ON_HOLD_INCIDENT',
  'CANCELLED',
] as const;

export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  RECEIVED: 'Received',
  REGISTERED: 'Registered',
  DOCS_VALIDATION: 'Docs Validation',
  PROCESSING: 'Processing',
  IN_TRANSIT: 'In Transit',
  AT_TERMINAL: 'At Terminal',
  CLEARANCE: 'Clearance',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  ON_HOLD_INCIDENT: 'On Hold',
  CANCELLED: 'Cancelled',
};

export const STATUS_CLASSES: Record<ShipmentStatus, string> = {
  RECEIVED: 'status-received',
  REGISTERED: 'status-registered',
  DOCS_VALIDATION: 'status-docs-validation',
  PROCESSING: 'status-processing',
  IN_TRANSIT: 'status-in-transit',
  AT_TERMINAL: 'status-at-terminal',
  CLEARANCE: 'status-clearance',
  OUT_FOR_DELIVERY: 'status-out-for-delivery',
  DELIVERED: 'status-delivered',
  ON_HOLD_INCIDENT: 'status-on-hold',
  CANCELLED: 'status-cancelled',
};

export type AppRole = 'ADMIN' | 'COUNTRY_ADMIN' | 'TECHNICIAN' | 'SUPERVISOR' | 'MANAGER' | 'CUSTOMER';

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Admin',
  COUNTRY_ADMIN: 'Country Admin',
  TECHNICIAN: 'Technician',
  SUPERVISOR: 'Supervisor',
  MANAGER: 'Manager',
  CUSTOMER: 'Customer',
};

// Role hierarchy for permission checks
export const INTERNAL_ROLES: AppRole[] = ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN'];
export const ADMIN_ROLES: AppRole[] = ['ADMIN', 'COUNTRY_ADMIN'];

export const CONTAINER_TYPES = [
  '20GP',
  '40GP',
  '40HC',
  '20RF',
  '40RF',
  '20OT',
  '40OT',
  '20FR',
  '40FR',
] as const;

export const EXCEPTION_SEVERITIES = ['P1', 'P2', 'P3'] as const;
export type ExceptionSeverity = typeof EXCEPTION_SEVERITIES[number];

export const SEVERITY_LABELS: Record<ExceptionSeverity, string> = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
};

export const SEVERITY_CLASSES: Record<ExceptionSeverity, string> = {
  P1: 'bg-destructive text-destructive-foreground',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-yellow-500 text-black',
};

export const EXCEPTION_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type ExceptionStatus = typeof EXCEPTION_STATUSES[number];

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
};
