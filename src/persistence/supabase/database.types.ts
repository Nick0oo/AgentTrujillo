export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          channel_cancel_operation_id: string | null
          channel_retained_from_sequence: number
          channel_terminal_event_id: string | null
          channel_terminal_sequence: number | null
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
          channel_cancel_operation_id?: string | null
          channel_retained_from_sequence?: number
          channel_terminal_event_id?: string | null
          channel_terminal_sequence?: number | null
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
          channel_cancel_operation_id?: string | null
          channel_retained_from_sequence?: number
          channel_terminal_event_id?: string | null
          channel_terminal_sequence?: number | null
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
            foreignKeyName: "agent_sessions_channel_cancel_operation_fk"
            columns: ["channel_cancel_operation_id", "id"]
            isOneToOne: false
            referencedRelation: "creciendo_cancel_commands"
            referencedColumns: ["operation_id", "agent_session_id"]
          },
          {
            foreignKeyName: "agent_sessions_channel_terminal_event_fk"
            columns: ["channel_terminal_event_id", "id"]
            isOneToOne: false
            referencedRelation: "creciendo_channel_events"
            referencedColumns: ["id", "agent_session_id"]
          },
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
          capture_policy_id: string | null
          capture_policy_version: string | null
          care_space_id: string
          child_id: string
          confirmation_sha256: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          conversion_version: string | null
          created_at: string
          device: string | null
          exclusion_reason: string | null
          hmac_key_id: string | null
          id: string
          idempotency_key: string
          input_fingerprint: string | null
          local_date: string
          measurement_method: string | null
          measurement_type: string
          normalized_unit: string
          normalized_value: number
          normalized_value_lexeme: string | null
          occurred_at: string
          original_unit: string
          original_value: number
          original_value_lexeme: string | null
          provenance_type: string
          recorded_by: string
          rounding_mode: string | null
          scope_fingerprint: string | null
          source_note: string | null
          supersedes_measurement_id: string | null
          supersession_reason: string | null
          time_zone: string
          updated_at: string
          validation_status: string
        }
        Insert: {
          capture_policy_id?: string | null
          capture_policy_version?: string | null
          care_space_id: string
          child_id: string
          confirmation_sha256?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          conversion_version?: string | null
          created_at?: string
          device?: string | null
          exclusion_reason?: string | null
          hmac_key_id?: string | null
          id?: string
          idempotency_key: string
          input_fingerprint?: string | null
          local_date: string
          measurement_method?: string | null
          measurement_type: string
          normalized_unit: string
          normalized_value: number
          normalized_value_lexeme?: string | null
          occurred_at: string
          original_unit: string
          original_value: number
          original_value_lexeme?: string | null
          provenance_type: string
          recorded_by: string
          rounding_mode?: string | null
          scope_fingerprint?: string | null
          source_note?: string | null
          supersedes_measurement_id?: string | null
          supersession_reason?: string | null
          time_zone: string
          updated_at?: string
          validation_status?: string
        }
        Update: {
          capture_policy_id?: string | null
          capture_policy_version?: string | null
          care_space_id?: string
          child_id?: string
          confirmation_sha256?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          conversion_version?: string | null
          created_at?: string
          device?: string | null
          exclusion_reason?: string | null
          hmac_key_id?: string | null
          id?: string
          idempotency_key?: string
          input_fingerprint?: string | null
          local_date?: string
          measurement_method?: string | null
          measurement_type?: string
          normalized_unit?: string
          normalized_value?: number
          normalized_value_lexeme?: string | null
          occurred_at?: string
          original_unit?: string
          original_value?: number
          original_value_lexeme?: string | null
          provenance_type?: string
          recorded_by?: string
          rounding_mode?: string | null
          scope_fingerprint?: string | null
          source_note?: string | null
          supersedes_measurement_id?: string | null
          supersession_reason?: string | null
          time_zone?: string
          updated_at?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "anthropometric_measurements_supersedes_measurement_id_fkey"
            columns: ["supersedes_measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anthropometric_measurements_supersedes_measurement_id_fkey"
            columns: ["supersedes_measurement_id"]
            isOneToOne: false
            referencedRelation: "growth_series_points"
            referencedColumns: ["superseded_by_measurement_id"]
          },
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
          approval_provenance: string
          approver_name: string
          approver_role: string
          approver_subject: string | null
          approver_user_id: string | null
          artifact_sha256: string
          attestation_version: number
          conveyance_record_sha256: string | null
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
          approval_provenance?: string
          approver_name: string
          approver_role: string
          approver_subject?: string | null
          approver_user_id?: string | null
          artifact_sha256: string
          attestation_version?: number
          conveyance_record_sha256?: string | null
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
          approval_provenance?: string
          approver_name?: string
          approver_role?: string
          approver_subject?: string | null
          approver_user_id?: string | null
          artifact_sha256?: string
          attestation_version?: number
          conveyance_record_sha256?: string | null
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
      clinical_memory_candidate_decisions: {
        Row: {
          candidate_id: string
          candidate_input_sha256: string
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          decided_at: string
          decided_by: string
          decision: string
          id: string
          idempotency_key: string
          memory_item_id: string | null
        }
        Insert: {
          candidate_id: string
          candidate_input_sha256: string
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          idempotency_key: string
          memory_item_id?: string | null
        }
        Update: {
          candidate_id?: string
          candidate_input_sha256?: string
          care_space_id?: string
          child_id?: string
          confirmation_sha256?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          idempotency_key?: string
          memory_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_candidate_decisions_actor_fk"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_memory_candidate_decisions_candidate_scope_fk"
            columns: ["candidate_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_candidates"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "clinical_memory_candidate_decisions_memory_scope_fk"
            columns: ["memory_item_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_memory_candidates: {
        Row: {
          candidate_text: string
          care_space_id: string
          child_id: string
          created_at: string
          created_by: string
          expires_at: string
          extraction_confidence: number
          id: string
          idempotency_key: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          sensitivity: string
          source_message_id: string | null
          source_session_id: string | null
          source_span_end: number
          source_span_start: number
        }
        Insert: {
          candidate_text: string
          care_space_id: string
          child_id: string
          created_at?: string
          created_by: string
          expires_at: string
          extraction_confidence: number
          id?: string
          idempotency_key: string
          input_sha256: string
          lifecycle?: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          sensitivity: string
          source_message_id?: string | null
          source_session_id?: string | null
          source_span_end: number
          source_span_start: number
        }
        Update: {
          candidate_text?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          extraction_confidence?: number
          id?: string
          idempotency_key?: string
          input_sha256?: string
          lifecycle?: string
          memory_type?: string
          provenance_captured_at?: string
          provenance_source_id?: string
          provenance_type?: string
          sensitivity?: string
          source_message_id?: string | null
          source_session_id?: string | null
          source_span_end?: number
          source_span_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_candidates_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_memory_candidates_scope_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "clinical_memory_candidates_source_message_scope_fk"
            columns: ["source_message_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "clinical_memory_candidates_source_session_scope_fk"
            columns: ["source_session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_memory_deletion_requests: {
        Row: {
          care_space_id: string
          child_id: string
          completed_at: string | null
          id: string
          idempotency_key: string
          legal_hold_id: string | null
          memory_item_id: string
          proof_sha256: string | null
          request_kind: string
          request_sha256: string
          requested_at: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          completed_at?: string | null
          id: string
          idempotency_key: string
          legal_hold_id?: string | null
          memory_item_id: string
          proof_sha256?: string | null
          request_kind: string
          request_sha256: string
          requested_at?: string
          requested_by?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          completed_at?: string | null
          id?: string
          idempotency_key?: string
          legal_hold_id?: string | null
          memory_item_id?: string
          proof_sha256?: string | null
          request_kind?: string
          request_sha256?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_deletion_requests_legal_hold_id_fkey"
            columns: ["legal_hold_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_legal_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_memory_deletion_requests_scope_fk"
            columns: ["memory_item_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
            referencedColumns: ["id", "care_space_id", "child_id"]
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
          confirmation_sha256: string
          confirmation_status: string
          confirmed_at: string
          content_sha256: string
          created_at: string
          created_by: string | null
          extraction_confidence: number
          id: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          retrieval_eligibility: string
          searchable_text: string
          sensitivity: string
          source_message_id: string | null
          source_session_id: string | null
          source_span_end: number
          source_span_start: number
          structured_content: Json
          supersedes_id: string | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          confirmation_status?: string
          confirmed_at: string
          content_sha256: string
          created_at?: string
          created_by?: string | null
          extraction_confidence: number
          id?: string
          input_sha256: string
          lifecycle?: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          retrieval_eligibility?: string
          searchable_text: string
          sensitivity: string
          source_message_id?: string | null
          source_session_id?: string | null
          source_span_end: number
          source_span_start: number
          structured_content: Json
          supersedes_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          care_space_id?: string
          child_id?: string
          confirmation_sha256?: string
          confirmation_status?: string
          confirmed_at?: string
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          extraction_confidence?: number
          id?: string
          input_sha256?: string
          lifecycle?: string
          memory_type?: string
          provenance_captured_at?: string
          provenance_source_id?: string
          provenance_type?: string
          retrieval_eligibility?: string
          searchable_text?: string
          sensitivity?: string
          source_message_id?: string | null
          source_session_id?: string | null
          source_span_end?: number
          source_span_start?: number
          structured_content?: Json
          supersedes_id?: string | null
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
          {
            foreignKeyName: "clinical_memory_items_supersedes_scope_fk"
            columns: ["supersedes_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_memory_legal_holds: {
        Row: {
          basis_code: string
          basis_sha256: string
          care_space_id: string
          child_id: string
          created_at: string
          expires_at: string | null
          id: string
          imposed_by: string
          memory_item_id: string
          released_at: string | null
          starts_at: string
        }
        Insert: {
          basis_code: string
          basis_sha256: string
          care_space_id: string
          child_id: string
          created_at?: string
          expires_at?: string | null
          id: string
          imposed_by: string
          memory_item_id: string
          released_at?: string | null
          starts_at: string
        }
        Update: {
          basis_code?: string
          basis_sha256?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          imposed_by?: string
          memory_item_id?: string
          released_at?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_legal_holds_scope_fk"
            columns: ["memory_item_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
        ]
      }
      clinical_memory_outbox_events: {
        Row: {
          candidate_id: string
          candidate_input_sha256: string
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          content_sha256: string | null
          decided_by: string
          decision_id: string
          event_kind: string
          event_payload_sha256: string
          event_version: number
          id: string
          idempotency_key: string
          memory_item_id: string | null
          occurred_at: string
          policy_sha256: string
          published_at: string | null
        }
        Insert: {
          candidate_id: string
          candidate_input_sha256: string
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          content_sha256?: string | null
          decided_by: string
          decision_id: string
          event_kind: string
          event_payload_sha256: string
          event_version?: number
          id?: string
          idempotency_key: string
          memory_item_id?: string | null
          occurred_at?: string
          policy_sha256: string
          published_at?: string | null
        }
        Update: {
          candidate_id?: string
          candidate_input_sha256?: string
          care_space_id?: string
          child_id?: string
          confirmation_sha256?: string
          content_sha256?: string | null
          decided_by?: string
          decision_id?: string
          event_kind?: string
          event_payload_sha256?: string
          event_version?: number
          id?: string
          idempotency_key?: string
          memory_item_id?: string | null
          occurred_at?: string
          policy_sha256?: string
          published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_memory_outbox_candidate_scope_fk"
            columns: ["candidate_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_candidates"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "clinical_memory_outbox_decision_scope_fk"
            columns: ["decision_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_candidate_decisions"
            referencedColumns: ["id", "care_space_id", "child_id"]
          },
          {
            foreignKeyName: "clinical_memory_outbox_events_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "guardian_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_memory_outbox_memory_scope_fk"
            columns: ["memory_item_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "clinical_memory_items"
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
      creciendo_cancel_commands: {
        Row: {
          accepted_at: string
          agent_session_id: string
          care_space_id: string
          child_id: string
          final_effect_state: string | null
          final_outcome: string | null
          finalized_at: string | null
          idempotency_key_sha256: string
          operation_id: string
          owner_user_id: string
          reason: string
          request_sha256: string
          status: string
          target_turn_id: string
          terminal_event_id: string | null
        }
        Insert: {
          accepted_at?: string
          agent_session_id: string
          care_space_id: string
          child_id: string
          final_effect_state?: string | null
          final_outcome?: string | null
          finalized_at?: string | null
          idempotency_key_sha256: string
          operation_id: string
          owner_user_id: string
          reason: string
          request_sha256: string
          status?: string
          target_turn_id: string
          terminal_event_id?: string | null
        }
        Update: {
          accepted_at?: string
          agent_session_id?: string
          care_space_id?: string
          child_id?: string
          final_effect_state?: string | null
          final_outcome?: string | null
          finalized_at?: string | null
          idempotency_key_sha256?: string
          operation_id?: string
          owner_user_id?: string
          reason?: string
          request_sha256?: string
          status?: string
          target_turn_id?: string
          terminal_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creciendo_cancel_commands_event_fk"
            columns: ["terminal_event_id", "agent_session_id"]
            isOneToOne: false
            referencedRelation: "creciendo_channel_events"
            referencedColumns: ["id", "agent_session_id"]
          },
          {
            foreignKeyName: "creciendo_cancel_commands_session_scope_fk"
            columns: [
              "agent_session_id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: [
              "id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
          },
        ]
      }
      creciendo_channel_events: {
        Row: {
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at: string
          event_type: string
          event_version: string
          id: string
          occurred_at: string
          owner_user_id: string
          payload: Json
          payload_sha256: string
          sequence: number
          source_id: string
          source_kind: string
          terminal: boolean
          turn_id: string
        }
        Insert: {
          agent_session_id: string
          care_space_id: string
          child_id: string
          created_at?: string
          event_type: string
          event_version?: string
          id?: string
          occurred_at: string
          owner_user_id: string
          payload: Json
          payload_sha256: string
          sequence: number
          source_id: string
          source_kind: string
          terminal: boolean
          turn_id: string
        }
        Update: {
          agent_session_id?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          event_type?: string
          event_version?: string
          id?: string
          occurred_at?: string
          owner_user_id?: string
          payload?: Json
          payload_sha256?: string
          sequence?: number
          source_id?: string
          source_kind?: string
          terminal?: boolean
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creciendo_channel_events_session_scope_fk"
            columns: [
              "agent_session_id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: [
              "id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
          },
        ]
      }
      creciendo_session_commands: {
        Row: {
          accepted_at: string
          agent_session_id: string
          care_space_id: string
          child_id: string
          command_kind: string
          id: string
          idempotency_key_sha256: string
          message_id: string
          owner_user_id: string
          parts_sha256: string | null
          request_sha256: string
          safety_receipt_sha256: string | null
          terminal_event_id: string | null
          terminal_payload_sha256: string | null
          turn_id: string
        }
        Insert: {
          accepted_at?: string
          agent_session_id: string
          care_space_id: string
          child_id: string
          command_kind: string
          id?: string
          idempotency_key_sha256: string
          message_id: string
          owner_user_id: string
          parts_sha256?: string | null
          request_sha256: string
          safety_receipt_sha256?: string | null
          terminal_event_id?: string | null
          terminal_payload_sha256?: string | null
          turn_id: string
        }
        Update: {
          accepted_at?: string
          agent_session_id?: string
          care_space_id?: string
          child_id?: string
          command_kind?: string
          id?: string
          idempotency_key_sha256?: string
          message_id?: string
          owner_user_id?: string
          parts_sha256?: string | null
          request_sha256?: string
          safety_receipt_sha256?: string | null
          terminal_event_id?: string | null
          terminal_payload_sha256?: string | null
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creciendo_session_commands_event_fk"
            columns: ["terminal_event_id", "agent_session_id"]
            isOneToOne: false
            referencedRelation: "creciendo_channel_events"
            referencedColumns: ["id", "agent_session_id"]
          },
          {
            foreignKeyName: "creciendo_session_commands_session_scope_fk"
            columns: [
              "agent_session_id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: [
              "id",
              "care_space_id",
              "child_id",
              "owner_user_id",
            ]
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
          confirmation_sha256: string | null
          confirmed_at: string | null
          created_at: string
          domain: string
          id: string
          idempotency_key: string | null
          input_sha256: string | null
          milestone_id: string | null
          observation: string
          observed_on: string
          payload_sha256: string | null
          provenance_type: string
          recorded_by: string
          status: string
          supersedes_observation_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          confirmation_sha256?: string | null
          confirmed_at?: string | null
          created_at?: string
          domain: string
          id?: string
          idempotency_key?: string | null
          input_sha256?: string | null
          milestone_id?: string | null
          observation: string
          observed_on: string
          payload_sha256?: string | null
          provenance_type: string
          recorded_by: string
          status?: string
          supersedes_observation_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          confirmation_sha256?: string | null
          confirmed_at?: string | null
          created_at?: string
          domain?: string
          id?: string
          idempotency_key?: string | null
          input_sha256?: string | null
          milestone_id?: string | null
          observation?: string
          observed_on?: string
          payload_sha256?: string | null
          provenance_type?: string
          recorded_by?: string
          status?: string
          supersedes_observation_id?: string | null
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
          {
            foreignKeyName: "development_observations_supersedes_scope_fk"
            columns: ["care_space_id", "child_id", "supersedes_observation_id"]
            isOneToOne: false
            referencedRelation: "development_observations"
            referencedColumns: ["care_space_id", "child_id", "id"]
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
      document_callback_events: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          document_id: string
          event_type: string
          failure_code: string | null
          id: string
          observed_bucket_id: string
          observed_mime_type: string
          observed_object_path: string
          observed_sha256: string
          observed_size_bytes: number
          occurred_at: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          raw_body_sha256: string
          received_at: string
          result_metadata: Json
          scan_result: string | null
          signature_key_id: string
          status: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          document_id: string
          event_type: string
          failure_code?: string | null
          id?: string
          observed_bucket_id: string
          observed_mime_type: string
          observed_object_path: string
          observed_sha256: string
          observed_size_bytes: number
          occurred_at: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
          raw_body_sha256: string
          received_at?: string
          result_metadata?: Json
          scan_result?: string | null
          signature_key_id: string
          status: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          document_id?: string
          event_type?: string
          failure_code?: string | null
          id?: string
          observed_bucket_id?: string
          observed_mime_type?: string
          observed_object_path?: string
          observed_sha256?: string
          observed_size_bytes?: number
          occurred_at?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          raw_body_sha256?: string
          received_at?: string
          result_metadata?: Json
          scan_result?: string | null
          signature_key_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_callback_document_scope_fk"
            columns: ["care_space_id", "child_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["care_space_id", "child_id", "id"]
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
          declared_mime_type: string
          deleted_at: string | null
          detected_mime_type: string | null
          document_type: string
          expected_sha256: string
          expected_size_bytes: number
          extraction_metadata: Json
          id: string
          object_path: string
          original_filename: string | null
          processing_status: string
          provenance_type: string
          purpose: string
          reservation_cancelled_at: string | null
          reservation_expires_at: string
          reservation_idempotency_key: string
          reservation_nonce_sha256: string
          reservation_request_sha256: string
          reserved_at: string
          retention_class: string
          retention_until: string | null
          sha256: string
          size_bytes: number
          storage_status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          bucket_id: string
          care_space_id: string
          child_id?: string | null
          created_at?: string
          declared_mime_type: string
          deleted_at?: string | null
          detected_mime_type?: string | null
          document_type: string
          expected_sha256: string
          expected_size_bytes: number
          extraction_metadata?: Json
          id?: string
          object_path: string
          original_filename?: string | null
          processing_status?: string
          provenance_type: string
          purpose: string
          reservation_cancelled_at?: string | null
          reservation_expires_at: string
          reservation_idempotency_key: string
          reservation_nonce_sha256: string
          reservation_request_sha256: string
          reserved_at: string
          retention_class: string
          retention_until?: string | null
          sha256: string
          size_bytes: number
          storage_status: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          bucket_id?: string
          care_space_id?: string
          child_id?: string | null
          created_at?: string
          declared_mime_type?: string
          deleted_at?: string | null
          detected_mime_type?: string | null
          document_type?: string
          expected_sha256?: string
          expected_size_bytes?: number
          extraction_metadata?: Json
          id?: string
          object_path?: string
          original_filename?: string | null
          processing_status?: string
          provenance_type?: string
          purpose?: string
          reservation_cancelled_at?: string | null
          reservation_expires_at?: string
          reservation_idempotency_key?: string
          reservation_nonce_sha256?: string
          reservation_request_sha256?: string
          reserved_at?: string
          retention_class?: string
          retention_until?: string | null
          sha256?: string
          size_bytes?: number
          storage_status?: string
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
      dose_validation_ingredients: {
        Row: {
          arithmetic_trace: Json
          care_space_id: string
          child_id: string
          converted_amount_lexeme: string | null
          converted_unit: string | null
          created_at: string
          declared_amount_lexeme: string | null
          declared_unit: string | null
          id: string
          ingredient_code: string
          validation_id: string
        }
        Insert: {
          arithmetic_trace?: Json
          care_space_id: string
          child_id: string
          converted_amount_lexeme?: string | null
          converted_unit?: string | null
          created_at?: string
          declared_amount_lexeme?: string | null
          declared_unit?: string | null
          id?: string
          ingredient_code: string
          validation_id: string
        }
        Update: {
          arithmetic_trace?: Json
          care_space_id?: string
          child_id?: string
          converted_amount_lexeme?: string | null
          converted_unit?: string | null
          created_at?: string
          declared_amount_lexeme?: string | null
          declared_unit?: string | null
          id?: string
          ingredient_code?: string
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dose_validation_ingredient_scope_fk"
            columns: ["care_space_id", "child_id", "validation_id"]
            isOneToOne: false
            referencedRelation: "dose_validations"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
          {
            foreignKeyName: "dose_validation_ingredients_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "dose_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      dose_validation_sources: {
        Row: {
          artifact_sha256: string
          care_space_id: string
          child_id: string
          created_at: string
          id: string
          source_id: string
          source_kind: string
          source_uri: string
          source_version: string
          validation_id: string
        }
        Insert: {
          artifact_sha256: string
          care_space_id: string
          child_id: string
          created_at?: string
          id?: string
          source_id: string
          source_kind: string
          source_uri: string
          source_version: string
          validation_id: string
        }
        Update: {
          artifact_sha256?: string
          care_space_id?: string
          child_id?: string
          created_at?: string
          id?: string
          source_id?: string
          source_kind?: string
          source_uri?: string
          source_version?: string
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dose_validation_source_scope_fk"
            columns: ["care_space_id", "child_id", "validation_id"]
            isOneToOne: false
            referencedRelation: "dose_validations"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
          {
            foreignKeyName: "dose_validation_sources_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "dose_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      dose_validations: {
        Row: {
          algorithm_version: string | null
          artifact_sha256: string | null
          care_space_id: string
          child_id: string
          created_at: string
          decision_digest: string | null
          declared_input: Json
          dose_limit_id: string | null
          explanation_codes: string[]
          formulary_version_id: string | null
          id: string
          input_digest: string | null
          medication_concept_id: string | null
          package_version: string | null
          request_id: string
          result: string
          source_evidence: Json
          validated_at: string
          validated_by: string | null
          vocabulary_version: string | null
          weight_measurement_id: string | null
        }
        Insert: {
          algorithm_version?: string | null
          artifact_sha256?: string | null
          care_space_id: string
          child_id: string
          created_at?: string
          decision_digest?: string | null
          declared_input: Json
          dose_limit_id?: string | null
          explanation_codes?: string[]
          formulary_version_id?: string | null
          id?: string
          input_digest?: string | null
          medication_concept_id?: string | null
          package_version?: string | null
          request_id: string
          result: string
          source_evidence: Json
          validated_at?: string
          validated_by?: string | null
          vocabulary_version?: string | null
          weight_measurement_id?: string | null
        }
        Update: {
          algorithm_version?: string | null
          artifact_sha256?: string | null
          care_space_id?: string
          child_id?: string
          created_at?: string
          decision_digest?: string | null
          declared_input?: Json
          dose_limit_id?: string | null
          explanation_codes?: string[]
          formulary_version_id?: string | null
          id?: string
          input_digest?: string | null
          medication_concept_id?: string | null
          package_version?: string | null
          request_id?: string
          result?: string
          source_evidence?: Json
          validated_at?: string
          validated_by?: string | null
          vocabulary_version?: string | null
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
          {
            foreignKeyName: "dose_validations_weight_measurement_id_fkey"
            columns: ["weight_measurement_id"]
            isOneToOne: false
            referencedRelation: "growth_series_points"
            referencedColumns: ["superseded_by_measurement_id"]
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
          age_basis: string | null
          age_policy_id: string | null
          age_policy_version: string | null
          algorithm_id: string
          algorithm_version: string | null
          assessed_at: string
          care_space_id: string
          child_id: string
          chronological_age_days: number
          companion_measurement_id: string | null
          corrected_age_days: number | null
          correction_applied: boolean
          created_at: string
          dataset_digest: string | null
          decision_digest: string | null
          id: string
          indicator: string
          input_digest: string | null
          interpretation: string | null
          measurement_id: string
          measurement_input_fingerprint: string | null
          percentile: number | null
          percentile_lexeme: string | null
          result_status: string
          rule_pack_id: string
          standard_key: string
          standard_version: string | null
          transition_reason: string | null
          warnings: string[]
          z_score: number | null
          z_score_lexeme: string | null
        }
        Insert: {
          age_basis?: string | null
          age_policy_id?: string | null
          age_policy_version?: string | null
          algorithm_id: string
          algorithm_version?: string | null
          assessed_at?: string
          care_space_id: string
          child_id: string
          chronological_age_days: number
          companion_measurement_id?: string | null
          corrected_age_days?: number | null
          correction_applied?: boolean
          created_at?: string
          dataset_digest?: string | null
          decision_digest?: string | null
          id?: string
          indicator: string
          input_digest?: string | null
          interpretation?: string | null
          measurement_id: string
          measurement_input_fingerprint?: string | null
          percentile?: number | null
          percentile_lexeme?: string | null
          result_status: string
          rule_pack_id: string
          standard_key: string
          standard_version?: string | null
          transition_reason?: string | null
          warnings?: string[]
          z_score?: number | null
          z_score_lexeme?: string | null
        }
        Update: {
          age_basis?: string | null
          age_policy_id?: string | null
          age_policy_version?: string | null
          algorithm_id?: string
          algorithm_version?: string | null
          assessed_at?: string
          care_space_id?: string
          child_id?: string
          chronological_age_days?: number
          companion_measurement_id?: string | null
          corrected_age_days?: number | null
          correction_applied?: boolean
          created_at?: string
          dataset_digest?: string | null
          decision_digest?: string | null
          id?: string
          indicator?: string
          input_digest?: string | null
          interpretation?: string | null
          measurement_id?: string
          measurement_input_fingerprint?: string | null
          percentile?: number | null
          percentile_lexeme?: string | null
          result_status?: string
          rule_pack_id?: string
          standard_key?: string
          standard_version?: string | null
          transition_reason?: string | null
          warnings?: string[]
          z_score?: number | null
          z_score_lexeme?: string | null
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
            foreignKeyName: "growth_assessment_companion_scope_fk"
            columns: ["care_space_id", "companion_measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "growth_assessment_measurement_scope_fk"
            columns: ["care_space_id", "measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
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
            foreignKeyName: "growth_assessments_companion_measurement_id_fkey"
            columns: ["companion_measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_assessments_companion_measurement_id_fkey"
            columns: ["companion_measurement_id"]
            isOneToOne: false
            referencedRelation: "growth_series_points"
            referencedColumns: ["superseded_by_measurement_id"]
          },
          {
            foreignKeyName: "growth_assessments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_assessments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "growth_series_points"
            referencedColumns: ["superseded_by_measurement_id"]
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
          grace_period: Json | null
          id: string
          minimum_age_days: number | null
          minimum_age_interval: Json | null
          minimum_interval: Json | null
          minimum_interval_days: number | null
          recommended_interval: Json | null
          recommended_interval_days: number | null
          rule_code: string | null
          rule_kind: string | null
          schedule_id: string
          series_code: string
          source_reference_ids: string[]
          target_age_days: number | null
          target_age_end_days: number | null
          target_age_interval: Json | null
          target_age_until_interval: Json | null
        }
        Insert: {
          antigen_id: string
          catch_up?: boolean
          contraindication_review_required?: boolean
          created_at?: string
          dose_code: string
          dose_number?: number | null
          eligibility_criteria?: Json
          grace_period?: Json | null
          id?: string
          minimum_age_days?: number | null
          minimum_age_interval?: Json | null
          minimum_interval?: Json | null
          minimum_interval_days?: number | null
          recommended_interval?: Json | null
          recommended_interval_days?: number | null
          rule_code?: string | null
          rule_kind?: string | null
          schedule_id: string
          series_code: string
          source_reference_ids?: string[]
          target_age_days?: number | null
          target_age_end_days?: number | null
          target_age_interval?: Json | null
          target_age_until_interval?: Json | null
        }
        Update: {
          antigen_id?: string
          catch_up?: boolean
          contraindication_review_required?: boolean
          created_at?: string
          dose_code?: string
          dose_number?: number | null
          eligibility_criteria?: Json
          grace_period?: Json | null
          id?: string
          minimum_age_days?: number | null
          minimum_age_interval?: Json | null
          minimum_interval?: Json | null
          minimum_interval_days?: number | null
          recommended_interval?: Json | null
          recommended_interval_days?: number | null
          rule_code?: string | null
          rule_kind?: string | null
          schedule_id?: string
          series_code?: string
          source_reference_ids?: string[]
          target_age_days?: number | null
          target_age_end_days?: number | null
          target_age_interval?: Json | null
          target_age_until_interval?: Json | null
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
          catalog_version: string | null
          coding_system: string
          concept_code: string
          country_code: string | null
          created_at: string
          display_name_en: string | null
          display_name_es: string
          id: string
          ingredient_name: string
          source_artifact_sha256: string | null
          source_reference_ids: string[]
        }
        Insert: {
          active?: boolean
          catalog_version?: string | null
          coding_system: string
          concept_code: string
          country_code?: string | null
          created_at?: string
          display_name_en?: string | null
          display_name_es: string
          id?: string
          ingredient_name: string
          source_artifact_sha256?: string | null
          source_reference_ids?: string[]
        }
        Update: {
          active?: boolean
          catalog_version?: string | null
          coding_system?: string
          concept_code?: string
          country_code?: string | null
          created_at?: string
          display_name_en?: string | null
          display_name_es?: string
          id?: string
          ingredient_name?: string
          source_artifact_sha256?: string | null
          source_reference_ids?: string[]
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
          input_fingerprint: string | null
          medication_plan_id: string
          medication_schedule_id: string | null
          medication_schedule_occurrence_id: string | null
          notes: string | null
          recorded_by: string
          scheduled_for: string | null
          status: string
          supersedes_intake_id: string | null
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
          input_fingerprint?: string | null
          medication_plan_id: string
          medication_schedule_id?: string | null
          medication_schedule_occurrence_id?: string | null
          notes?: string | null
          recorded_by: string
          scheduled_for?: string | null
          status: string
          supersedes_intake_id?: string | null
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
          input_fingerprint?: string | null
          medication_plan_id?: string
          medication_schedule_id?: string | null
          medication_schedule_occurrence_id?: string | null
          notes?: string | null
          recorded_by?: string
          scheduled_for?: string | null
          status?: string
          supersedes_intake_id?: string | null
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
            foreignKeyName: "medication_intake_occurrence_scope_fk"
            columns: [
              "care_space_id",
              "child_id",
              "medication_schedule_occurrence_id",
            ]
            isOneToOne: false
            referencedRelation: "medication_schedule_occurrences"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
          {
            foreignKeyName: "medication_intake_plan_scope_fk"
            columns: ["care_space_id", "child_id", "medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["care_space_id", "child_id", "id"]
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
          {
            foreignKeyName: "medication_intakes_supersedes_intake_id_fkey"
            columns: ["supersedes_intake_id"]
            isOneToOne: false
            referencedRelation: "medication_intakes"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_plans: {
        Row: {
          care_space_id: string
          child_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          declared_indication: string | null
          display_name: string
          ends_at: string | null
          id: string
          input_fingerprint: string | null
          medication_concept_id: string
          medication_presentation_id: string | null
          prescriber_name: string | null
          provenance_type: string
          recorded_by: string
          source_artifact_sha256: string | null
          source_version: string | null
          starts_at: string
          status: string
          supersedes_plan_id: string | null
          supersession_reason: string | null
          updated_at: string
          version: number
        }
        Insert: {
          care_space_id: string
          child_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declared_indication?: string | null
          display_name: string
          ends_at?: string | null
          id?: string
          input_fingerprint?: string | null
          medication_concept_id: string
          medication_presentation_id?: string | null
          prescriber_name?: string | null
          provenance_type: string
          recorded_by: string
          source_artifact_sha256?: string | null
          source_version?: string | null
          starts_at: string
          status?: string
          supersedes_plan_id?: string | null
          supersession_reason?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          care_space_id?: string
          child_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declared_indication?: string | null
          display_name?: string
          ends_at?: string | null
          id?: string
          input_fingerprint?: string | null
          medication_concept_id?: string
          medication_presentation_id?: string | null
          prescriber_name?: string | null
          provenance_type?: string
          recorded_by?: string
          source_artifact_sha256?: string | null
          source_version?: string | null
          starts_at?: string
          status?: string
          supersedes_plan_id?: string | null
          supersession_reason?: string | null
          updated_at?: string
          version?: number
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
          {
            foreignKeyName: "medication_plans_supersedes_plan_id_fkey"
            columns: ["supersedes_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
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
          dosage_form: string | null
          id: string
          medication_concept_id: string
          presentation_name: string
          regulatory_identifier: string | null
          release_type: string | null
          route: string | null
          source_reference_ids: string[]
        }
        Insert: {
          active?: boolean
          concentration_denominator: number
          concentration_denominator_unit: string
          concentration_numerator: number
          concentration_numerator_unit: string
          country_code: string
          created_at?: string
          dosage_form?: string | null
          id?: string
          medication_concept_id: string
          presentation_name: string
          regulatory_identifier?: string | null
          release_type?: string | null
          route?: string | null
          source_reference_ids?: string[]
        }
        Update: {
          active?: boolean
          concentration_denominator?: number
          concentration_denominator_unit?: string
          concentration_numerator?: number
          concentration_numerator_unit?: string
          country_code?: string
          created_at?: string
          dosage_form?: string | null
          id?: string
          medication_concept_id?: string
          presentation_name?: string
          regulatory_identifier?: string | null
          release_type?: string | null
          route?: string | null
          source_reference_ids?: string[]
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
      medication_schedule_occurrences: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          id: string
          local_date: string
          medication_plan_id: string
          medication_schedule_id: string | null
          occurrence_key: string
          plan_version: number
          scheduled_for: string
          source: string
          time_zone: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          id?: string
          local_date: string
          medication_plan_id: string
          medication_schedule_id?: string | null
          occurrence_key: string
          plan_version: number
          scheduled_for: string
          source: string
          time_zone: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          id?: string
          local_date?: string
          medication_plan_id?: string
          medication_schedule_id?: string | null
          occurrence_key?: string
          plan_version?: number
          scheduled_for?: string
          source?: string
          time_zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_occurrence_plan_scope_fk"
            columns: ["care_space_id", "child_id", "medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
          {
            foreignKeyName: "medication_occurrence_schedule_scope_fk"
            columns: ["care_space_id", "child_id", "medication_schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          dose_quantity: number
          dose_unit: string
          frequency_kind: string
          id: string
          idempotency_key: string | null
          input_fingerprint: string | null
          instructions: string | null
          interval_hours: number | null
          medication_plan_id: string
          plan_version: number
          route: string
          time_zone: string
          times_of_day: string[]
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          dose_quantity: number
          dose_unit: string
          frequency_kind: string
          id?: string
          idempotency_key?: string | null
          input_fingerprint?: string | null
          instructions?: string | null
          interval_hours?: number | null
          medication_plan_id: string
          plan_version: number
          route: string
          time_zone: string
          times_of_day?: string[]
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          dose_quantity?: number
          dose_unit?: string
          frequency_kind?: string
          id?: string
          idempotency_key?: string | null
          input_fingerprint?: string | null
          instructions?: string | null
          interval_hours?: number | null
          medication_plan_id?: string
          plan_version?: number
          route?: string
          time_zone?: string
          times_of_day?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedule_plan_scope_fk"
            columns: ["care_space_id", "child_id", "medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
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
          daily_unit: string | null
          dose_per_kg_max: number | null
          dose_per_kg_min: number | null
          dose_unit: string
          exclusions: Json
          fixed_per_dose_max: number | null
          fixed_per_dose_min: number | null
          formulary_version_id: string
          id: string
          indication_code: string | null
          max_daily_dose: number | null
          max_single_dose: number | null
          maximum_age_days: number | null
          maximum_weight_kg: number | null
          medication_concept_id: string
          medication_presentation_id: string | null
          minimum_age_days: number | null
          minimum_interval_hours: number | null
          minimum_weight_kg: number | null
          route: string
          rule_code: string | null
          source_maximum_weight: number | null
          source_minimum_weight: number | null
          source_reference_ids: string[]
          source_weight_unit: string | null
        }
        Insert: {
          created_at?: string
          daily_unit?: string | null
          dose_per_kg_max?: number | null
          dose_per_kg_min?: number | null
          dose_unit: string
          exclusions?: Json
          fixed_per_dose_max?: number | null
          fixed_per_dose_min?: number | null
          formulary_version_id: string
          id?: string
          indication_code?: string | null
          max_daily_dose?: number | null
          max_single_dose?: number | null
          maximum_age_days?: number | null
          maximum_weight_kg?: number | null
          medication_concept_id: string
          medication_presentation_id?: string | null
          minimum_age_days?: number | null
          minimum_interval_hours?: number | null
          minimum_weight_kg?: number | null
          route: string
          rule_code?: string | null
          source_maximum_weight?: number | null
          source_minimum_weight?: number | null
          source_reference_ids?: string[]
          source_weight_unit?: string | null
        }
        Update: {
          created_at?: string
          daily_unit?: string | null
          dose_per_kg_max?: number | null
          dose_per_kg_min?: number | null
          dose_unit?: string
          exclusions?: Json
          fixed_per_dose_max?: number | null
          fixed_per_dose_min?: number | null
          formulary_version_id?: string
          id?: string
          indication_code?: string | null
          max_daily_dose?: number | null
          max_single_dose?: number | null
          maximum_age_days?: number | null
          maximum_weight_kg?: number | null
          medication_concept_id?: string
          medication_presentation_id?: string | null
          minimum_age_days?: number | null
          minimum_interval_hours?: number | null
          minimum_weight_kg?: number | null
          route?: string
          rule_code?: string | null
          source_maximum_weight?: number | null
          source_minimum_weight?: number | null
          source_reference_ids?: string[]
          source_weight_unit?: string | null
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
          {
            foreignKeyName: "pediatric_dose_limits_medication_presentation_id_fkey"
            columns: ["medication_presentation_id"]
            isOneToOne: false
            referencedRelation: "medication_presentations"
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
      projection_checkpoints: {
        Row: {
          care_space_id: string
          child_id: string
          last_sequence: number
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          updated_at: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          last_sequence?: number
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          updated_at?: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          last_sequence?: number
          owner_user_id?: string
          product_session_id?: string
          projector_name?: string
          projector_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_checkpoint_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      projection_inbox: {
        Row: {
          attempt_count: number
          care_space_id: string
          child_id: string
          claimed_at: string
          completed_at: string | null
          created_at: string
          id: number
          input_sha256: string
          last_error_code: string | null
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          result_sha256: string | null
          source_event_id: string
          source_event_version: string
          source_sequence: number
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          care_space_id: string
          child_id: string
          claimed_at?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          input_sha256: string
          last_error_code?: string | null
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          result_sha256?: string | null
          source_event_id: string
          source_event_version: string
          source_sequence: number
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          care_space_id?: string
          child_id?: string
          claimed_at?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          input_sha256?: string
          last_error_code?: string | null
          owner_user_id?: string
          product_session_id?: string
          projector_name?: string
          projector_version?: string
          result_sha256?: string | null
          source_event_id?: string
          source_event_version?: string
          source_sequence?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_inbox_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
        ]
      }
      projection_quarantine: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          error_code: string | null
          id: number
          input_sha256: string
          metadata_redacted: Json
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          reason: string
          source_event_id: string
          source_event_version: string
          source_sequence: number
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          error_code?: string | null
          id?: never
          input_sha256: string
          metadata_redacted?: Json
          owner_user_id: string
          product_session_id: string
          projector_name: string
          projector_version: string
          reason: string
          source_event_id: string
          source_event_version: string
          source_sequence: number
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          error_code?: string | null
          id?: never
          input_sha256?: string
          metadata_redacted?: Json
          owner_user_id?: string
          product_session_id?: string
          projector_name?: string
          projector_version?: string
          reason?: string
          source_event_id?: string
          source_event_version?: string
          source_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "projection_quarantine_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
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
      realtime_invalidations: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          expires_at: string
          id: number
          resource_id: string
          resource_kind: string
          resource_version: number
          sequence: number
          session_id: string | null
          source_event_id: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          expires_at?: string
          id?: never
          resource_id: string
          resource_kind: string
          resource_version: number
          sequence: number
          session_id?: string | null
          source_event_id: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          expires_at?: string
          id?: never
          resource_id?: string
          resource_kind?: string
          resource_version?: number
          sequence?: number
          session_id?: string | null
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "realtime_invalidations_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "realtime_invalidations_session_fk"
            columns: ["session_id", "care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id", "care_space_id", "child_id"]
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
      vaccination_assessment_evidence: {
        Row: {
          care_space_id: string
          child_id: string
          created_at: string
          vaccination_assessment_id: string
          vaccine_administration_id: string
        }
        Insert: {
          care_space_id: string
          child_id: string
          created_at?: string
          vaccination_assessment_id: string
          vaccine_administration_id: string
        }
        Update: {
          care_space_id?: string
          child_id?: string
          created_at?: string
          vaccination_assessment_id?: string
          vaccine_administration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccination_assessment_evidence_administration_fk"
            columns: ["care_space_id", "child_id", "vaccine_administration_id"]
            isOneToOne: false
            referencedRelation: "vaccine_administrations"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
          {
            foreignKeyName: "vaccination_assessment_evidence_assessment_fk"
            columns: ["care_space_id", "child_id", "vaccination_assessment_id"]
            isOneToOne: false
            referencedRelation: "vaccination_assessments"
            referencedColumns: ["care_space_id", "child_id", "id"]
          },
        ]
      }
      vaccination_assessments: {
        Row: {
          algorithm_id: string | null
          as_of_date: string
          assessed_at: string
          assessment_run_id: string | null
          care_space_id: string
          child_id: string
          country_change_event_id: string | null
          country_code: string | null
          created_at: string
          decision_digest: string | null
          due_from: string | null
          due_until: string | null
          evidence_administration_ids: string[]
          explanation_code: string
          id: string
          input_digest: string | null
          input_fingerprint: string | null
          reevaluates_run_id: string | null
          reevaluation_run_id: string | null
          rule_id: string
          rule_pack_id: string | null
          rule_pack_version: string | null
          schedule_id: string
          source_digest: string | null
          status: string
        }
        Insert: {
          algorithm_id?: string | null
          as_of_date: string
          assessed_at?: string
          assessment_run_id?: string | null
          care_space_id: string
          child_id: string
          country_change_event_id?: string | null
          country_code?: string | null
          created_at?: string
          decision_digest?: string | null
          due_from?: string | null
          due_until?: string | null
          evidence_administration_ids?: string[]
          explanation_code: string
          id?: string
          input_digest?: string | null
          input_fingerprint?: string | null
          reevaluates_run_id?: string | null
          reevaluation_run_id?: string | null
          rule_id: string
          rule_pack_id?: string | null
          rule_pack_version?: string | null
          schedule_id: string
          source_digest?: string | null
          status: string
        }
        Update: {
          algorithm_id?: string | null
          as_of_date?: string
          assessed_at?: string
          assessment_run_id?: string | null
          care_space_id?: string
          child_id?: string
          country_change_event_id?: string | null
          country_code?: string | null
          created_at?: string
          decision_digest?: string | null
          due_from?: string | null
          due_until?: string | null
          evidence_administration_ids?: string[]
          explanation_code?: string
          id?: string
          input_digest?: string | null
          input_fingerprint?: string | null
          reevaluates_run_id?: string | null
          reevaluation_run_id?: string | null
          rule_id?: string
          rule_pack_id?: string | null
          rule_pack_version?: string | null
          schedule_id?: string
          source_digest?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccination_assessment_algorithm_fk"
            columns: ["algorithm_id"]
            isOneToOne: false
            referencedRelation: "clinical_algorithms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccination_assessment_child_fk"
            columns: ["care_space_id", "child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "vaccination_assessment_rule_pack_fk"
            columns: ["rule_pack_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_packs"
            referencedColumns: ["id"]
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
          care_space_id: string
          child_id: string
          vaccine_administration_id: string
        }
        Insert: {
          antigen_id: string
          care_space_id: string
          child_id: string
          vaccine_administration_id: string
        }
        Update: {
          antigen_id?: string
          care_space_id?: string
          child_id?: string
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
            foreignKeyName: "vaccine_administration_antigens_scope_fk"
            columns: ["care_space_id", "child_id", "vaccine_administration_id"]
            isOneToOne: false
            referencedRelation: "vaccine_administrations"
            referencedColumns: ["care_space_id", "child_id", "id"]
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
          catalog_digest: string | null
          catalog_version: string | null
          child_id: string
          confirmation_sha256: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          country_code: string
          created_at: string
          dose_label: string | null
          draft_expires_at: string | null
          id: string
          idempotency_key: string
          input_fingerprint: string | null
          lot_number: string | null
          provenance_type: string
          provider_name: string | null
          recorded_by: string
          scope_fingerprint: string | null
          source_digest: string | null
          supersedes_administration_id: string | null
          supersession_reason: string | null
          updated_at: string
          vaccine_product_id: string | null
        }
        Insert: {
          administered_on: string
          administration_site?: string | null
          care_space_id: string
          catalog_digest?: string | null
          catalog_version?: string | null
          child_id: string
          confirmation_sha256?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          country_code: string
          created_at?: string
          dose_label?: string | null
          draft_expires_at?: string | null
          id?: string
          idempotency_key: string
          input_fingerprint?: string | null
          lot_number?: string | null
          provenance_type: string
          provider_name?: string | null
          recorded_by: string
          scope_fingerprint?: string | null
          source_digest?: string | null
          supersedes_administration_id?: string | null
          supersession_reason?: string | null
          updated_at?: string
          vaccine_product_id?: string | null
        }
        Update: {
          administered_on?: string
          administration_site?: string | null
          care_space_id?: string
          catalog_digest?: string | null
          catalog_version?: string | null
          child_id?: string
          confirmation_sha256?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          country_code?: string
          created_at?: string
          dose_label?: string | null
          draft_expires_at?: string | null
          id?: string
          idempotency_key?: string
          input_fingerprint?: string | null
          lot_number?: string | null
          provenance_type?: string
          provider_name?: string | null
          recorded_by?: string
          scope_fingerprint?: string | null
          source_digest?: string | null
          supersedes_administration_id?: string | null
          supersession_reason?: string | null
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
            foreignKeyName: "vaccine_administration_supersedes_fk"
            columns: ["supersedes_administration_id"]
            isOneToOne: false
            referencedRelation: "vaccine_administrations"
            referencedColumns: ["id"]
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
          catalog_version: string
          created_at: string
          disease_group: string | null
          display_name_en: string
          display_name_es: string
          effective_from: string
          effective_until: string | null
          id: string
          source_digest: string
        }
        Insert: {
          active?: boolean
          antigen_code: string
          catalog_version: string
          created_at?: string
          disease_group?: string | null
          display_name_en: string
          display_name_es: string
          effective_from: string
          effective_until?: string | null
          id?: string
          source_digest: string
        }
        Update: {
          active?: boolean
          antigen_code?: string
          catalog_version?: string
          created_at?: string
          disease_group?: string | null
          display_name_en?: string
          display_name_es?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          source_digest?: string
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
          aliases: string[]
          brand_name: string | null
          catalog_version: string
          country_code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          manufacturer: string | null
          presentation: string | null
          product_code: string
          regulatory_identifier: string | null
          source_digest: string
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          brand_name?: string | null
          catalog_version: string
          country_code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          manufacturer?: string | null
          presentation?: string | null
          product_code: string
          regulatory_identifier?: string | null
          source_digest: string
        }
        Update: {
          active?: boolean
          aliases?: string[]
          brand_name?: string | null
          catalog_version?: string
          country_code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          manufacturer?: string | null
          presentation?: string | null
          product_code?: string
          regulatory_identifier?: string | null
          source_digest?: string
        }
        Relationships: []
      }
    }
    Views: {
      growth_series_points: {
        Row: {
          age_basis: string | null
          assessed_at: string | null
          assessment_id: string | null
          care_space_id: string | null
          child_id: string | null
          chronological_age_days: number | null
          corrected_age_days: number | null
          correction_applied: boolean | null
          dataset_digest: string | null
          indicator: string | null
          interpretation: string | null
          measurement_id: string | null
          measurement_method: string | null
          measurement_type: string | null
          occurred_at: string | null
          percentile: number | null
          percentile_lexeme: string | null
          result_status: string | null
          standard_key: string | null
          standard_version: string | null
          superseded_by_measurement_id: string | null
          transition_reason: string | null
          validation_status: string | null
          warnings: string[] | null
          z_score: number | null
          z_score_lexeme: string | null
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
            foreignKeyName: "growth_assessment_measurement_scope_fk"
            columns: ["care_space_id", "measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["care_space_id", "id"]
          },
          {
            foreignKeyName: "growth_assessments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "anthropometric_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_assessments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "growth_series_points"
            referencedColumns: ["superseded_by_measurement_id"]
          },
        ]
      }
    }
    Functions: {
      accept_creciendo_session_cancel: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_idempotency_key_sha256: string
          p_operation_id: string
          p_product_session_id: string
          p_reason: string
          p_request_sha256: string
        }
        Returns: {
          accepted_at: string
          cancellation_outcome: string
          cursor: string
          effect_state: string
          finalize_required: boolean
          last_sequence: number
          operation_id: string
          outcome: string
          turn_id: string
        }[]
      }
      accept_creciendo_session_message: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_client_message_id: string
          p_command_kind: string
          p_idempotency_key_sha256: string
          p_parts: Json
          p_product_session_id: string
          p_proposed_turn_id: string
          p_request_sha256: string
          p_safety_receipt_sha256: string
          p_terminal_event: Json
        }
        Returns: {
          accepted_at: string
          cursor: string
          dispatch_required: boolean
          eve_session_id: string
          last_sequence: number
          message_id: string
          outcome: string
          turn_id: string
        }[]
      }
      append_creciendo_channel_event: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_event_type: string
          p_occurred_at?: string
          p_owner_user_id: string
          p_payload: Json
          p_product_session_id: string
          p_source_id: string
          p_source_kind: string
          p_terminal: boolean
          p_turn_id: string
        }
        Returns: {
          cursor: string
          event_id: string
          last_sequence: number
          occurred_at: string
          outcome: string
          sequence: number
        }[]
      }
      append_realtime_invalidation: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_resource_id: string
          p_resource_kind: string
          p_resource_version: number
          p_session_id: string
          p_source_event_id: string
        }
        Returns: {
          invalidation_id: number
          invalidation_sequence: number
          outcome: string
        }[]
      }
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
      capture_memory_candidate: {
        Args: {
          p_authorization_version: string
          p_candidate_id: string
          p_candidate_text: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_expires_at: string
          p_extraction_confidence: number
          p_idempotency_key: string
          p_input_sha256: string
          p_memory_type: string
          p_sensitivity: string
          p_session_id: string
          p_source_message_id: string
          p_source_span_end: number
          p_source_span_start: number
        }
        Returns: {
          candidate_text: string
          care_space_id: string
          child_id: string
          created_at: string
          created_by: string
          expires_at: string
          extraction_confidence: number
          id: string
          idempotency_key: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          outcome: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          sensitivity: string
          source_message_id: string
          source_session_id: string
          source_span_end: number
          source_span_start: number
        }[]
      }
      claim_projection_source: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_input_sha256: string
          p_owner_user_id: string
          p_product_session_id: string
          p_projector_name: string
          p_projector_version: string
          p_source_event_id: string
          p_source_event_version: string
          p_source_sequence: number
        }
        Returns: {
          claim_status: string
          inbox_id: number
        }[]
      }
      complete_projection_source: {
        Args: { p_inbox_id: number; p_result_sha256?: string }
        Returns: boolean
      }
      correct_medication_intake: {
        Args: {
          p_actual_quantity_lexeme: string
          p_actual_unit: string
          p_care_space_id: string
          p_child_id: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_input_payload: Json
          p_medication_plan_id: string
          p_medication_schedule_occurrence_id: string
          p_original_intake_id: string
          p_scheduled_for: string
          p_status: string
          p_taken_at: string
        }
        Returns: {
          intake_id: string
          outcome: string
        }[]
      }
      create_onboarding:
        | {
            Args: {
              p_allergies: string[]
              p_birth_date: string
              p_care_space_name: string
              p_consent_jurisdiction: string
              p_consent_locale: string
              p_consent_type: string
              p_country_of_care: string
              p_gestational_age_weeks: number
              p_given_names: string
              p_guardian_relationship: string
              p_idempotency_key: string
              p_is_premature: boolean
              p_reference_sex: string
              p_request_sha256: string
              p_timezone: string
            }
            Returns: {
              care_space_id: string
              child_id: string
              outcome: string
              resource_version: number
            }[]
          }
        | {
            Args: {
              p_allergies: string[]
              p_birth_date: string
              p_birth_time_zone: string
              p_birth_weight_grams: number
              p_care_space_name: string
              p_consent_jurisdiction: string
              p_consent_locale: string
              p_consent_type: string
              p_country_of_care: string
              p_family_names: string
              p_gestational_age_days: number
              p_gestational_age_weeks: number
              p_given_names: string
              p_guardian_relationship: string
              p_idempotency_key: string
              p_is_premature: boolean
              p_preferred_name: string
              p_reference_sex: string
              p_request_sha256: string
              p_time_of_birth: string
              p_timezone: string
            }
            Returns: {
              care_space_id: string
              child_id: string
              outcome: string
              resource_version: number
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
      decide_memory_candidate: {
        Args: {
          p_authorization_version: string
          p_candidate_id: string
          p_candidate_input_sha256: string
          p_care_space_id: string
          p_child_id: string
          p_confirmation_sha256: string
          p_content_sha256: string
          p_cutoff_at: string
          p_decision: string
          p_extraction_confidence: number
          p_idempotency_key: string
          p_memory_item_id: string
          p_memory_type: string
          p_policy_sha256: string
          p_provenance_captured_at: string
          p_provenance_source_id: string
          p_provenance_type: string
          p_searchable_text: string
          p_sensitivity: string
          p_session_id: string
          p_source_message_id: string
          p_source_session_id: string
          p_source_span_end: number
          p_source_span_start: number
          p_structured_content: Json
          p_supersedes_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: {
          candidate_id: string
          candidate_input_sha256: string
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          confirmed_at: string
          content_sha256: string
          decision_id: string
          event_id: string
          event_kind: string
          event_payload_sha256: string
          event_version: number
          extraction_confidence: number
          input_sha256: string
          lifecycle: string
          memory_item_id: string
          memory_type: string
          outcome: string
          policy_sha256: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          retrieval_eligibility: string
          searchable_text: string
          sensitivity: string
          source_message_id: string
          source_session_id: string
          source_span_end: number
          source_span_start: number
          structured_content: Json
          supersedes_id: string
          valid_from: string
          valid_until: string
        }[]
      }
      enqueue_expired_memory_deletions: {
        Args: { p_cutoff_at: string; p_limit?: number }
        Returns: {
          memory_item_id: string
          request_id: string
        }[]
      }
      execute_memory_deletion: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_memory_item_id: string
          p_proof_sha256: string
          p_request_id: string
        }
        Returns: {
          care_space_id: string
          child_id: string
          deleted_embeddings: number
          deleted_links: number
          memory_item_id: string
          outcome: string
          request_id: string
          status: string
        }[]
      }
      fail_projection_source: {
        Args: { p_error_code: string; p_inbox_id: number }
        Returns: boolean
      }
      finalize_creciendo_document_upload: {
        Args: {
          p_actual_sha256: string
          p_actual_size_bytes: number
          p_detected_mime_type: string
          p_token_sha256: string
        }
        Returns: {
          document_id: string
          outcome: string
        }[]
      }
      finalize_creciendo_session_cancel: {
        Args: {
          p_authorization_version: string
          p_cancellation_outcome: string
          p_care_space_id: string
          p_child_id: string
          p_effect_state: string
          p_operation_id: string
          p_product_session_id: string
        }
        Returns: {
          cancellation_outcome: string
          cursor: string
          effect_state: string
          last_sequence: number
          occurred_at: string
          operation_id: string
          outcome: string
          turn_id: string
        }[]
      }
      get_confirmed_memory: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_memory_item_id: string
          p_session_id: string
        }
        Returns: {
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          confirmed_at: string
          content_sha256: string
          extraction_confidence: number
          id: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          retrieval_eligibility: string
          searchable_text: string
          sensitivity: string
          source_message_id: string
          source_session_id: string
          source_span_end: number
          source_span_start: number
          structured_content: Json
          supersedes_id: string
          valid_from: string
          valid_until: string
        }[]
      }
      get_creciendo_upload_ticket: {
        Args: { p_token_sha256: string }
        Returns: {
          bucket_id: string
          care_space_id: string
          child_id: string
          document_id: string
          expected_mime_type: string
          expected_sha256: string
          expected_size_bytes: number
          expires_at: string
          object_path: string
          storage_status: string
          ticket_id: string
          used_at: string
        }[]
      }
      list_confirmed_memory: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_session_id: string
        }
        Returns: {
          care_space_id: string
          child_id: string
          confirmation_sha256: string
          confirmed_at: string
          content_sha256: string
          extraction_confidence: number
          id: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          retrieval_eligibility: string
          searchable_text: string
          sensitivity: string
          source_message_id: string
          source_session_id: string
          source_span_end: number
          source_span_start: number
          structured_content: Json
          supersedes_id: string
          valid_from: string
          valid_until: string
        }[]
      }
      list_pending_memory_candidates: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_session_id: string
        }
        Returns: {
          candidate_text: string
          care_space_id: string
          child_id: string
          created_at: string
          created_by: string
          expires_at: string
          extraction_confidence: number
          id: string
          idempotency_key: string
          input_sha256: string
          lifecycle: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          sensitivity: string
          source_message_id: string
          source_session_id: string
          source_span_end: number
          source_span_start: number
        }[]
      }
      match_clinical_memory: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_embedding_model: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
          p_session_id: string
        }
        Returns: {
          confirmed_at: string
          memory_item_id: string
          memory_type: string
          provenance_captured_at: string
          provenance_source_id: string
          provenance_type: string
          searchable_text: string
          similarity: number
        }[]
      }
      persist_country_change_reassessment: {
        Args: {
          p_assessments: Json
          p_care_space_id: string
          p_child_id: string
          p_country_change_event_id: string
          p_country_code: string
          p_database_algorithm_id: string
          p_database_rule_pack_id: string
          p_input_fingerprint: string
          p_reevaluates_run_id: string
          p_reevaluation_run_id: string
          p_schedule_id: string
        }
        Returns: {
          assessment_ids: string[]
          outcome: string
          reevaluation_run_id: string
        }[]
      }
      persist_vaccination_assessment: {
        Args: {
          p_algorithm_id: string
          p_as_of_date: string
          p_care_space_id: string
          p_child_id: string
          p_country_code: string
          p_decision_digest: string
          p_due_from: string
          p_due_until: string
          p_evidence_administration_ids: string[]
          p_explanation_code: string
          p_input_digest: string
          p_input_fingerprint: string
          p_rule_id: string
          p_rule_pack_id: string
          p_rule_pack_version: string
          p_schedule_id: string
          p_source_digest: string
          p_status: string
        }
        Returns: {
          assessment_id: string
          outcome: string
        }[]
      }
      quarantine_projection_source: {
        Args: {
          p_error_code?: string
          p_inbox_id: number
          p_metadata_redacted?: Json
          p_reason: string
        }
        Returns: boolean
      }
      read_owned_creciendo_events: {
        Args: {
          p_after_sequence: number
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_limit?: number
          p_product_session_id: string
        }
        Returns: {
          cursor: string
          data: Json
          event_id: string
          occurred_at: string
          sequence: number
          terminal: boolean
          turn_id: string
          type: string
          version: string
        }[]
      }
      record_confirmed_anthropometry: {
        Args: {
          p_assessments: Json
          p_capture_policy_id: string
          p_capture_policy_version: string
          p_care_space_id: string
          p_child_id: string
          p_confirmation_expires_at: string
          p_confirmation_sha256: string
          p_conversion_version: string
          p_device: string
          p_hmac_key_id: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_local_date: string
          p_measurement_method: string
          p_measurement_type: string
          p_normalized_unit: string
          p_normalized_value_lexeme: string
          p_occurred_at: string
          p_original_unit: string
          p_original_value_lexeme: string
          p_provenance_type: string
          p_rounding_mode: string
          p_supersedes_measurement_id?: string
          p_supersession_reason?: string
          p_time_zone: string
        }
        Returns: {
          assessment_ids: string[]
          measurement_id: string
          outcome: string
        }[]
      }
      create_vaccine_administration_draft: {
        Args: {
          p_administration_site: string
          p_administered_on: string
          p_care_space_id: string
          p_catalog_digest: string
          p_catalog_version: string
          p_child_id: string
          p_confirmation_sha256: string
          p_country_code: string
          p_dose_label: string
          p_draft_expires_at: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_lot_number: string
          p_provenance_type: string
          p_source_digest: string
          p_vaccine_product_id: string
        }
        Returns: {
          draft_expires_at: string
          draft_id: string
          outcome: string
        }[]
      }
      record_confirmed_vaccine_administration: {
        Args: {
          p_administered_on: string
          p_administration_site: string
          p_antigen_ids: Json
          p_care_space_id: string
          p_child_id: string
          p_confirmation_sha256: string
          p_country_code: string
          p_dose_label: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_lot_number: string
          p_provenance_type: string
          p_provider_name: string
          p_source_digest: string
          p_supersedes_administration_id?: string
          p_supersession_reason?: string
          p_vaccine_product_id: string
        }
        Returns: {
          administration_id: string
          outcome: string
        }[]
      }
      record_development_observation: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_confirmation_sha256: string
          p_document_ids: string[]
          p_domain: string
          p_idempotency_key: string
          p_input_sha256: string
          p_milestone_id: string
          p_observation: string
          p_observed_on: string
          p_provenance_type: string
          p_status: string
          p_supersedes_observation_id: string
          p_title: string
        }
        Returns: {
          observation_id: string
          outcome: string
        }[]
      }
      record_dose_validation: {
        Args: {
          p_algorithm_version: string
          p_artifact_sha256: string
          p_care_space_id: string
          p_child_id: string
          p_decision_digest: string
          p_declared_input: Json
          p_explanation_codes: string[]
          p_ingredients: Json
          p_input_digest: string
          p_package_version: string
          p_request_id: string
          p_result: string
          p_source_evidence: Json
          p_vocabulary_version: string
        }
        Returns: {
          outcome: string
          validation_id: string
        }[]
      }
      record_medication_intake: {
        Args: {
          p_actual_quantity_lexeme: string
          p_actual_unit: string
          p_care_space_id: string
          p_child_id: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_input_payload: Json
          p_medication_plan_id: string
          p_medication_schedule_occurrence_id: string
          p_scheduled_for: string
          p_status: string
          p_taken_at: string
        }
        Returns: {
          intake_id: string
          outcome: string
        }[]
      }
      record_medication_plan: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_declared_indication: string
          p_display_name: string
          p_ends_at: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_input_payload: Json
          p_medication_concept_id: string
          p_medication_presentation_id: string
          p_starts_at: string
        }
        Returns: {
          outcome: string
          plan_id: string
        }[]
      }
      record_medication_schedule_occurrences: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_idempotency_key: string
          p_input_digest: string
          p_medication_plan_id: string
          p_occurrences: Json
          p_plan_version: number
        }
        Returns: {
          outcome: string
          saved_count: number
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
      register_creciendo_document_transfer_ticket: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_document_id: string
          p_expected_mime_type: string
          p_expected_sha256: string
          p_expected_size_bytes: number
          p_expires_at: string
          p_idempotency_key: string
          p_kind: string
          p_nonce_sha256: string
          p_token_sha256: string
        }
        Returns: {
          nonce_sha256: string
          outcome: string
          ticket_id: string
        }[]
      }
      request_memory_deletion: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_idempotency_key: string
          p_memory_item_id: string
          p_request_id: string
          p_request_sha256: string
          p_session_id: string
        }
        Returns: {
          care_space_id: string
          child_id: string
          memory_item_id: string
          outcome: string
          request_id: string
          status: string
        }[]
      }
      reserve_creciendo_document_object: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_declared_mime_type: string
          p_display_name: string
          p_expected_sha256: string
          p_expected_size_bytes: number
          p_idempotency_key: string
          p_purpose: string
          p_request_sha256: string
          p_retention_class: string
        }
        Returns: {
          bucket_id: string
          declared_mime_type: string
          document_id: string
          expected_sha256: string
          expected_size_bytes: number
          object_path: string
          outcome: string
          reservation_expires_at: string
          storage_status: string
        }[]
      }
      reserve_document_object: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cutoff_at: string
          p_declared_mime_type: string
          p_display_name: string
          p_expected_sha256: string
          p_expected_size_bytes: number
          p_idempotency_key: string
          p_purpose: string
          p_request_sha256: string
          p_retention_class: string
          p_session_id: string
        }
        Returns: {
          bucket_id: string
          declared_mime_type: string
          document_id: string
          expected_sha256: string
          expected_size_bytes: number
          object_path: string
          outcome: string
          reservation_expires_at: string
          reservation_nonce_sha256: string
          storage_status: string
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
      resolve_owned_creciendo_cursor: {
        Args: {
          p_authorization_version: string
          p_care_space_id: string
          p_child_id: string
          p_cursor: string
          p_product_session_id: string
        }
        Returns: {
          after_sequence: number
          first_available_sequence: number
          last_sequence: number
          outcome: string
          terminal_event_id: string
        }[]
      }
      supersede_medication_plan: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_declared_indication: string
          p_display_name: string
          p_ends_at: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_input_payload: Json
          p_medication_concept_id: string
          p_medication_presentation_id: string
          p_plan_id: string
          p_starts_at: string
        }
        Returns: {
          outcome: string
          plan_id: string
        }[]
      }
      transition_medication_plan: {
        Args: {
          p_care_space_id: string
          p_child_id: string
          p_idempotency_key: string
          p_input_fingerprint: string
          p_input_payload: Json
          p_plan_id: string
          p_target_status: string
        }
        Returns: {
          outcome: string
          plan_id: string
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
