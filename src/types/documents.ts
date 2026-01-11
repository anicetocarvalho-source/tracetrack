import { Profile } from './database';

export type DocumentType = 'POD' | 'BL' | 'INVOICE' | 'OTHER';
export type RequestType = 'UPDATE_REQUEST' | 'DOC_UPLOAD' | 'INSTRUCTION_CHANGE';
export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  POD: 'Proof of Delivery',
  BL: 'Bill of Lading',
  INVOICE: 'Invoice',
  OTHER: 'Other',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  UPDATE_REQUEST: 'Status Update Request',
  DOC_UPLOAD: 'Document Upload',
  INSTRUCTION_CHANGE: 'Instruction Change',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

export interface ShipmentDocument {
  id: string;
  shipment_id: string;
  document_type: DocumentType;
  filename: string;
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
  visible_to_client: boolean;
  created_at: string;
  // Joined fields
  uploader?: Profile;
}

export interface CustomerRequest {
  id: string;
  shipment_id: string;
  request_type: RequestType;
  message: string;
  status: RequestStatus;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  // Joined fields
  creator?: { id: string; name: string } | null;
  resolver?: { id: string; name: string } | null;
  shipment?: {
    shipment_ref: string;
    client_ref: string;
    client_id?: string;
    client?: { id?: string; name: string };
  };
}
