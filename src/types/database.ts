import { ShipmentStatus, AppRole } from '@/lib/constants';

export type ExceptionSeverity = 'P1' | 'P2' | 'P3';
export type ExceptionStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type SubsidiaryVisibility = 'own_only' | 'own_and_subsidiaries' | 'read_only_group';

export interface Country {
  id: string;
  code: string;
  name: string;
  timezone: string;
  default_language: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  country_id: string;
  code: string;
  name: string;
  timezone: string | null;
  default_language: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  country?: Country;
}

export interface BranchSettings {
  id: string;
  branch_id: string;
  setting_key: string;
  value: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  notification_emails: string[];
  parent_client_id: string | null;
  branch_id: string | null;
  subsidiary_visibility: SubsidiaryVisibility;
  created_at: string;
  updated_at: string;
  // Joined fields
  parent_client?: Client;
  branch?: Branch;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  client_id: string | null;
  branch_id: string | null;
  allowed_branch_ids: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  // Joined fields
  branch?: Branch;
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
  branch_id: string | null;
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
  branch?: Branch;
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
  branch_id: string | null;
  country_id: string | null;
  timestamp: string;
  ip_address: string | null;
  metadata_json: Record<string, unknown>;
  // Joined fields
  actor?: Profile;
  branch?: Branch;
  country?: Country;
}

export interface UserWithRole extends Profile {
  role: AppRole;
}

export interface ExceptionRule {
  id: string;
  name: string;
  description: string | null;
  status_trigger: ShipmentStatus;
  max_hours_in_status: number;
  applies_to_client_id: string | null;
  applies_to_service_type: string | null;
  severity: ExceptionSeverity;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  client?: Client;
}

export interface ShipmentException {
  id: string;
  shipment_id: string;
  exception_rule_id: string;
  detected_at: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  // Joined fields
  shipment?: Shipment;
  exception_rule?: ExceptionRule;
  resolver?: Profile;
  acknowledger?: Profile;
}
