import { ShipmentStatus, AppRole } from '@/lib/constants';

export interface Client {
  id: string;
  name: string;
  notification_emails: string[];
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  client_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Shipment {
  id: string;
  shipment_ref: string;
  client_ref: string;
  file_number: string | null;
  client_id: string;
  assigned_operator: string | null;
  shipping_line: string;
  bl_reference: string;
  forecast_shipping_line: string | null;
  forecast_terminal: string | null;
  discharge_date: string | null;
  service_request_date: string | null;
  docs_received_date: string | null;
  current_status: ShipmentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  client?: Client;
  containers?: ShipmentContainer[];
  tracking_events?: TrackingEvent[];
}

export interface ShipmentContainer {
  id: string;
  shipment_id: string;
  container_number: string;
  container_type: string;
  created_at: string;
}

export interface TrackingEvent {
  id: string;
  shipment_id: string;
  status: ShipmentStatus;
  note: string;
  location: string | null;
  event_datetime: string;
  visible_to_client: boolean;
  notify_client: boolean;
  created_by: string;
  created_at: string;
  // Joined fields
  creator?: Profile;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_user_id: string | null;
  timestamp: string;
  ip_address: string | null;
  metadata_json: Record<string, unknown>;
  // Joined fields
  actor?: Profile;
}

export interface UserWithRole extends Profile {
  role: AppRole;
}
