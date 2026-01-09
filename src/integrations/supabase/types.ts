export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata_json: Json | null
          timestamp: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata_json?: Json | null
          timestamp?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata_json?: Json | null
          timestamp?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string
          notification_emails: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notification_emails?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notification_emails?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      exception_rules: {
        Row: {
          applies_to_client_id: string | null
          applies_to_service_type: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_hours_in_status: number
          name: string
          severity: Database["public"]["Enums"]["exception_severity"]
          status_trigger: Database["public"]["Enums"]["shipment_status"]
          updated_at: string
        }
        Insert: {
          applies_to_client_id?: string | null
          applies_to_service_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_hours_in_status: number
          name: string
          severity?: Database["public"]["Enums"]["exception_severity"]
          status_trigger: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
        }
        Update: {
          applies_to_client_id?: string | null
          applies_to_service_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_hours_in_status?: number
          name?: string
          severity?: Database["public"]["Enums"]["exception_severity"]
          status_trigger?: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_rules_applies_to_client_id_fkey"
            columns: ["applies_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          attempts: number
          blocked_until: string | null
          first_attempt_at: string
          id: string
          identifier: string
          last_attempt_at: string
        }
        Insert: {
          action: string
          attempts?: number
          blocked_until?: string | null
          first_attempt_at?: string
          id?: string
          identifier: string
          last_attempt_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          blocked_until?: string | null
          first_attempt_at?: string
          id?: string
          identifier?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      shipment_containers: {
        Row: {
          container_number: string
          container_type: string
          created_at: string
          id: string
          shipment_id: string
        }
        Insert: {
          container_number: string
          container_type: string
          created_at?: string
          id?: string
          shipment_id: string
        }
        Update: {
          container_number?: string
          container_type?: string
          created_at?: string
          id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_containers_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_exceptions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          detected_at: string
          exception_rule_id: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["exception_severity"]
          shipment_id: string
          status: Database["public"]["Enums"]["exception_status"]
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detected_at?: string
          exception_rule_id: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["exception_severity"]
          shipment_id: string
          status?: Database["public"]["Enums"]["exception_status"]
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detected_at?: string
          exception_rule_id?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["exception_severity"]
          shipment_id?: string
          status?: Database["public"]["Enums"]["exception_status"]
        }
        Relationships: [
          {
            foreignKeyName: "shipment_exceptions_exception_rule_id_fkey"
            columns: ["exception_rule_id"]
            isOneToOne: false
            referencedRelation: "exception_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_exceptions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          assigned_operator: string | null
          bl_reference: string
          client_id: string
          client_ref: string
          created_at: string
          created_by: string
          current_status: Database["public"]["Enums"]["shipment_status"]
          discharge_date: string | null
          docs_received_date: string | null
          file_number: string | null
          forecast_shipping_line: string | null
          forecast_terminal: string | null
          id: string
          service_request_date: string | null
          shipment_ref: string
          shipping_line: string
          updated_at: string
        }
        Insert: {
          assigned_operator?: string | null
          bl_reference: string
          client_id: string
          client_ref: string
          created_at?: string
          created_by: string
          current_status?: Database["public"]["Enums"]["shipment_status"]
          discharge_date?: string | null
          docs_received_date?: string | null
          file_number?: string | null
          forecast_shipping_line?: string | null
          forecast_terminal?: string | null
          id?: string
          service_request_date?: string | null
          shipment_ref: string
          shipping_line: string
          updated_at?: string
        }
        Update: {
          assigned_operator?: string | null
          bl_reference?: string
          client_id?: string
          client_ref?: string
          created_at?: string
          created_by?: string
          current_status?: Database["public"]["Enums"]["shipment_status"]
          discharge_date?: string | null
          docs_received_date?: string | null
          file_number?: string | null
          forecast_shipping_line?: string | null
          forecast_terminal?: string | null
          id?: string
          service_request_date?: string | null
          shipment_ref?: string
          shipping_line?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tracking_events: {
        Row: {
          created_at: string
          created_by: string
          event_datetime: string
          id: string
          location: string | null
          note: string
          notify_client: boolean
          shipment_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          visible_to_client: boolean
        }
        Insert: {
          created_at?: string
          created_by: string
          event_datetime?: string
          id?: string
          location?: string | null
          note: string
          notify_client?: boolean
          shipment_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          visible_to_client?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string
          event_datetime?: string
          id?: string
          location?: string | null
          note?: string
          notify_client?: boolean
          shipment_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_action: string
          p_block_seconds?: number
          p_identifier: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          blocked_until: string
          remaining_attempts: number
        }[]
      }
      cleanup_rate_limits: { Args: never; Returns: number }
      get_user_client_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      reset_rate_limit: {
        Args: { p_action: string; p_identifier: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "TECHNICIAN" | "SUPERVISOR" | "MANAGER" | "CUSTOMER"
      exception_severity: "P1" | "P2" | "P3"
      exception_status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
      shipment_status:
        | "RECEIVED"
        | "REGISTERED"
        | "DOCS_VALIDATION"
        | "PROCESSING"
        | "IN_TRANSIT"
        | "AT_TERMINAL"
        | "CLEARANCE"
        | "OUT_FOR_DELIVERY"
        | "DELIVERED"
        | "ON_HOLD_INCIDENT"
        | "CANCELLED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["TECHNICIAN", "SUPERVISOR", "MANAGER", "CUSTOMER"],
      exception_severity: ["P1", "P2", "P3"],
      exception_status: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
      shipment_status: [
        "RECEIVED",
        "REGISTERED",
        "DOCS_VALIDATION",
        "PROCESSING",
        "IN_TRANSIT",
        "AT_TERMINAL",
        "CLEARANCE",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "ON_HOLD_INCIDENT",
        "CANCELLED",
      ],
    },
  },
} as const
