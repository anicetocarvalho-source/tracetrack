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

export type AppRole = 'TECHNICIAN' | 'SUPERVISOR' | 'MANAGER' | 'CUSTOMER';

export const ROLE_LABELS: Record<AppRole, string> = {
  TECHNICIAN: 'Technician',
  SUPERVISOR: 'Supervisor',
  MANAGER: 'Manager',
  CUSTOMER: 'Customer',
};

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
