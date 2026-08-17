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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_commands: {
        Row: {
          agent_session_id: string
          attempt_count: number
          care_space_id: string
          child_id: string
          claimed_at: string | null
          confirmation_sha256: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          owner_user_id: string
          redacted_error: Json
          redacted_result: Json
          request_sha256: string
          started_at: string | null
          status: string
          terminal_at: string | null
          updated_at: string
        }
        Insert: {
          agent_session_id: string
          attempt_count?: number
          care_space_id: string
          child_id: string
          claimed_at?: string | null
          confirmation_sha256?: string | null
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key: string
          operation: string
          owner_user_id: string
          redacted_error?: Json
          redacted_result?: Json
          request_sha256: string
          started_at?: string | null
          status?: string
          terminal_at?: string | null
          updated_at?: string
        }
        Update: {
          agent_session_id?: string
          attempt_count?: number
          care_space_id?: string
          child_id?: string
          claimed_at?: string | null
          confirmation_sha256?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          owner_user_id?: string
          redacted_error?: Json
          redacted_result?: Json
          request_sha256?: string
          started_at?: string | null
          status?: string
          terminal_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commands_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "agent_commands_owner_fk"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_commands_session_scope_fk"
            columns: ["agent_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          authorization_expires_at: string
          authorization_version: string
          care_space_id: string
          channel: string
          child_id: string
          completed_at: string | null
          created_at: string
          eve_session_bound_at: string | null
          eve_session_id: string | null
          id: string
          initial_configuration: Json
          initial_model: string
          last_sequence: number
          owner_user_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          authorization_expires_at?: string
          authorization_version?: string
          care_space_id: string
          channel: string
          child_id: string
          completed_at?: string | null
          created_at?: string
          eve_session_bound_at?: string | null
          eve_session_id?: string | null
          id?: string
          initial_configuration?: Json
          initial_model: string
          last_sequence?: number
          owner_user_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          authorization_expires_at?: string
          authorization_version?: string
          care_space_id?: string
          channel?: string
          child_id?: string
          completed_at?: string | null
          created_at?: string
          eve_session_bound_at?: string | null
          eve_session_id?: string | null
          id?: string
          initial_configuration?: Json
          initial_model?: string
          last_sequence?: number
          owner_user_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "agent_sessions_owner_fk"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      anthropometric_measurements: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          device: string | null
          exclusion_reason: string | null
          id: string
          idempotency_key: string
          local_date: string
          measurement_method: string | null
          measurement_type: string
          normalized_unit: string
          normalized_value: number
          occurred_at: string
          original_unit: string
          original_value: number
          provenance_type: string
          recorded_by: string
          time_zone: string
          updated_at: string
          validation_status: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          device?: string | null
          exclusion_reason?: string | null
          id?: string
          idempotency_key: string
          local_date: string
          measurement_method?: string | null
          measurement_type: string
          normalized_unit: string
          normalized_value: number
          occurred_at: string
          original_unit: string
          original_value: number
          provenance_type: string
          recorded_by: string
          time_zone: string
          updated_at?: string
          validation_status?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          device?: string | null
          exclusion_reason?: string | null
          id?: string
          idempotency_key?: string
          local_date?: string
          measurement_method?: string | null
          measurement_type?: string
          normalized_unit?: string
          normalized_value?: number
          occurred_at?: string
          original_unit?: string
          original_value?: number
          provenance_type?: string
          recorded_by?: string
          time_zone?: string
          updated_at?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "anthropometry_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          care_space_id: string | null
          child_id: string | null
          id: number
          metadata_redacted: Json
          occurred_at: string
          outcome: string
          policy_code: string | null
          request_id: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          care_space_id?: string | null
          child_id?: string | null
          id?: never
          metadata_redacted?: Json
          occurred_at?: string
          outcome: string
          policy_code?: string | null
          request_id: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          care_space_id?: string | null
          child_id?: string | null
          id?: never
          metadata_redacted?: Json
          occurred_at?: string
          outcome?: string
          policy_code?: string | null
          request_id?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          care_space_id: string
          created_at: string
          id: string
          provider: string
          provider_customer_id: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          created_at?: string
          id?: string
          provider: string
          provider_customer_id: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          created_at?: string
          id?: string
          provider?: string
          provider_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          event_type: string
          failure_code: string | null
          id: string
          payload_redacted: Json
          payload_sha256: string
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          event_type: string
          failure_code?: string | null
          id?: string
          payload_redacted: Json
          payload_sha256: string
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_event_id: string
          received_at?: string
          signature_verified: boolean
        }
        Update: {
          event_type?: string
          failure_code?: string | null
          id?: string
          payload_redacted?: Json
          payload_sha256?: string
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: []
      }
      billing_products: {
        Row: {
          active: boolean
          capability_set: Json
          created_at: string
          id: string
          internal_plan_code: string
          provider: string
          provider_price_id: string | null
          provider_product_id: string
        }
        Insert: {
          active?: boolean
          capability_set: Json
          created_at?: string
          id?: string
          internal_plan_code: string
          provider: string
          provider_price_id?: string | null
          provider_product_id: string
        }
        Update: {
          active?: boolean
          capability_set?: Json
          created_at?: string
          id?: string
          internal_plan_code?: string
          provider?: string
          provider_price_id?: string | null
          provider_product_id?: string
        }
        Relationships: []
      }
      care_space_members: {
        Row: {
          authorization_version: number
          care_space_id: string
          created_at: string
          id: string
          invited_by: string | null
          member_role: string
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          authorization_version?: number
          care_space_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          member_role: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          authorization_version?: number
          care_space_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          member_role?: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_space_members_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_space_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      care_spaces: {
        Row: {
          created_at: string
          created_by: string
          default_country_code: string
          id: string
          name: string
          status: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_country_code?: string
          id?: string
          name: string
          status?: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_country_code?: string
          id?: string
          name?: string
          status?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      child_access: {
        Row: {
          authorization_version: number
          care_space_id: string
          child_id: string
          created_at: string
          granted_by: string | null
          id: string
          permissions: string[]
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          authorization_version?: number
          care_space_id: string
          child_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          permissions?: string[]
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          authorization_version?: number
          care_space_id?: string
          child_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          permissions?: string[]
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_access_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "child_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      child_food_reactions: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          id: string
          normalized_code: string | null
          notes: string | null
          observed_on: string | null
          provenance_type: string
          reaction_type: string
          recorded_by: string
          severity: string | null
          status: string
          substance_name: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          id?: string
          normalized_code?: string | null
          notes?: string | null
          observed_on?: string | null
          provenance_type: string
          reaction_type: string
          recorded_by: string
          severity?: string | null
          status?: string
          substance_name: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          id?: string
          normalized_code?: string | null
          notes?: string | null
          observed_on?: string | null
          provenance_type?: string
          reaction_type?: string
          recorded_by?: string
          severity?: string | null
          status?: string
          substance_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_food_reactions_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      children: {
        Row: {
          birth_time_zone: string | null
          birth_weight_grams: number | null
          care_space_id: string
          country_of_care: string
          created_at: string
          created_by: string
          date_of_birth: string
          family_names: string | null
          gestational_age_days: number | null
          gestational_age_weeks: number | null
          given_names: string
          id: string
          preferred_name: string | null
          sex_for_growth: string
          status: string
          time_of_birth: string | null
          time_zone: string
          updated_at: string
        }
        Insert: {
          birth_time_zone?: string | null
          birth_weight_grams?: number | null
          care_space_id: string
          country_of_care?: string
          created_at?: string
          created_by: string
          date_of_birth: string
          family_names?: string | null
          gestational_age_days?: number | null
          gestational_age_weeks?: number | null
          given_names: string
          id?: string
          preferred_name?: string | null
          sex_for_growth: string
          status?: string
          time_of_birth?: string | null
          time_zone?: string
          updated_at?: string
        }
        Update: {
          birth_time_zone?: string | null
          birth_weight_grams?: number | null
          care_space_id?: string
          country_of_care?: string
          created_at?: string
          created_by?: string
          date_of_birth?: string
          family_names?: string | null
          gestational_age_days?: number | null
          gestational_age_weeks?: number | null
          given_names?: string
          id?: string
          preferred_name?: string | null
          sex_for_growth?: string
          status?: string
          time_of_birth?: string | null
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_algorithms: {
        Row: {
          activated_at: string | null
          algorithm_key: string
          approved_at: string | null
          artifact_schema_versions: string[]
          created_at: string
          domain: string
          entrypoint: string
          id: string
          implementation_sha256: string
          retired_at: string | null
          runtime: string
          status: string
          test_vector_sha256: string
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          algorithm_key: string
          approved_at?: string | null
          artifact_schema_versions?: string[]
          created_at?: string
          domain: string
          entrypoint: string
          id?: string
          implementation_sha256: string
          retired_at?: string | null
          runtime?: string
          status?: string
          test_vector_sha256: string
          updated_at?: string
          version: string
        }
        Update: {
          activated_at?: string | null
          algorithm_key?: string
          approved_at?: string | null
          artifact_schema_versions?: string[]
          created_at?: string
          domain?: string
          entrypoint?: string
          id?: string
          implementation_sha256?: string
          retired_at?: string | null
          runtime?: string
          status?: string
          test_vector_sha256?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      clinical_approvals: {
        Row: {
          algorithm_id: string
          algorithm_implementation_sha256: string
          approver_name: string
          approver_role: string
          approver_subject: string
          approver_user_id: string | null
          artifact_sha256: string
          attestation_version: number
          created_at: string
          decided_at: string
          decision: string
          id: string
          manifest_sha256: string
          notes: string | null
          request_id: string
          rule_pack_id: string
          source_set_sha256: string
          withdrawal_of: string | null
        }
        Insert: {
          algorithm_id: string
          algorithm_implementation_sha256: string
          approver_name: string
          approver_role: string
          approver_subject: string
          approver_user_id?: string | null
          artifact_sha256: string
          attestation_version?: number
          created_at?: string
          decided_at?: string
          decision: string
          id?: string
          manifest_sha256: string
          notes?: string | null
          request_id: string
          rule_pack_id: string
          source_set_sha256: string
          withdrawal_of?: string | null
        }
        Update: {
          algorithm_id?: string
          algorithm_implementation_sha256?: string
          approver_name?: string
          approver_role?: string
          approver_subject?: string
          approver_user_id?: string | null
          artifact_sha256?: string
          attestation_version?: number
          created_at?: string
          decided_at?: string
          decision?: string
          id?: string
          manifest_sha256?: string
          notes?: string | null
          request_id?: string
          rule_pack_id?: string
          source_set_sha256?: string
          withdrawal_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_approvals_algorithm_id_fkey"
            columns: ["algorithm_id"]
            isOneToOne: false
            referencedRelation: "clinical_algorithms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_approvals_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_approvals_withdrawal_of_fkey"
            columns: ["withdrawal_of"]
            isOneToOne: false
            referencedRelation: "clinical_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_memory_embeddings: {
        Row: {
          care_space_id: string
          child_id: string
          content_sha256: string
          created_at: string
          embedding: string
          embedding_dimensions: number
          embedding_model: string
          id: string
          memory_item_id: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          content_sha256: string
          created_at?: string
          embedding: string
          embedding_dimensions?: number
          embedding_model: string
          id?: string
          memory_item_id: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          content_sha256?: string
          created_at?: string
          embedding?: string
          embedding_dimensions?: number
          embedding_model?: string
          id?: string
          memory_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_embedding_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "clinical_memory_embeddings_scope_fk"
            columns: ["memory_item_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_memory_items: {
        Row: {
          care_space_id: string
          child_id: string
          confirmation_status: string
          created_at: string
          created_by: string | null
          id: string
          memory_type: string
          provenance_type: string
          searchable_text: string
          source_message_id: string | null
          source_session_id: string | null
          structured_content: Json
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          care_space_id: string
          child_id: string
          confirmation_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          memory_type: string
          provenance_type: string
          searchable_text: string
          source_message_id?: string | null
          source_session_id?: string | null
          structured_content: Json
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          care_space_id?: string
          child_id?: string
          confirmation_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          memory_type?: string
          provenance_type?: string
          searchable_text?: string
          source_message_id?: string | null
          source_session_id?: string | null
          structured_content?: Json
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "clinical_memory_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_memory_items_source_message_scope_fk"
            columns: ["source_message_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "clinical_memory_items_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_memory_items_source_session_scope_fk"
            columns: ["source_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_package_releases: {
        Row: {
          action: string
          activation_at: string
          algorithm_id: string
          approval_id: string
          artifact_sha256: string
          country_code: string
          created_at: string
          domain: string
          evidence_sha256: string
          id: string
          locale: string
          preview_sha256: string
          previous_release_id: string | null
          request_id: string
          requester_subject: string
          rule_pack_id: string
          status: string
        }
        Insert: {
          action: string
          activation_at: string
          algorithm_id: string
          approval_id: string
          artifact_sha256: string
          country_code: string
          created_at?: string
          domain: string
          evidence_sha256: string
          id?: string
          locale: string
          preview_sha256: string
          previous_release_id?: string | null
          request_id: string
          requester_subject: string
          rule_pack_id: string
          status: string
        }
        Update: {
          action?: string
          activation_at?: string
          algorithm_id?: string
          approval_id?: string
          artifact_sha256?: string
          country_code?: string
          created_at?: string
          domain?: string
          evidence_sha256?: string
          id?: string
          locale?: string
          preview_sha256?: string
          previous_release_id?: string | null
          request_id?: string
          requester_subject?: string
          rule_pack_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_package_releases_algorithm_id_fkey"
            columns: ["algorithm_id"]
            isOneToOne: false
            referencedRelation: "clinical_algorithms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_package_releases_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "clinical_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_package_releases_previous_release_id_fkey"
            columns: ["previous_release_id"]
            isOneToOne: false
            referencedRelation: "clinical_package_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_package_releases_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_pack_sources: {
        Row: {
          created_at: string
          purpose: string
          rule_pack_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          purpose: string
          rule_pack_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          purpose?: string
          rule_pack_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_pack_sources_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_rule_pack_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "clinical_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_packs: {
        Row: {
          artifact_sha256: string
          artifact_uri: string | null
          country_code: string
          created_at: string
          domain: string
          effective_from: string | null
          effective_until: string | null
          id: string
          locale: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          artifact_sha256: string
          artifact_uri?: string | null
          country_code: string
          created_at?: string
          domain: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          locale?: string
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          artifact_sha256?: string
          artifact_uri?: string | null
          country_code?: string
          created_at?: string
          domain?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          locale?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      clinical_sources: {
        Row: {
          artifact_sha256: string | null
          authority: string
          citation: string | null
          created_at: string
          effective_from: string | null
          effective_until: string | null
          id: string
          jurisdiction: string
          license: string | null
          published_at: string | null
          retrieved_at: string
          source_uri: string
          status: string
          title: string
        }
        Insert: {
          artifact_sha256?: string | null
          authority: string
          citation?: string | null
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          jurisdiction: string
          license?: string | null
          published_at?: string | null
          retrieved_at: string
          source_uri: string
          status?: string
          title: string
        }
        Update: {
          artifact_sha256?: string | null
          authority?: string
          citation?: string | null
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          jurisdiction?: string
          license?: string | null
          published_at?: string | null
          retrieved_at?: string
          source_uri?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      consent_definitions: {
        Row: {
          consent_type: string
          content_sha256: string
          created_at: string
          document_uri: string
          effective_from: string
          effective_until: string | null
          id: string
          jurisdiction: string
          locale: string
          status: string
          title: string
          version: string
        }
        Insert: {
          consent_type: string
          content_sha256: string
          created_at?: string
          document_uri: string
          effective_from: string
          effective_until?: string | null
          id?: string
          jurisdiction: string
          locale: string
          status?: string
          title: string
          version: string
        }
        Update: {
          consent_type?: string
          content_sha256?: string
          created_at?: string
          document_uri?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          jurisdiction?: string
          locale?: string
          status?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          care_space_id: string
          child_id: string | null
          consent_definition_id: string
          created_at: string
          decided_at: string
          decision: string
          evidence: Json
          guardian_user_id: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          care_space_id: string
          child_id?: string | null
          consent_definition_id: string
          created_at?: string
          decided_at?: string
          decision: string
          evidence?: Json
          guardian_user_id: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          care_space_id?: string
          child_id?: string | null
          consent_definition_id?: string
          created_at?: string
          decided_at?: string
          decision?: string
          evidence?: Json
          guardian_user_id?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "consent_records_consent_definition_id_fkey"
            columns: ["consent_definition_id"]
            isOneToOne: false
            referencedRelation: "consent_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at: string
          generator_version: string
          id: string
          source_message_ids: string[]
          summary: Json
        }
        Insert: {
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at?: string
          generator_version: string
          id?: string
          source_message_ids: string[]
          summary: Json
        }
        Update: {
          agent_session_id?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          generator_version?: string
          id?: string
          source_message_ids?: string[]
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_summaries_agent_session_id_fkey"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_summaries_session_scope_fk"
            columns: ["agent_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "conversation_summary_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      development_frameworks: {
        Row: {
          country_code: string
          created_at: string
          framework_key: string
          framework_type: string
          id: string
          rule_pack_id: string
          status: string
          version: string
        }
        Insert: {
          country_code: string
          created_at?: string
          framework_key: string
          framework_type: string
          id?: string
          rule_pack_id: string
          status?: string
          version: string
        }
        Update: {
          country_code?: string
          created_at?: string
          framework_key?: string
          framework_type?: string
          id?: string
          rule_pack_id?: string
          status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_frameworks_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      development_milestones: {
        Row: {
          caregiver_copy: string
          created_at: string
          domain: string
          framework_id: string
          id: string
          milestone_code: string
          professional_only: boolean
          sort_order: number
          title: string
          window_end_days: number | null
          window_start_days: number | null
        }
        Insert: {
          caregiver_copy: string
          created_at?: string
          domain: string
          framework_id: string
          id?: string
          milestone_code: string
          professional_only?: boolean
          sort_order?: number
          title: string
          window_end_days?: number | null
          window_start_days?: number | null
        }
        Update: {
          caregiver_copy?: string
          created_at?: string
          domain?: string
          framework_id?: string
          id?: string
          milestone_code?: string
          professional_only?: boolean
          sort_order?: number
          title?: string
          window_end_days?: number | null
          window_start_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "development_milestones_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "development_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      development_observations: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          domain: string
          id: string
          milestone_id: string | null
          observation: string
          observed_on: string
          provenance_type: string
          recorded_by: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          domain: string
          id?: string
          milestone_id?: string | null
          observation: string
          observed_on: string
          provenance_type: string
          recorded_by: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          domain?: string
          id?: string
          milestone_id?: string | null
          observation?: string
          observed_on?: string
          provenance_type?: string
          recorded_by?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_observation_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "development_observations_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "development_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      device_installations: {
        Row: {
          created_at: string
          device_identifier_hash: string
          expo_push_token: string
          id: string
          last_seen_at: string
          locale: string
          platform: string
          status: string
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_identifier_hash: string
          expo_push_token: string
          id?: string
          last_seen_at?: string
          locale: string
          platform: string
          status?: string
          time_zone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_identifier_hash?: string
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          locale?: string
          platform?: string
          status?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_installations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          document_id: string
          resource_id: string
          resource_type: string
        }
        Insert: {
          created_at?: string
          document_id: string
          resource_id: string
          resource_type: string
        }
        Update: {
          created_at?: string
          document_id?: string
          resource_id?: string
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          bucket_id: string
          care_space_id: string
          child_id: string | null
          created_at: string
          deleted_at: string | null
          detected_mime_type: string
          document_type: string
          extraction_metadata: Json
          id: string
          object_path: string
          original_filename: string | null
          processing_status: string
          provenance_type: string
          retention_until: string | null
          sha256: string
          size_bytes: number
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          bucket_id: string
          care_space_id: string
          child_id?: string | null
          created_at?: string
          deleted_at?: string | null
          detected_mime_type: string
          document_type: string
          extraction_metadata?: Json
          id?: string
          object_path: string
          original_filename?: string | null
          processing_status?: string
          provenance_type: string
          retention_until?: string | null
          sha256: string
          size_bytes: number
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          bucket_id?: string
          care_space_id?: string
          child_id?: string | null
          created_at?: string
          deleted_at?: string | null
          detected_mime_type?: string
          document_type?: string
          extraction_metadata?: Json
          id?: string
          object_path?: string
          original_filename?: string | null
          processing_status?: string
          provenance_type?: string
          retention_until?: string | null
          sha256?: string
          size_bytes?: number
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      dose_validations: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          declared_input: Json
          dose_limit_id: string | null
          explanation_codes: string[]
          formulary_version_id: string | null
          id: string
          medication_concept_id: string | null
          request_id: string
          result: string
          validated_at: string
          weight_measurement_id: string | null
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          declared_input: Json
          dose_limit_id?: string | null
          explanation_codes?: string[]
          formulary_version_id?: string | null
          id?: string
          medication_concept_id?: string | null
          request_id: string
          result: string
          validated_at?: string
          weight_measurement_id?: string | null
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          declared_input?: Json
          dose_limit_id?: string | null
          explanation_codes?: string[]
          formulary_version_id?: string | null
          id?: string
          medication_concept_id?: string | null
          request_id?: string
          result?: string
          validated_at?: string
          weight_measurement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dose_validation_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "dose_validations_dose_limit_id_fkey"
            columns: ["dose_limit_id"]
            isOneToOne: false
            referencedRelation: "pediatric_dose_limits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_validations_formulary_version_id_fkey"
            columns: ["formulary_version_id"]
            isOneToOne: false
            referencedRelation: "pediatric_formulary_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_validations_medication_concept_id_fkey"
            columns: ["medication_concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_validations_weight_measurement_id_fkey"
            columns: ["weight_measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          calculated_at: string
          capability: string
          care_space_id: string
          created_at: string
          ends_at: string | null
          id: string
          limits: Json
          source_provider: string
          source_purchase_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          capability: string
          care_space_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          limits?: Json
          source_provider: string
          source_purchase_id?: string | null
          starts_at: string
          status: string
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          capability?: string
          care_space_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          limits?: Json
          source_provider?: string
          source_purchase_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_source_purchase_id_fkey"
            columns: ["source_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_assessments: {
        Row: {
          algorithm_id: string
          assessed_at: string
          care_space_id: string
          child_id: string
          chronological_age_days: number
          corrected_age_days: number | null
          correction_applied: boolean
          created_at: string
          id: string
          indicator: string
          measurement_id: string
          percentile: number | null
          result_status: string
          rule_pack_id: string
          standard_key: string
          warnings: string[]
          z_score: number | null
        }
        Insert: {
          algorithm_id: string
          assessed_at?: string
          care_space_id: string
          child_id: string
          chronological_age_days: number
          corrected_age_days?: number | null
          correction_applied?: boolean
          created_at?: string
          id?: string
          indicator: string
          measurement_id: string
          percentile?: number | null
          result_status: string
          rule_pack_id: string
          standard_key: string
          warnings?: string[]
          z_score?: number | null
        }
        Update: {
          algorithm_id?: string
          assessed_at?: string
          care_space_id?: string
          child_id?: string
          chronological_age_days?: number
          corrected_age_days?: number | null
          correction_applied?: boolean
          created_at?: string
          id?: string
          indicator?: string
          measurement_id?: string
          percentile?: number | null
          result_status?: string
          rule_pack_id?: string
          standard_key?: string
          warnings?: string[]
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_assessment_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "growth_assessments_algorithm_id_fkey"
            columns: ["algorithm_id"]
            isOneToOne: false
            referencedRelation: "clinical_algorithms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_assessments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_assessments_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_profiles: {
        Row: {
          created_at: string
          display_name: string
          locale: string
          onboarding_completed_at: string | null
          phone_e164: string | null
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          locale?: string
          onboarding_completed_at?: string | null
          phone_e164?: string | null
          time_zone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          locale?: string
          onboarding_completed_at?: string | null
          phone_e164?: string | null
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      immunization_rule_dependencies: {
        Row: {
          dependency_type: string
          depends_on_rule_id: string
          minimum_interval_days: number | null
          rule_id: string
        }
        Insert: {
          dependency_type: string
          depends_on_rule_id: string
          minimum_interval_days?: number | null
          rule_id: string
        }
        Update: {
          dependency_type?: string
          depends_on_rule_id?: string
          minimum_interval_days?: number | null
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "immunization_rule_dependencies_depends_on_rule_id_fkey"
            columns: ["depends_on_rule_id"]
            isOneToOne: false
            referencedRelation: "immunization_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "immunization_rule_dependencies_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "immunization_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      immunization_rules: {
        Row: {
          antigen_id: string
          catch_up: boolean
          contraindication_review_required: boolean
          created_at: string
          dose_code: string
          dose_number: number | null
          eligibility_criteria: Json
          id: string
          minimum_age_days: number | null
          minimum_interval_days: number | null
          recommended_interval_days: number | null
          schedule_id: string
          series_code: string
          target_age_days: number | null
          target_age_end_days: number | null
        }
        Insert: {
          antigen_id: string
          catch_up?: boolean
          contraindication_review_required?: boolean
          created_at?: string
          dose_code: string
          dose_number?: number | null
          eligibility_criteria?: Json
          id?: string
          minimum_age_days?: number | null
          minimum_interval_days?: number | null
          recommended_interval_days?: number | null
          schedule_id: string
          series_code: string
          target_age_days?: number | null
          target_age_end_days?: number | null
        }
        Update: {
          antigen_id?: string
          catch_up?: boolean
          contraindication_review_required?: boolean
          created_at?: string
          dose_code?: string
          dose_number?: number | null
          eligibility_criteria?: Json
          id?: string
          minimum_age_days?: number | null
          minimum_interval_days?: number | null
          recommended_interval_days?: number | null
          schedule_id?: string
          series_code?: string
          target_age_days?: number | null
          target_age_end_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "immunization_rules_antigen_id_fkey"
            columns: ["antigen_id"]
            isOneToOne: false
            referencedRelation: "vaccine_antigens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "immunization_rules_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "immunization_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      immunization_schedules: {
        Row: {
          country_code: string
          created_at: string
          display_name: string
          effective_from: string
          effective_until: string | null
          id: string
          rule_pack_id: string
          schedule_key: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          country_code: string
          created_at?: string
          display_name: string
          effective_from: string
          effective_until?: string | null
          id?: string
          rule_pack_id: string
          schedule_key: string
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          country_code?: string
          created_at?: string
          display_name?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          rule_pack_id?: string
          schedule_key?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "immunization_schedules_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_concepts: {
        Row: {
          active: boolean
          coding_system: string
          concept_code: string
          created_at: string
          display_name_en: string | null
          display_name_es: string
          id: string
          ingredient_name: string
        }
        Insert: {
          active?: boolean
          coding_system: string
          concept_code: string
          created_at?: string
          display_name_en?: string | null
          display_name_es: string
          id?: string
          ingredient_name: string
        }
        Update: {
          active?: boolean
          coding_system?: string
          concept_code?: string
          created_at?: string
          display_name_en?: string | null
          display_name_es?: string
          id?: string
          ingredient_name?: string
        }
        Relationships: []
      }
      medication_intakes: {
        Row: {
          actual_quantity: number | null
          actual_unit: string | null
          care_space_id: string
          child_id: string
          created_at: string
          id: string
          idempotency_key: string
          medication_plan_id: string
          medication_schedule_id: string | null
          notes: string | null
          recorded_by: string
          scheduled_for: string | null
          status: string
          taken_at: string | null
          updated_at: string
        }
        Insert: {
          actual_quantity?: number | null
          actual_unit?: string | null
          care_space_id: string
          child_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          medication_plan_id: string
          medication_schedule_id?: string | null
          notes?: string | null
          recorded_by: string
          scheduled_for?: string | null
          status: string
          taken_at?: string | null
          updated_at?: string
        }
        Update: {
          actual_quantity?: number | null
          actual_unit?: string | null
          care_space_id?: string
          child_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          medication_plan_id?: string
          medication_schedule_id?: string | null
          notes?: string | null
          recorded_by?: string
          scheduled_for?: string | null
          status?: string
          taken_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_intake_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "medication_intakes_medication_plan_id_fkey"
            columns: ["medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_intakes_medication_schedule_id_fkey"
            columns: ["medication_schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_plans: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          declared_indication: string | null
          display_name: string
          ends_at: string | null
          id: string
          medication_concept_id: string
          medication_presentation_id: string | null
          prescriber_name: string | null
          provenance_type: string
          recorded_by: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          declared_indication?: string | null
          display_name: string
          ends_at?: string | null
          id?: string
          medication_concept_id: string
          medication_presentation_id?: string | null
          prescriber_name?: string | null
          provenance_type: string
          recorded_by: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          declared_indication?: string | null
          display_name?: string
          ends_at?: string | null
          id?: string
          medication_concept_id?: string
          medication_presentation_id?: string | null
          prescriber_name?: string | null
          provenance_type?: string
          recorded_by?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_plan_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "medication_plans_medication_concept_id_fkey"
            columns: ["medication_concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_plans_medication_presentation_id_fkey"
            columns: ["medication_presentation_id"]
            isOneToOne: false
            referencedRelation: "medication_presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_presentations: {
        Row: {
          active: boolean
          concentration_denominator: number
          concentration_denominator_unit: string
          concentration_numerator: number
          concentration_numerator_unit: string
          country_code: string
          created_at: string
          id: string
          medication_concept_id: string
          presentation_name: string
          regulatory_identifier: string | null
          route: string | null
        }
        Insert: {
          active?: boolean
          concentration_denominator: number
          concentration_denominator_unit: string
          concentration_numerator: number
          concentration_numerator_unit: string
          country_code: string
          created_at?: string
          id?: string
          medication_concept_id: string
          presentation_name: string
          regulatory_identifier?: string | null
          route?: string | null
        }
        Update: {
          active?: boolean
          concentration_denominator?: number
          concentration_denominator_unit?: string
          concentration_numerator?: number
          concentration_numerator_unit?: string
          country_code?: string
          created_at?: string
          id?: string
          medication_concept_id?: string
          presentation_name?: string
          regulatory_identifier?: string | null
          route?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_presentations_medication_concept_id_fkey"
            columns: ["medication_concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_reminders: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          created_by: string
          id: string
          medication_plan_id: string
          medication_schedule_id: string | null
          next_delivery_at: string
          status: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          created_by: string
          id?: string
          medication_plan_id: string
          medication_schedule_id?: string | null
          next_delivery_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          created_by?: string
          id?: string
          medication_plan_id?: string
          medication_schedule_id?: string | null
          next_delivery_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_reminders_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "medication_reminders_medication_plan_id_fkey"
            columns: ["medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_reminders_medication_schedule_id_fkey"
            columns: ["medication_schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          created_at: string
          dose_quantity: number
          dose_unit: string
          frequency_kind: string
          id: string
          instructions: string | null
          interval_hours: number | null
          medication_plan_id: string
          route: string
          time_zone: string
          times_of_day: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dose_quantity: number
          dose_unit: string
          frequency_kind: string
          id?: string
          instructions?: string | null
          interval_hours?: number | null
          medication_plan_id: string
          route: string
          time_zone: string
          times_of_day?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dose_quantity?: number
          dose_unit?: string
          frequency_kind?: string
          id?: string
          instructions?: string | null
          interval_hours?: number | null
          medication_plan_id?: string
          route?: string
          time_zone?: string
          times_of_day?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_medication_plan_id_fkey"
            columns: ["medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          parts: Json
          provider_message_id: string | null
          sequence: number
          status: string
        }
        Insert: {
          actor_type: string
          actor_user_id?: string | null
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          parts: Json
          provider_message_id?: string | null
          sequence: number
          status?: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          agent_session_id?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          parts?: Json
          provider_message_id?: string | null
          sequence?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_session_id_fkey"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "messages_session_scope_fk"
            columns: ["agent_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          created_at: string
          device_installation_id: string
          failure_code: string | null
          id: string
          idempotency_key: string
          medication_reminder_id: string | null
          notification_type: string
          provider_message_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_installation_id: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          medication_reminder_id?: string | null
          notification_type: string
          provider_message_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status: string
        }
        Update: {
          created_at?: string
          device_installation_id?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          medication_reminder_id?: string | null
          notification_type?: string
          provider_message_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_device_installation_id_fkey"
            columns: ["device_installation_id"]
            isOneToOne: false
            referencedRelation: "device_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_medication_reminder_id_fkey"
            columns: ["medication_reminder_id"]
            isOneToOne: false
            referencedRelation: "medication_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_profiles: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          dietary_pattern: string | null
          exclusions: string[]
          feeding_mode: string | null
          id: string
          notes: string | null
          texture_stage: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          dietary_pattern?: string | null
          exclusions?: string[]
          feeding_mode?: string | null
          id?: string
          notes?: string | null
          texture_stage?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          dietary_pattern?: string | null
          exclusions?: string[]
          feeding_mode?: string | null
          id?: string
          notes?: string | null
          texture_stage?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_profiles_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      pediatric_dose_limits: {
        Row: {
          created_at: string
          dose_per_kg_max: number | null
          dose_per_kg_min: number | null
          dose_unit: string
          exclusions: Json
          formulary_version_id: string
          id: string
          indication_code: string | null
          max_daily_dose: number | null
          max_single_dose: number | null
          maximum_age_days: number | null
          maximum_weight_kg: number | null
          medication_concept_id: string
          minimum_age_days: number | null
          minimum_interval_hours: number | null
          minimum_weight_kg: number | null
          route: string
        }
        Insert: {
          created_at?: string
          dose_per_kg_max?: number | null
          dose_per_kg_min?: number | null
          dose_unit: string
          exclusions?: Json
          formulary_version_id: string
          id?: string
          indication_code?: string | null
          max_daily_dose?: number | null
          max_single_dose?: number | null
          maximum_age_days?: number | null
          maximum_weight_kg?: number | null
          medication_concept_id: string
          minimum_age_days?: number | null
          minimum_interval_hours?: number | null
          minimum_weight_kg?: number | null
          route: string
        }
        Update: {
          created_at?: string
          dose_per_kg_max?: number | null
          dose_per_kg_min?: number | null
          dose_unit?: string
          exclusions?: Json
          formulary_version_id?: string
          id?: string
          indication_code?: string | null
          max_daily_dose?: number | null
          max_single_dose?: number | null
          maximum_age_days?: number | null
          maximum_weight_kg?: number | null
          medication_concept_id?: string
          minimum_age_days?: number | null
          minimum_interval_hours?: number | null
          minimum_weight_kg?: number | null
          route?: string
        }
        Relationships: [
          {
            foreignKeyName: "pediatric_dose_limits_formulary_version_id_fkey"
            columns: ["formulary_version_id"]
            isOneToOne: false
            referencedRelation: "pediatric_formulary_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pediatric_dose_limits_medication_concept_id_fkey"
            columns: ["medication_concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      pediatric_formulary_versions: {
        Row: {
          country_code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          rule_pack_id: string
          status: string
          version: string
        }
        Insert: {
          country_code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          rule_pack_id: string
          status?: string
          version: string
        }
        Update: {
          country_code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          rule_pack_id?: string
          status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "pediatric_formulary_versions_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          billing_product_id: string
          care_space_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          provider: string
          provider_purchase_id: string
          source_event_id: string | null
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          billing_product_id: string
          care_space_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider: string
          provider_purchase_id: string
          source_event_id?: string | null
          status: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          billing_product_id?: string
          care_space_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider?: string
          provider_purchase_id?: string
          source_event_id?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "billing_events"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_evaluations: {
        Row: {
          agent_session_id: string | null
          algorithm_key: string
          algorithm_version: string
          approved_copy_key: string | null
          care_space_id: string
          child_id: string
          copy_digest_sha256: string | null
          created_at: string
          decision: string
          decision_sha256: string
          evaluated_at: string
          evaluation_version: string
          id: string
          input_fingerprint: string
          latency_ms: number | null
          matched_rule_codes: string[]
          owner_user_id: string
          request_id: string
          response_mode: string
          rule_pack_id: string
        }
        Insert: {
          agent_session_id?: string | null
          algorithm_key?: string
          algorithm_version?: string
          approved_copy_key?: string | null
          care_space_id: string
          child_id: string
          copy_digest_sha256?: string | null
          created_at?: string
          decision: string
          decision_sha256?: string
          evaluated_at?: string
          evaluation_version?: string
          id?: string
          input_fingerprint?: string
          latency_ms?: number | null
          matched_rule_codes?: string[]
          owner_user_id: string
          request_id: string
          response_mode: string
          rule_pack_id: string
        }
        Update: {
          agent_session_id?: string | null
          algorithm_key?: string
          algorithm_version?: string
          approved_copy_key?: string | null
          care_space_id?: string
          child_id?: string
          copy_digest_sha256?: string | null
          created_at?: string
          decision?: string
          decision_sha256?: string
          evaluated_at?: string
          evaluation_version?: string
          id?: string
          input_fingerprint?: string
          latency_ms?: number | null
          matched_rule_codes?: string[]
          owner_user_id?: string
          request_id?: string
          response_mode?: string
          rule_pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_evaluations_agent_session_id_fkey"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_evaluations_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "safety_evaluations_owner_fk"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "safety_evaluations_rule_pack_id_fkey"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_evaluations_session_scope_fk"
            columns: ["agent_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      screening_sessions: {
        Row: {
          care_space_id: string
          child_id: string
          completed_at: string | null
          created_at: string
          framework_id: string
          id: string
          performed_by_user_id: string
          performer_role: string
          responses: Json
          started_at: string
          status: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          completed_at?: string | null
          created_at?: string
          framework_id: string
          id?: string
          performed_by_user_id: string
          performer_role: string
          responses?: Json
          started_at?: string
          status: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          completed_at?: string | null
          created_at?: string
          framework_id?: string
          id?: string
          performed_by_user_id?: string
          performer_role?: string
          responses?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_session_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "screening_sessions_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "development_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_executions: {
        Row: {
          agent_session_id: string
          authorization_scope: Json
          care_space_id: string
          child_id: string
          command_id: string | null
          completed_at: string | null
          confirmation_status: string
          created_at: string
          execution_status: string
          id: string
          idempotency_key: string
          latency_ms: number | null
          message_id: string | null
          redacted_input: Json
          redacted_result: Json
          started_at: string
          tool_name: string
          tool_version: string
        }
        Insert: {
          agent_session_id: string
          authorization_scope: Json
          care_space_id: string
          child_id: string
          command_id?: string | null
          completed_at?: string | null
          confirmation_status: string
          created_at?: string
          execution_status: string
          id?: string
          idempotency_key: string
          latency_ms?: number | null
          message_id?: string | null
          redacted_input?: Json
          redacted_result?: Json
          started_at?: string
          tool_name: string
          tool_version: string
        }
        Update: {
          agent_session_id?: string
          authorization_scope?: Json
          care_space_id?: string
          child_id?: string
          command_id?: string | null
          completed_at?: string | null
          confirmation_status?: string
          created_at?: string
          execution_status?: string
          id?: string
          idempotency_key?: string
          latency_ms?: number | null
          message_id?: string | null
          redacted_input?: Json
          redacted_result?: Json
          started_at?: string
          tool_name?: string
          tool_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_executions_agent_session_id_fkey"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_executions_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "tool_executions_command_scope_fk"
            columns: ["command_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_commands"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "tool_executions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_executions_session_scope_fk"
            columns: ["agent_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          capability: string
          care_space_id: string
          child_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          metadata: Json
          occurred_at: string
          quantity: number
        }
        Insert: {
          capability: string
          care_space_id: string
          child_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          metadata?: Json
          occurred_at?: string
          quantity: number
        }
        Update: {
          capability?: string
          care_space_id?: string
          child_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          occurred_at?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_care_space_id_fkey"
            columns: ["care_space_id"]
            isOneToOne: false
            referencedRelation: "care_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      vaccination_assessments: {
        Row: {
          as_of_date: string
          assessed_at: string
          care_space_id: string
          child_id: string
          created_at: string
          due_from: string | null
          due_until: string | null
          evidence_administration_ids: string[]
          explanation_code: string
          id: string
          rule_id: string
          schedule_id: string
          status: string
        }
        Insert: {
          as_of_date: string
          assessed_at?: string
          care_space_id: string
          child_id: string
          created_at?: string
          due_from?: string | null
          due_until?: string | null
          evidence_administration_ids?: string[]
          explanation_code: string
          id?: string
          rule_id: string
          schedule_id: string
          status: string
        }
        Update: {
          as_of_date?: string
          assessed_at?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          due_from?: string | null
          due_until?: string | null
          evidence_administration_ids?: string[]
          explanation_code?: string
          id?: string
          rule_id?: string
          schedule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccination_assessment_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "vaccination_assessments_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "immunization_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccination_assessments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "immunization_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccine_administration_antigens: {
        Row: {
          antigen_id: string
          vaccine_administration_id: string
        }
        Insert: {
          antigen_id: string
          vaccine_administration_id: string
        }
        Update: {
          antigen_id?: string
          vaccine_administration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccine_administration_antigens_antigen_id_fkey"
            columns: ["antigen_id"]
            isOneToOne: false
            referencedRelation: "vaccine_antigens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccine_administration_antigens_vaccine_administration_id_fkey"
            columns: ["vaccine_administration_id"]
            isOneToOne: false
            referencedRelation: "vaccine_administrations"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccine_administrations: {
        Row: {
          administered_on: string
          administration_site: string | null
          care_space_id: string
          child_id: string
          confirmation_status: string
          country_code: string
          created_at: string
          dose_label: string | null
          id: string
          idempotency_key: string
          lot_number: string | null
          provenance_type: string
          provider_name: string | null
          recorded_by: string
          updated_at: string
          vaccine_product_id: string | null
        }
        Insert: {
          administered_on: string
          administration_site?: string | null
          care_space_id: string
          child_id: string
          confirmation_status?: string
          country_code: string
          created_at?: string
          dose_label?: string | null
          id?: string
          idempotency_key: string
          lot_number?: string | null
          provenance_type: string
          provider_name?: string | null
          recorded_by: string
          updated_at?: string
          vaccine_product_id?: string | null
        }
        Update: {
          administered_on?: string
          administration_site?: string | null
          care_space_id?: string
          child_id?: string
          confirmation_status?: string
          country_code?: string
          created_at?: string
          dose_label?: string | null
          id?: string
          idempotency_key?: string
          lot_number?: string | null
          provenance_type?: string
          provider_name?: string | null
          recorded_by?: string
          updated_at?: string
          vaccine_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccine_administration_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "vaccine_administrations_vaccine_product_id_fkey"
            columns: ["vaccine_product_id"]
            isOneToOne: false
            referencedRelation: "vaccine_products"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccine_antigens: {
        Row: {
          active: boolean
          antigen_code: string
          created_at: string
          disease_group: string | null
          display_name_en: string
          display_name_es: string
          id: string
        }
        Insert: {
          active?: boolean
          antigen_code: string
          created_at?: string
          disease_group?: string | null
          display_name_en: string
          display_name_es: string
          id?: string
        }
        Update: {
          active?: boolean
          antigen_code?: string
          created_at?: string
          disease_group?: string | null
          display_name_en?: string
          display_name_es?: string
          id?: string
        }
        Relationships: []
      }
      vaccine_product_antigens: {
        Row: {
          antigen_id: string
          vaccine_product_id: string
        }
        Insert: {
          antigen_id: string
          vaccine_product_id: string
        }
        Update: {
          antigen_id?: string
          vaccine_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccine_product_antigens_antigen_id_fkey"
            columns: ["antigen_id"]
            isOneToOne: false
            referencedRelation: "vaccine_antigens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccine_product_antigens_vaccine_product_id_fkey"
            columns: ["vaccine_product_id"]
            isOneToOne: false
            referencedRelation: "vaccine_products"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccine_products: {
        Row: {
          active: boolean
          brand_name: string | null
          country_code: string
          created_at: string
          id: string
          manufacturer: string | null
          presentation: string | null
          product_code: string
          regulatory_identifier: string | null
        }
        Insert: {
          active?: boolean
          brand_name?: string | null
          country_code: string
          created_at?: string
          id?: string
          manufacturer?: string | null
          presentation?: string | null
          product_code: string
          regulatory_identifier?: string | null
        }
        Update: {
          active?: boolean
          brand_name?: string | null
          country_code?: string
          created_at?: string
          id?: string
          manufacturer?: string | null
          presentation?: string | null
          product_code?: string
          regulatory_identifier?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bind_owned_eve_session: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_eve_session_id: string
          p_product_session_id: string
        }
        Returns: {
          authorization_expires_at: string
          authorization_version: string
          care_space_id: string
          child_id: string
          eve_session_id: string
          last_sequence: number
          owner_user_id: string
          product_session_id: string
          status: string
        }[]
      }
      create_owned_agent_session: {
        Args: {
          p_authorization_expires_at: string
          p_authorization_version: string
          p_care_space_id: string
          p_channel: string
          p_child_id: string
          p_initial_configuration?: Json
          p_initial_model: string
        }
        Returns: {
          authorization_expires_at: string
          authorization_version: string
          care_space_id: string
          child_id: string
          eve_session_id: string
          last_sequence: number
          owner_user_id: string
          product_session_id: string
          status: string
        }[]
      }
      match_clinical_memory: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          memory_item_id: string
          memory_type: string
          similarity: number
          structured_content: Json
        }[]
      }
      record_safety_evaluation: {
        Args: {
          p_agent_session_id: string
          p_algorithm_key: string
          p_algorithm_version: string
          p_approved_copy_key: string
          p_care_space_id: string
          p_child_id: string
          p_copy_digest_sha256: string
          p_decision: string
          p_decision_sha256: string
          p_evaluation_version: string
          p_input_fingerprint: string
          p_latency_ms: number
          p_matched_rule_codes: string[]
          p_owner_user_id: string
          p_request_id: string
          p_response_mode: string
          p_rule_pack_id: string
        }
        Returns: {
          created: boolean
          evaluation_id: string
        }[]
      }
      refresh_owned_agent_session_lease: {
        Args: {
          p_authorization_expires_at: string
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_product_session_id: string
        }
        Returns: {
          authorization_expires_at: string
          authorization_version: string
          care_space_id: string
          child_id: string
          eve_session_id: string
          last_sequence: number
          owner_user_id: string
          product_session_id: string
          status: string
        }[]
      }
      resolve_authorized_child_scope: {
        Args: { p_child_id: string; p_required_permissions: string[] }
        Returns: {
          access_valid_until: string
          access_version: number
          care_space_id: string
          child_id: string
          country_of_care: string
          membership_valid_until: string
          membership_version: number
          permissions: string[]
          timezone: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
