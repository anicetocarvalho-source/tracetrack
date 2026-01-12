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
          branch_id: string | null
          country_id: string | null
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
          branch_id?: string | null
          country_id?: string | null
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
          branch_id?: string | null
          country_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata_json?: Json | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_settings: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          id: string
          setting_key: string
          updated_at: string
          value: Json
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          country_id: string
          created_at: string
          default_language: string | null
          id: string
          is_active: boolean
          name: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          code: string
          country_id: string
          created_at?: string
          default_language?: string | null
          id?: string
          is_active?: boolean
          name: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          country_id?: string
          created_at?: string
          default_language?: string | null
          id?: string
          is_active?: boolean
          name?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      client_scorecards: {
        Row: {
          avg_transit_hours: number
          client_id: string
          created_at: string
          delivered_shipments: number
          exceptions_p1: number
          exceptions_p2: number
          exceptions_p3: number
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          on_time_delivery_rate: number
          period_month: number
          period_year: number
          sla_compliance_rate: number
          status_breakdown: Json
          top_issues: Json
          total_incidents: number
          total_shipments: number
          trend_data: Json
          updated_at: string
        }
        Insert: {
          avg_transit_hours?: number
          client_id: string
          created_at?: string
          delivered_shipments?: number
          exceptions_p1?: number
          exceptions_p2?: number
          exceptions_p3?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          on_time_delivery_rate?: number
          period_month: number
          period_year: number
          sla_compliance_rate?: number
          status_breakdown?: Json
          top_issues?: Json
          total_incidents?: number
          total_shipments?: number
          trend_data?: Json
          updated_at?: string
        }
        Update: {
          avg_transit_hours?: number
          client_id?: string
          created_at?: string
          delivered_shipments?: number
          exceptions_p1?: number
          exceptions_p2?: number
          exceptions_p3?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          on_time_delivery_rate?: number
          period_month?: number
          period_year?: number
          sla_compliance_rate?: number
          status_breakdown?: Json
          top_issues?: Json
          total_incidents?: number
          total_shipments?: number
          trend_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_scorecards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          name: string
          notification_emails: string[] | null
          parent_client_id: string | null
          subsidiary_visibility: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          name: string
          notification_emails?: string[] | null
          parent_client_id?: string | null
          subsidiary_visibility?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notification_emails?: string[] | null
          parent_client_id?: string | null
          subsidiary_visibility?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          default_language: string
          id: string
          is_active: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_language?: string
          id?: string
          is_active?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_language?: string
          id?: string
          is_active?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_requests: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message: string
          request_type: Database["public"]["Enums"]["request_type"]
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          shipment_id: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message: string
          request_type: Database["public"]["Enums"]["request_type"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shipment_id: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shipment_id?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
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
          allowed_branch_ids: string[] | null
          branch_id: string | null
          client_id: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          name: string
          preferences: Json | null
          updated_at: string
        }
        Insert: {
          allowed_branch_ids?: string[] | null
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          name: string
          preferences?: Json | null
          updated_at?: string
        }
        Update: {
          allowed_branch_ids?: string[] | null
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          preferences?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      request_comment_reads: {
        Row: {
          created_at: string
          id: string
          last_read_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_read_at?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_read_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comment_reads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message: string
          request_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message: string
          request_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_exports: {
        Row: {
          export_type: string
          exported_at: string
          exported_by: string
          id: string
          recipient_emails: string[] | null
          scorecard_id: string
        }
        Insert: {
          export_type: string
          exported_at?: string
          exported_by: string
          id?: string
          recipient_emails?: string[] | null
          scorecard_id: string
        }
        Update: {
          export_type?: string
          exported_at?: string
          exported_by?: string
          id?: string
          recipient_emails?: string[] | null
          scorecard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_exports_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "client_scorecards"
            referencedColumns: ["id"]
          },
        ]
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
      shipment_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          filename: string
          id: string
          shipment_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          visible_to_client: boolean
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["document_type"]
          filename: string
          id?: string
          shipment_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          visible_to_client?: boolean
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          filename?: string
          id?: string
          shipment_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shipment_documents_shipment_id_fkey"
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
      shipment_sla: {
        Row: {
          breached: boolean | null
          created_at: string
          elapsed_hours: number | null
          entered_at: string
          exited_at: string | null
          id: string
          shipment_id: string
          shipment_status: Database["public"]["Enums"]["shipment_status"]
          sla_config_id: string | null
        }
        Insert: {
          breached?: boolean | null
          created_at?: string
          elapsed_hours?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          shipment_id: string
          shipment_status: Database["public"]["Enums"]["shipment_status"]
          sla_config_id?: string | null
        }
        Update: {
          breached?: boolean | null
          created_at?: string
          elapsed_hours?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          shipment_id?: string
          shipment_status?: Database["public"]["Enums"]["shipment_status"]
          sla_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_sla_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_sla_sla_config_id_fkey"
            columns: ["sla_config_id"]
            isOneToOne: false
            referencedRelation: "sla_config"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          assigned_operator: string | null
          bl_reference: string
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "shipments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_config: {
        Row: {
          branch_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_hours: number
          shipment_status: Database["public"]["Enums"]["shipment_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_hours: number
          shipment_status: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_hours?: number
          shipment_status?: Database["public"]["Enums"]["shipment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_config_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_config_client_id_fkey"
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
      get_client_visible_ids: {
        Args: { _client_id: string }
        Returns: string[]
      }
      get_sla_config: {
        Args: {
          p_client_id: string
          p_status: Database["public"]["Enums"]["shipment_status"]
        }
        Returns: {
          id: string
          max_hours: number
        }[]
      }
      get_user_allowed_branches: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_branch_id: { Args: { _user_id: string }; Returns: string }
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      is_multi_branch_manager: { Args: { _user_id: string }; Returns: boolean }
      reset_rate_limit: {
        Args: { p_action: string; p_identifier: string }
        Returns: undefined
      }
      schedule_cron_job: {
        Args: {
          p_auth_key: string
          p_job_name: string
          p_schedule: string
          p_url: string
        }
        Returns: number
      }
      unschedule_cron_job: { Args: { job_name: string }; Returns: undefined }
      user_has_branch_access: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "TECHNICIAN" | "SUPERVISOR" | "MANAGER" | "CUSTOMER"
      document_type: "POD" | "BL" | "INVOICE" | "OTHER"
      exception_severity: "P1" | "P2" | "P3"
      exception_status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
      request_status: "OPEN" | "IN_PROGRESS" | "RESOLVED"
      request_type: "UPDATE_REQUEST" | "DOC_UPLOAD" | "INSTRUCTION_CHANGE"
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
      document_type: ["POD", "BL", "INVOICE", "OTHER"],
      exception_severity: ["P1", "P2", "P3"],
      exception_status: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
      request_status: ["OPEN", "IN_PROGRESS", "RESOLVED"],
      request_type: ["UPDATE_REQUEST", "DOC_UPLOAD", "INSTRUCTION_CHANGE"],
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
