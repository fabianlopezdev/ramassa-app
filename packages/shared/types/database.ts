export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      announcements: {
        Row: {
          body: Json;
          category: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          image_alt: Json | null;
          image_url: string | null;
          is_pinned: boolean;
          org_id: string;
          published_at: string | null;
          status: string;
          title: Json;
          updated_at: string;
        };
        Insert: {
          body: Json;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          image_alt?: Json | null;
          image_url?: string | null;
          is_pinned?: boolean;
          org_id?: string;
          published_at?: string | null;
          status?: string;
          title: Json;
          updated_at?: string;
        };
        Update: {
          body?: Json;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          image_alt?: Json | null;
          image_url?: string | null;
          is_pinned?: boolean;
          org_id?: string;
          published_at?: string | null;
          status?: string;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'announcements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      app_terms_signatures: {
        Row: {
          acceptance_id: string;
          device: string | null;
          media_consent: boolean;
          org_id: string;
          profile_id: string;
          signature: Json | null;
          unable_to_draw: boolean;
        };
        Insert: {
          acceptance_id: string;
          device?: string | null;
          media_consent: boolean;
          org_id: string;
          profile_id: string;
          signature?: Json | null;
          unable_to_draw: boolean;
        };
        Update: {
          acceptance_id?: string;
          device?: string | null;
          media_consent?: boolean;
          org_id?: string;
          profile_id?: string;
          signature?: Json | null;
          unable_to_draw?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'app_terms_signatures_acceptance_id_fkey';
            columns: ['acceptance_id'];
            isOneToOne: true;
            referencedRelation: 'terms_acceptances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'app_terms_signatures_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'app_terms_signatures_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          marked_at: string;
          marked_by: string | null;
          occurrence_id: string;
          org_id: string;
          player_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          marked_at?: string;
          marked_by?: string | null;
          occurrence_id: string;
          org_id?: string;
          player_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          marked_at?: string;
          marked_by?: string | null;
          occurrence_id?: string;
          org_id?: string;
          player_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_marked_by_fkey';
            columns: ['marked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'event_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string;
          changes: Json | null;
          created_at: string;
          id: string;
          org_id: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          org_id: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      authorization_consent_events: {
        Row: {
          consent_key: string;
          decided_at: string;
          granted: boolean;
          id: number;
          method: string;
          org_id: string;
          profile_id: string;
          signature_id: string | null;
        };
        Insert: {
          consent_key: string;
          decided_at?: string;
          granted: boolean;
          id?: never;
          method: string;
          org_id: string;
          profile_id: string;
          signature_id?: string | null;
        };
        Update: {
          consent_key?: string;
          decided_at?: string;
          granted?: boolean;
          id?: never;
          method?: string;
          org_id?: string;
          profile_id?: string;
          signature_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'authorization_consent_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_consent_events_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_consent_events_signature_id_fkey';
            columns: ['signature_id'];
            isOneToOne: false;
            referencedRelation: 'authorization_signatures';
            referencedColumns: ['id'];
          },
        ];
      };
      authorization_signatures: {
        Row: {
          device: string | null;
          id: string;
          is_test_fixture: boolean;
          language: string | null;
          method: string;
          org_id: string;
          paper_signed_on: string | null;
          profile_id: string;
          recorded_by: string | null;
          season_id: string;
          signature: Json | null;
          signed_at: string;
          unable_to_draw: boolean;
          version_id: string | null;
          witnessed_by: string | null;
        };
        Insert: {
          device?: string | null;
          id?: string;
          is_test_fixture?: boolean;
          language?: string | null;
          method: string;
          org_id: string;
          paper_signed_on?: string | null;
          profile_id: string;
          recorded_by?: string | null;
          season_id: string;
          signature?: Json | null;
          signed_at?: string;
          unable_to_draw?: boolean;
          version_id?: string | null;
          witnessed_by?: string | null;
        };
        Update: {
          device?: string | null;
          id?: string;
          is_test_fixture?: boolean;
          language?: string | null;
          method?: string;
          org_id?: string;
          paper_signed_on?: string | null;
          profile_id?: string;
          recorded_by?: string | null;
          season_id?: string;
          signature?: Json | null;
          signed_at?: string;
          unable_to_draw?: boolean;
          version_id?: string | null;
          witnessed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'authorization_signatures_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_signatures_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_signatures_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_signatures_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_signatures_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'authorization_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_signatures_witnessed_by_fkey';
            columns: ['witnessed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      authorization_versions: {
        Row: {
          content: Json;
          id: string;
          org_id: string;
          published_at: string;
          published_by: string | null;
          season_id: string;
          version_number: number;
        };
        Insert: {
          content: Json;
          id?: string;
          org_id: string;
          published_at?: string;
          published_by?: string | null;
          season_id: string;
          version_number: number;
        };
        Update: {
          content?: Json;
          id?: string;
          org_id?: string;
          published_at?: string;
          published_by?: string | null;
          season_id?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'authorization_versions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_versions_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorization_versions_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      builtin_question_overrides: {
        Row: {
          help: Json | null;
          is_hidden: boolean;
          label: Json | null;
          option_overrides: Json;
          org_id: string;
          question: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          help?: Json | null;
          is_hidden?: boolean;
          label?: Json | null;
          option_overrides?: Json;
          org_id: string;
          question: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          help?: Json | null;
          is_hidden?: boolean;
          label?: Json | null;
          option_overrides?: Json;
          org_id?: string;
          question?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'builtin_question_overrides_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'builtin_question_overrides_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collaborating_entities: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collaborating_entities_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collaborating_entities_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_assignment_history: {
        Row: {
          assigned_staff_id: string | null;
          changed_by: string;
          conversation_id: string;
          created_at: string;
          id: string;
          org_id: string;
          previous_staff_id: string | null;
          user_id: string;
        };
        Insert: {
          assigned_staff_id?: string | null;
          changed_by: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          org_id: string;
          previous_staff_id?: string | null;
          user_id: string;
        };
        Update: {
          assigned_staff_id?: string | null;
          changed_by?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          previous_staff_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_assignment_history_actor_fkey';
            columns: ['org_id', 'changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversation_assignment_history_assigned_staff_fkey';
            columns: ['org_id', 'assigned_staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversation_assignment_history_conversation_fkey';
            columns: ['org_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversation_assignment_history_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_assignment_history_previous_staff_fkey';
            columns: ['org_id', 'previous_staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversation_assignment_history_user_fkey';
            columns: ['org_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      conversation_read_states: {
        Row: {
          conversation_id: string;
          last_read_message_id: string | null;
          org_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          last_read_message_id?: string | null;
          org_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_message_id?: string | null;
          org_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_read_states_conversation_tenant_fkey';
            columns: ['org_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversation_read_states_message_fkey';
            columns: ['last_read_message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_read_states_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_read_states_user_tenant_fkey';
            columns: ['org_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      conversations: {
        Row: {
          assigned_staff_id: string | null;
          created_at: string;
          id: string;
          org_id: string;
          user_id: string;
        };
        Insert: {
          assigned_staff_id?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          user_id: string;
        };
        Update: {
          assigned_staff_id?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_staff_tenant_fkey';
            columns: ['org_id', 'assigned_staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'conversations_user_tenant_fkey';
            columns: ['org_id', 'user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      custom_answers: {
        Row: {
          answered_at: string;
          org_id: string;
          profile_id: string;
          question_id: string;
          season_id: string | null;
          season_key: string;
          source: string;
          value: Json | null;
          value_encrypted: string | null;
        };
        Insert: {
          answered_at?: string;
          org_id: string;
          profile_id: string;
          question_id: string;
          season_id?: string | null;
          season_key?: string;
          source: string;
          value?: Json | null;
          value_encrypted?: string | null;
        };
        Update: {
          answered_at?: string;
          org_id?: string;
          profile_id?: string;
          question_id?: string;
          season_id?: string | null;
          season_key?: string;
          source?: string;
          value?: Json | null;
          value_encrypted?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_answers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_answers_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'custom_questions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_answers_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      custom_notification_group_members: {
        Row: {
          created_at: string;
          group_id: string;
          org_id: string;
          participant_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          org_id: string;
          participant_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          org_id?: string;
          participant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_notification_group_members_group_tenant_fkey';
            columns: ['org_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'custom_notification_groups';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'custom_notification_group_members_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_notification_group_members_participant_tenant_fkey';
            columns: ['org_id', 'participant_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      custom_notification_groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_notification_groups_creator_tenant_fkey';
            columns: ['org_id', 'created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'custom_notification_groups_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      custom_question_options: {
        Row: {
          id: string;
          is_archived: boolean;
          label: Json;
          org_id: string;
          question_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          is_archived?: boolean;
          label: Json;
          org_id: string;
          question_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          is_archived?: boolean;
          label?: Json;
          org_id?: string;
          question_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_question_options_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_question_options_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'custom_questions';
            referencedColumns: ['id'];
          },
        ];
      };
      custom_questions: {
        Row: {
          created_at: string;
          help: Json | null;
          id: string;
          is_archived: boolean;
          label: Json;
          org_id: string;
          placements: string[];
          privacy: string;
          question_type: string;
          screen_id: string;
          show_when_option_id: string | null;
          show_when_question_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          help?: Json | null;
          id?: string;
          is_archived?: boolean;
          label: Json;
          org_id: string;
          placements: string[];
          privacy: string;
          question_type: string;
          screen_id: string;
          show_when_option_id?: string | null;
          show_when_question_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          help?: Json | null;
          id?: string;
          is_archived?: boolean;
          label?: Json;
          org_id?: string;
          placements?: string[];
          privacy?: string;
          question_type?: string;
          screen_id?: string;
          show_when_option_id?: string | null;
          show_when_question_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_questions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_questions_screen_id_fkey';
            columns: ['screen_id'];
            isOneToOne: false;
            referencedRelation: 'intake_screens';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_questions_show_when_option_id_fkey';
            columns: ['show_when_option_id'];
            isOneToOne: false;
            referencedRelation: 'custom_question_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'custom_questions_show_when_question_id_fkey';
            columns: ['show_when_question_id'];
            isOneToOne: false;
            referencedRelation: 'custom_questions';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_requests: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          reason: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          state: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          reason?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          reason?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deletion_requests_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'deletion_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_invitations: {
        Row: {
          accepted_at: string | null;
          collaborating_entity_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          org_id: string;
          profile_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          collaborating_entity_id: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          org_id: string;
          profile_id: string;
        };
        Update: {
          accepted_at?: string | null;
          collaborating_entity_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          org_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_invitations_entity_tenant_fkey';
            columns: ['org_id', 'collaborating_entity_id'];
            isOneToOne: false;
            referencedRelation: 'collaborating_entities';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'entity_invitations_inviter_tenant_fkey';
            columns: ['org_id', 'invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'entity_invitations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entity_invitations_profile_tenant_fkey';
            columns: ['org_id', 'profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      entity_referrals: {
        Row: {
          assigned_staff_id: string | null;
          collaborating_entity_id: string;
          consent_confirmed_at: string | null;
          consent_confirmed_by: string | null;
          created_at: string;
          documentation_status: string;
          entity_user_id: string;
          id: string;
          intake_answers: string | null;
          notes: string | null;
          org_id: string;
          referred_email: string | null;
          referred_first_name: string;
          referred_last_name: string;
          referred_phone: string | null;
          referred_profile_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          assigned_staff_id?: string | null;
          collaborating_entity_id: string;
          consent_confirmed_at?: string | null;
          consent_confirmed_by?: string | null;
          created_at?: string;
          documentation_status: string;
          entity_user_id: string;
          id?: string;
          intake_answers?: string | null;
          notes?: string | null;
          org_id: string;
          referred_email?: string | null;
          referred_first_name: string;
          referred_last_name: string;
          referred_phone?: string | null;
          referred_profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assigned_staff_id?: string | null;
          collaborating_entity_id?: string;
          consent_confirmed_at?: string | null;
          consent_confirmed_by?: string | null;
          created_at?: string;
          documentation_status?: string;
          entity_user_id?: string;
          id?: string;
          intake_answers?: string | null;
          notes?: string | null;
          org_id?: string;
          referred_email?: string | null;
          referred_first_name?: string;
          referred_last_name?: string;
          referred_phone?: string | null;
          referred_profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_referrals_collaborating_entity_tenant_fkey';
            columns: ['org_id', 'collaborating_entity_id'];
            isOneToOne: false;
            referencedRelation: 'collaborating_entities';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'entity_referrals_entity_tenant_fkey';
            columns: ['org_id', 'entity_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'entity_referrals_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entity_referrals_profile_tenant_fkey';
            columns: ['org_id', 'referred_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'entity_referrals_staff_tenant_fkey';
            columns: ['org_id', 'assigned_staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      equipment_arrival_photos: {
        Row: {
          arrival_id: string;
          created_at: string;
          id: string;
          kind: string;
          object_key: string;
          org_id: string;
        };
        Insert: {
          arrival_id: string;
          created_at?: string;
          id?: string;
          kind: string;
          object_key: string;
          org_id: string;
        };
        Update: {
          arrival_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          object_key?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equipment_arrival_photos_arrival_id_fkey';
            columns: ['arrival_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_arrivals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'equipment_arrival_photos_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_arrivals: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          problems: string | null;
          received_at: string;
          received_by: string | null;
          source: string;
          source_name: string | null;
          total_cost_cents: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          problems?: string | null;
          received_at: string;
          received_by?: string | null;
          source: string;
          source_name?: string | null;
          total_cost_cents?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          problems?: string | null;
          received_at?: string;
          received_by?: string | null;
          source?: string;
          source_name?: string | null;
          total_cost_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'equipment_arrivals_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'equipment_arrivals_received_by_fkey';
            columns: ['received_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_deliveries: {
        Row: {
          created_at: string;
          delivered_by: string;
          delivered_on: string;
          id: string;
          item: string;
          mode: string;
          note: string | null;
          profile_id: string;
          signature: Json | null;
          signature_reason: string | null;
          signature_state: string;
          size: string | null;
          statement_language: string | null;
          unit_code: string | null;
        };
        Insert: {
          created_at?: string;
          delivered_by: string;
          delivered_on?: string;
          id?: string;
          item: string;
          mode?: string;
          note?: string | null;
          profile_id: string;
          signature?: Json | null;
          signature_reason?: string | null;
          signature_state?: string;
          size?: string | null;
          statement_language?: string | null;
          unit_code?: string | null;
        };
        Update: {
          created_at?: string;
          delivered_by?: string;
          delivered_on?: string;
          id?: string;
          item?: string;
          mode?: string;
          note?: string | null;
          profile_id?: string;
          signature?: Json | null;
          signature_reason?: string | null;
          signature_state?: string;
          size?: string | null;
          statement_language?: string | null;
          unit_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'equipment_deliveries_delivered_by_fkey';
            columns: ['delivered_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'equipment_deliveries_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_item_types: {
        Row: {
          code_prefix: string | null;
          created_at: string;
          default_value_cents: number | null;
          id: string;
          is_active: boolean;
          is_builtin: boolean;
          key: string;
          kind: string;
          name: Json | null;
          org_id: string;
          sizes: string[];
          updated_at: string;
        };
        Insert: {
          code_prefix?: string | null;
          created_at?: string;
          default_value_cents?: number | null;
          id?: string;
          is_active?: boolean;
          is_builtin?: boolean;
          key: string;
          kind: string;
          name?: Json | null;
          org_id: string;
          sizes?: string[];
          updated_at?: string;
        };
        Update: {
          code_prefix?: string | null;
          created_at?: string;
          default_value_cents?: number | null;
          id?: string;
          is_active?: boolean;
          is_builtin?: boolean;
          key?: string;
          kind?: string;
          name?: Json | null;
          org_id?: string;
          sizes?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equipment_item_types_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      event_categories: {
        Row: {
          color: string;
          created_at: string;
          icon: string;
          id: string;
          name: Json;
          org_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          color: string;
          created_at?: string;
          icon: string;
          id?: string;
          name: Json;
          org_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          icon?: string;
          id?: string;
          name?: Json;
          org_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_categories_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      event_occurrences: {
        Row: {
          created_at: string;
          ends_at: string | null;
          event_id: string;
          id: string;
          org_id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          event_id: string;
          id?: string;
          org_id: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          event_id?: string;
          id?: string;
          org_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_occurrences_event_same_org';
            columns: ['org_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      event_signups: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          org_id: string;
          player_id: string;
          state: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          org_id?: string;
          player_id: string;
          state: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          org_id?: string;
          player_id?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_signups_event_same_org';
            columns: ['org_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'event_signups_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_signups_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          active_signup_count: number;
          category_id: string;
          created_at: string;
          created_by: string | null;
          description: Json | null;
          ends_at: string | null;
          expires_at: string | null;
          id: string;
          is_recurring: boolean | null;
          location: string;
          location_url: string | null;
          max_participants: number | null;
          org_id: string;
          published_at: string | null;
          recurrence_rule: string | null;
          signup_mode: string;
          starts_at: string;
          status: string;
          time_zone: string;
          title: Json;
          updated_at: string;
        };
        Insert: {
          active_signup_count?: number;
          category_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          ends_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_recurring?: boolean | null;
          location: string;
          location_url?: string | null;
          max_participants?: number | null;
          org_id?: string;
          published_at?: string | null;
          recurrence_rule?: string | null;
          signup_mode?: string;
          starts_at: string;
          status?: string;
          time_zone?: string;
          title: Json;
          updated_at?: string;
        };
        Update: {
          active_signup_count?: number;
          category_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          ends_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_recurring?: boolean | null;
          location?: string;
          location_url?: string | null;
          max_participants?: number | null;
          org_id?: string;
          published_at?: string | null;
          recurrence_rule?: string | null;
          signup_mode?: string;
          starts_at?: string;
          status?: string;
          time_zone?: string;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_category_same_org';
            columns: ['org_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'event_categories';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback_submissions: {
        Row: {
          author_id: string;
          content_encrypted: string;
          created_at: string;
          id: string;
          image_url: string | null;
          org_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          content_encrypted: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          org_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          content_encrypted?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          org_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_submissions_author_tenant_fkey';
            columns: ['org_id', 'author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'feedback_submissions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'feedback_submissions_resolver_tenant_fkey';
            columns: ['org_id', 'resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      forum_categories: {
        Row: {
          color: string;
          created_at: string;
          icon: string;
          id: string;
          name: Json;
          org_id: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          color: string;
          created_at?: string;
          icon: string;
          id?: string;
          name: Json;
          org_id: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          color?: string;
          created_at?: string;
          icon?: string;
          id?: string;
          name?: Json;
          org_id?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'forum_categories_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      forum_flags: {
        Row: {
          comment: string | null;
          created_at: string;
          flagger_id: string;
          id: string;
          media_id: string | null;
          org_id: string;
          post_id: string | null;
          reason: string;
          reply_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          state: string;
          target_type: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          flagger_id: string;
          id?: string;
          media_id?: string | null;
          org_id: string;
          post_id?: string | null;
          reason: string;
          reply_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state?: string;
          target_type: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          flagger_id?: string;
          id?: string;
          media_id?: string | null;
          org_id?: string;
          post_id?: string | null;
          reason?: string;
          reply_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'forum_flags_flagger_tenant_fkey';
            columns: ['org_id', 'flagger_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_flags_media_tenant_fkey';
            columns: ['org_id', 'media_id'];
            isOneToOne: false;
            referencedRelation: 'media_items';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_flags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'forum_flags_post_tenant_fkey';
            columns: ['org_id', 'post_id'];
            isOneToOne: false;
            referencedRelation: 'forum_posts';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_flags_reply_tenant_fkey';
            columns: ['org_id', 'reply_id'];
            isOneToOne: false;
            referencedRelation: 'forum_replies';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_flags_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      forum_posts: {
        Row: {
          author_first_name: string;
          author_id: string;
          category_id: string;
          content: string | null;
          created_at: string;
          flag_count: number;
          id: string;
          image_url: string | null;
          is_pinned: boolean;
          org_id: string;
          reply_count: number;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          author_first_name: string;
          author_id: string;
          category_id: string;
          content?: string | null;
          created_at?: string;
          flag_count?: number;
          id?: string;
          image_url?: string | null;
          is_pinned?: boolean;
          org_id: string;
          reply_count?: number;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          author_first_name?: string;
          author_id?: string;
          category_id?: string;
          content?: string | null;
          created_at?: string;
          flag_count?: number;
          id?: string;
          image_url?: string | null;
          is_pinned?: boolean;
          org_id?: string;
          reply_count?: number;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'forum_posts_author_tenant_fkey';
            columns: ['org_id', 'author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_posts_category_tenant_fkey';
            columns: ['org_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'forum_categories';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_posts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      forum_replies: {
        Row: {
          author_first_name: string;
          author_id: string;
          content: string | null;
          created_at: string;
          flag_count: number;
          id: string;
          image_url: string | null;
          org_id: string;
          post_id: string;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          author_first_name: string;
          author_id: string;
          content?: string | null;
          created_at?: string;
          flag_count?: number;
          id?: string;
          image_url?: string | null;
          org_id: string;
          post_id: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          author_first_name?: string;
          author_id?: string;
          content?: string | null;
          created_at?: string;
          flag_count?: number;
          id?: string;
          image_url?: string | null;
          org_id?: string;
          post_id?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'forum_replies_author_tenant_fkey';
            columns: ['org_id', 'author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'forum_replies_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'forum_replies_post_tenant_fkey';
            columns: ['org_id', 'post_id'];
            isOneToOne: false;
            referencedRelation: 'forum_posts';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      intake_question_states: {
        Row: {
          org_id: string;
          profile_id: string;
          question: string;
          state: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          org_id: string;
          profile_id: string;
          question: string;
          state: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          org_id?: string;
          profile_id?: string;
          question?: string;
          state?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'intake_question_states_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intake_question_states_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      intake_screens: {
        Row: {
          after_screen: string;
          created_at: string;
          id: string;
          intro: Json | null;
          is_archived: boolean;
          org_id: string;
          sort_order: number;
          title: Json;
          updated_at: string;
        };
        Insert: {
          after_screen: string;
          created_at?: string;
          id?: string;
          intro?: Json | null;
          is_archived?: boolean;
          org_id: string;
          sort_order?: number;
          title: Json;
          updated_at?: string;
        };
        Update: {
          after_screen?: string;
          created_at?: string;
          id?: string;
          intro?: Json | null;
          is_archived?: boolean;
          org_id?: string;
          sort_order?: number;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'intake_screens_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      intake_state_presets: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          states: Json;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          states: Json;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          states?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'intake_state_presets_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intake_state_presets_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      internal_documents: {
        Row: {
          content_type: string;
          created_at: string;
          file_size: number;
          id: string;
          name: string;
          object_key: string;
          org_id: string;
          uploaded_by: string;
        };
        Insert: {
          content_type: string;
          created_at?: string;
          file_size: number;
          id?: string;
          name: string;
          object_key: string;
          org_id: string;
          uploaded_by: string;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          file_size?: number;
          id?: string;
          name?: string;
          object_key?: string;
          org_id?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'internal_documents_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_documents_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          org_id: string;
          reference_entity: string | null;
          referral_id: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          org_id: string;
          reference_entity?: string | null;
          referral_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          org_id?: string;
          reference_entity?: string | null;
          referral_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_referral_tenant_fkey';
            columns: ['org_id', 'referral_id'];
            isOneToOne: false;
            referencedRelation: 'entity_referrals';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      knowledge_articles: {
        Row: {
          author_first_name: string | null;
          author_id: string | null;
          body: Json;
          category_id: string;
          content_type: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          external_url: string | null;
          id: string;
          image_url: string | null;
          is_published: boolean;
          org_id: string;
          publication_consent: boolean | null;
          publication_consent_at: string | null;
          publication_consent_version: string | null;
          published_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          reviewer_note: string | null;
          story_image_urls: string[];
          story_status: string | null;
          submission_language: string | null;
          title: Json;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          author_first_name?: string | null;
          author_id?: string | null;
          body: Json;
          category_id: string;
          content_type?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          external_url?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          org_id?: string;
          publication_consent?: boolean | null;
          publication_consent_at?: string | null;
          publication_consent_version?: string | null;
          published_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          reviewer_note?: string | null;
          story_image_urls?: string[];
          story_status?: string | null;
          submission_language?: string | null;
          title: Json;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          author_first_name?: string | null;
          author_id?: string | null;
          body?: Json;
          category_id?: string;
          content_type?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          external_url?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          org_id?: string;
          publication_consent?: boolean | null;
          publication_consent_at?: string | null;
          publication_consent_version?: string | null;
          published_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          reviewer_note?: string | null;
          story_image_urls?: string[];
          story_status?: string | null;
          submission_language?: string | null;
          title?: Json;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_articles_author_same_org';
            columns: ['org_id', 'author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'knowledge_articles_category_same_org';
            columns: ['org_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_categories';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'knowledge_articles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_articles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_articles_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_categories: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          name: Json;
          org_id: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          icon: string;
          id?: string;
          name: Json;
          org_id?: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          name?: Json;
          org_id?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_categories_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      media_items: {
        Row: {
          caption: string | null;
          consent_acknowledged_at: string;
          consent_version: string;
          created_at: string;
          file_size: number;
          file_type: string;
          file_url: string;
          flag_count: number;
          id: string;
          moderation_state: string;
          org_id: string;
          privacy_level: string;
          thumbnail_url: string | null;
          updated_at: string;
          uploaded_by: string;
          uploader_first_name: string;
        };
        Insert: {
          caption?: string | null;
          consent_acknowledged_at: string;
          consent_version: string;
          created_at?: string;
          file_size: number;
          file_type: string;
          file_url: string;
          flag_count?: number;
          id?: string;
          moderation_state?: string;
          org_id: string;
          privacy_level: string;
          thumbnail_url?: string | null;
          updated_at?: string;
          uploaded_by: string;
          uploader_first_name: string;
        };
        Update: {
          caption?: string | null;
          consent_acknowledged_at?: string;
          consent_version?: string;
          created_at?: string;
          file_size?: number;
          file_type?: string;
          file_url?: string;
          flag_count?: number;
          id?: string;
          moderation_state?: string;
          org_id?: string;
          privacy_level?: string;
          thumbnail_url?: string | null;
          updated_at?: string;
          uploaded_by?: string;
          uploader_first_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'media_items_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_items_uploader_tenant_fkey';
            columns: ['org_id', 'uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      mentoring_notification_events: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          org_id: string;
          recipient_id: string;
          request_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          org_id: string;
          recipient_id: string;
          request_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          org_id?: string;
          recipient_id?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentoring_notification_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentoring_notification_events_recipient_tenant_fkey';
            columns: ['org_id', 'recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'mentoring_notification_events_request_tenant_fkey';
            columns: ['org_id', 'request_id'];
            isOneToOne: false;
            referencedRelation: 'mentoring_requests';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      mentoring_requests: {
        Row: {
          assigned_staff_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          org_id: string;
          player_id: string;
          preferred_date: string | null;
          preferred_time: string | null;
          scheduled_at: string | null;
          staff_notes_encrypted: string | null;
          status: string;
          topic: string;
          topic_detail_encrypted: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_staff_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          player_id: string;
          preferred_date?: string | null;
          preferred_time?: string | null;
          scheduled_at?: string | null;
          staff_notes_encrypted?: string | null;
          status?: string;
          topic: string;
          topic_detail_encrypted?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_staff_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          player_id?: string;
          preferred_date?: string | null;
          preferred_time?: string | null;
          scheduled_at?: string | null;
          staff_notes_encrypted?: string | null;
          status?: string;
          topic?: string;
          topic_detail_encrypted?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentoring_requests_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentoring_requests_player_tenant_fkey';
            columns: ['org_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'mentoring_requests_staff_tenant_fkey';
            columns: ['org_id', 'assigned_staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      messages: {
        Row: {
          content: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          image_url: string | null;
          org_id: string;
          sender_id: string;
        };
        Insert: {
          content?: string | null;
          conversation_id: string;
          created_at?: string;
          id: string;
          image_url?: string | null;
          org_id: string;
          sender_id: string;
        };
        Update: {
          content?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          org_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_tenant_fkey';
            columns: ['org_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'messages_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_tenant_fkey';
            columns: ['org_id', 'sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      municipality_catalog: {
        Row: {
          canonical: string;
          code: string;
          comarca_code: string;
        };
        Insert: {
          canonical: string;
          code: string;
          comarca_code: string;
        };
        Update: {
          canonical?: string;
          code?: string;
          comarca_code?: string;
        };
        Relationships: [];
      };
      notification_templates: {
        Row: {
          body: Json;
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          title: Json;
          updated_at: string;
        };
        Insert: {
          body: Json;
          category: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          title: Json;
          updated_at?: string;
        };
        Update: {
          body?: Json;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_templates_creator_tenant_fkey';
            columns: ['org_id', 'created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'notification_templates_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          available_languages: string[];
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          default_language: string;
          document_step_explanation: Json | null;
          id: string;
          locked_default_language: string | null;
          logo_url: string | null;
          name: string;
          primary_color: string;
          secondary_color: string;
          slug: string;
        };
        Insert: {
          available_languages?: string[];
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          default_language?: string;
          document_step_explanation?: Json | null;
          id?: string;
          locked_default_language?: string | null;
          logo_url?: string | null;
          name: string;
          primary_color?: string;
          secondary_color?: string;
          slug: string;
        };
        Update: {
          available_languages?: string[];
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          default_language?: string;
          document_step_explanation?: Json | null;
          id?: string;
          locked_default_language?: string | null;
          logo_url?: string | null;
          name?: string;
          primary_color?: string;
          secondary_color?: string;
          slug?: string;
        };
        Relationships: [];
      };
      participant_notes: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          profile_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          profile_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'participant_notes_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'participant_notes_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      permission_preset_defaults: {
        Row: {
          builtin_key: string;
          permission_code: string;
        };
        Insert: {
          builtin_key: string;
          permission_code: string;
        };
        Update: {
          builtin_key?: string;
          permission_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'permission_preset_defaults_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['code'];
          },
        ];
      };
      permission_preset_permissions: {
        Row: {
          org_id: string;
          permission_code: string;
          preset_id: string;
        };
        Insert: {
          org_id: string;
          permission_code: string;
          preset_id: string;
        };
        Update: {
          org_id?: string;
          permission_code?: string;
          preset_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'permission_preset_permissions_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'permission_preset_permissions_preset_fkey';
            columns: ['org_id', 'preset_id'];
            isOneToOne: false;
            referencedRelation: 'permission_presets';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      permission_presets: {
        Row: {
          builtin_key: string | null;
          created_at: string;
          id: string;
          name: string | null;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          builtin_key?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          builtin_key?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'permission_presets_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          area: string;
          code: string;
          sort_order: number;
        };
        Insert: {
          area: string;
          code: string;
          sort_order: number;
        };
        Update: {
          area?: string;
          code?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      photo_handoffs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          document_name: string;
          expires_at: string;
          id: string;
          org_id: string;
          requested_by: string;
          result_id: string | null;
          target: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          document_name: string;
          expires_at: string;
          id?: string;
          org_id: string;
          requested_by: string;
          result_id?: string | null;
          target: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          document_name?: string;
          expires_at?: string;
          id?: string;
          org_id?: string;
          requested_by?: string;
          result_id?: string | null;
          target?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'photo_handoffs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photo_handoffs_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_answers: {
        Row: {
          answered_at: string;
          org_id: string;
          profile_id: string;
          question: string;
          source: string;
        };
        Insert: {
          answered_at?: string;
          org_id: string;
          profile_id: string;
          question: string;
          source: string;
        };
        Update: {
          answered_at?: string;
          org_id?: string;
          profile_id?: string;
          question?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_answers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_answers_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          address: string | null;
          anonymized_at: string | null;
          applicant_status: string | null;
          applicant_status_details: string | null;
          avatar_url: string | null;
          childcare_need: string | null;
          city: string | null;
          clothing_size: string | null;
          collaborating_entity_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          document_name: string | null;
          document_number: string | null;
          document_type: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          first_name: string;
          has_dependents: boolean;
          health_info: string | null;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          is_test_account: boolean;
          last_name: string;
          media_consent_at: string | null;
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          place_of_birth: string | null;
          postal_code: string | null;
          preferred_language: string;
          prior_seasons: number;
          push_notifications_enabled: boolean;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
          search_document: unknown;
          season_number: number | null;
          sessions_valid_after: string | null;
          shoe_size: string | null;
          specific_needs: string | null;
          supporting_entities: string[] | null;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          anonymized_at?: string | null;
          applicant_status?: string | null;
          applicant_status_details?: string | null;
          avatar_url?: string | null;
          childcare_need?: string | null;
          city?: string | null;
          clothing_size?: string | null;
          collaborating_entity_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          document_name?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          first_name: string;
          has_dependents?: boolean;
          health_info?: string | null;
          id: string;
          is_active?: boolean;
          is_forum_banned?: boolean;
          is_test_account?: boolean;
          last_name: string;
          media_consent_at?: string | null;
          nationality?: string | null;
          num_dependents?: number;
          org_id: string;
          phone?: string | null;
          place_of_birth?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          prior_seasons?: number;
          push_notifications_enabled?: boolean;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
          search_document?: unknown;
          season_number?: number | null;
          sessions_valid_after?: string | null;
          shoe_size?: string | null;
          specific_needs?: string | null;
          supporting_entities?: string[] | null;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          anonymized_at?: string | null;
          applicant_status?: string | null;
          applicant_status_details?: string | null;
          avatar_url?: string | null;
          childcare_need?: string | null;
          city?: string | null;
          clothing_size?: string | null;
          collaborating_entity_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          document_name?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          first_name?: string;
          has_dependents?: boolean;
          health_info?: string | null;
          id?: string;
          is_active?: boolean;
          is_forum_banned?: boolean;
          is_test_account?: boolean;
          last_name?: string;
          media_consent_at?: string | null;
          nationality?: string | null;
          num_dependents?: number;
          org_id?: string;
          phone?: string | null;
          place_of_birth?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          prior_seasons?: number;
          push_notifications_enabled?: boolean;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
          search_document?: unknown;
          season_number?: number | null;
          sessions_valid_after?: string | null;
          shoe_size?: string | null;
          specific_needs?: string | null;
          supporting_entities?: string[] | null;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_city_municipality_canonical_fkey';
            columns: ['city'];
            isOneToOne: false;
            referencedRelation: 'municipality_catalog';
            referencedColumns: ['canonical'];
          },
          {
            foreignKeyName: 'profiles_collaborating_entity_tenant_fkey';
            columns: ['org_id', 'collaborating_entity_id'];
            isOneToOne: false;
            referencedRelation: 'collaborating_entities';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'profiles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      push_deliveries: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          created_at: string;
          expo_ticket_id: string | null;
          id: string;
          language: string;
          last_error_code: string | null;
          lease_expires_at: string | null;
          next_attempt_at: string;
          org_id: string;
          publication_id: string;
          push_token_id: string | null;
          receipt_attempt_count: number;
          receipt_due_at: string | null;
          recipient_id: string;
          state: string;
          ticketed_at: string | null;
          updated_at: string;
          worker_id: string | null;
        };
        Insert: {
          attempt_count?: number;
          completed_at?: string | null;
          created_at?: string;
          expo_ticket_id?: string | null;
          id?: string;
          language: string;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          next_attempt_at?: string;
          org_id: string;
          publication_id: string;
          push_token_id?: string | null;
          receipt_attempt_count?: number;
          receipt_due_at?: string | null;
          recipient_id: string;
          state?: string;
          ticketed_at?: string | null;
          updated_at?: string;
          worker_id?: string | null;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          created_at?: string;
          expo_ticket_id?: string | null;
          id?: string;
          language?: string;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          next_attempt_at?: string;
          org_id?: string;
          publication_id?: string;
          push_token_id?: string | null;
          receipt_attempt_count?: number;
          receipt_due_at?: string | null;
          recipient_id?: string;
          state?: string;
          ticketed_at?: string | null;
          updated_at?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_deliveries_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_deliveries_publication_org_fkey';
            columns: ['org_id', 'publication_id'];
            isOneToOne: false;
            referencedRelation: 'push_publications';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'push_deliveries_recipient_org_fkey';
            columns: ['org_id', 'recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'push_deliveries_recipient_token_fkey';
            columns: ['recipient_id', 'push_token_id'];
            isOneToOne: false;
            referencedRelation: 'push_tokens';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
      push_publications: {
        Row: {
          completed_at: string | null;
          content_id: string;
          content_type: string;
          created_at: string;
          delivered_count: number;
          failed_count: number;
          id: string;
          idempotency_key: string | null;
          org_id: string;
          recipient_count: number;
          recipient_id: string | null;
          scheduled_for: string;
          sent_count: number;
          state: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          content_id: string;
          content_type: string;
          created_at?: string;
          delivered_count?: number;
          failed_count?: number;
          id?: string;
          idempotency_key?: string | null;
          org_id: string;
          recipient_count?: number;
          recipient_id?: string | null;
          scheduled_for: string;
          sent_count?: number;
          state?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          content_id?: string;
          content_type?: string;
          created_at?: string;
          delivered_count?: number;
          failed_count?: number;
          id?: string;
          idempotency_key?: string | null;
          org_id?: string;
          recipient_count?: number;
          recipient_id?: string | null;
          scheduled_for?: string;
          sent_count?: number;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_publications_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_publications_recipient_tenant_fkey';
            columns: ['org_id', 'recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string;
          device_id: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      referral_custom_answers: {
        Row: {
          created_at: string;
          org_id: string;
          question_id: string;
          referral_id: string;
          value_encrypted: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          question_id: string;
          referral_id: string;
          value_encrypted: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          question_id?: string;
          referral_id?: string;
          value_encrypted?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referral_custom_answers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referral_custom_answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'custom_questions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referral_custom_answers_referral_id_fkey';
            columns: ['referral_id'];
            isOneToOne: false;
            referencedRelation: 'entity_referrals';
            referencedColumns: ['id'];
          },
        ];
      };
      referral_updates: {
        Row: {
          author_id: string;
          content: string;
          created_at: string;
          id: string;
          org_id: string;
          referral_id: string;
          update_type: string;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string;
          id?: string;
          org_id: string;
          referral_id: string;
          update_type: string;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          referral_id?: string;
          update_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referral_updates_author_tenant_fkey';
            columns: ['org_id', 'author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'referral_updates_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referral_updates_referral_tenant_fkey';
            columns: ['org_id', 'referral_id'];
            isOneToOne: false;
            referencedRelation: 'entity_referrals';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      season_answers: {
        Row: {
          applicant_status: string | null;
          applicant_status_details: string | null;
          childcare_need: string | null;
          org_id: string;
          profile_id: string;
          season_id: string;
          specific_needs: string | null;
          supporting_entities: string[] | null;
          updated_at: string;
        };
        Insert: {
          applicant_status?: string | null;
          applicant_status_details?: string | null;
          childcare_need?: string | null;
          org_id: string;
          profile_id: string;
          season_id: string;
          specific_needs?: string | null;
          supporting_entities?: string[] | null;
          updated_at?: string;
        };
        Update: {
          applicant_status?: string | null;
          applicant_status_details?: string | null;
          childcare_need?: string | null;
          org_id?: string;
          profile_id?: string;
          season_id?: string;
          specific_needs?: string | null;
          supporting_entities?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'season_answers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_answers_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_answers_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      seasons: {
        Row: {
          created_at: string;
          id: string;
          is_current: boolean;
          is_test_fixture: boolean;
          name: string;
          org_id: string;
          starts_on: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          is_test_fixture?: boolean;
          name: string;
          org_id: string;
          starts_on: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          is_test_fixture?: boolean;
          name?: string;
          org_id?: string;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'seasons_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      service_categories: {
        Row: {
          color: string;
          created_at: string;
          icon: string;
          id: string;
          metadata_schema: Json;
          name: Json;
          org_id: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          color: string;
          created_at?: string;
          icon: string;
          id?: string;
          metadata_schema: Json;
          name: Json;
          org_id?: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          icon?: string;
          id?: string;
          metadata_schema?: Json;
          name?: Json;
          org_id?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_categories_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      service_images: {
        Row: {
          alt_text: Json;
          created_at: string;
          id: string;
          org_id: string;
          position: number;
          service_id: string;
          url: string;
        };
        Insert: {
          alt_text: Json;
          created_at?: string;
          id?: string;
          org_id?: string;
          position?: number;
          service_id: string;
          url: string;
        };
        Update: {
          alt_text?: Json;
          created_at?: string;
          id?: string;
          org_id?: string;
          position?: number;
          service_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_images_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_images_service_tenant_fkey';
            columns: ['org_id', 'service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      service_interests: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          service_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id?: string;
          service_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          service_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_interests_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_interests_service_tenant_fkey';
            columns: ['org_id', 'service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'service_interests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      service_submission_comments: {
        Row: {
          author_id: string | null;
          author_role: string;
          body: string;
          created_at: string;
          id: string;
          is_internal: boolean;
          org_id: string;
          service_id: string;
        };
        Insert: {
          author_id?: string | null;
          author_role?: string;
          body: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          org_id?: string;
          service_id: string;
        };
        Update: {
          author_id?: string | null;
          author_role?: string;
          body?: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          org_id?: string;
          service_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_submission_comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_comments_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_comments_service_tenant_fkey';
            columns: ['org_id', 'service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      service_submission_notifications: {
        Row: {
          created_at: string;
          created_by: string | null;
          current_service: Json | null;
          decision_comment_id: string | null;
          id: string;
          kind: string;
          org_id: string;
          previous_service: Json | null;
          read_at: string | null;
          read_by: string | null;
          recipient_id: string | null;
          service_id: string;
          service_interest_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          current_service?: Json | null;
          decision_comment_id?: string | null;
          id?: string;
          kind: string;
          org_id: string;
          previous_service?: Json | null;
          read_at?: string | null;
          read_by?: string | null;
          recipient_id?: string | null;
          service_id: string;
          service_interest_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          current_service?: Json | null;
          decision_comment_id?: string | null;
          id?: string;
          kind?: string;
          org_id?: string;
          previous_service?: Json | null;
          read_at?: string | null;
          read_by?: string | null;
          recipient_id?: string | null;
          service_id?: string;
          service_interest_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'service_submission_notifications_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_decision_comment_id_fkey';
            columns: ['decision_comment_id'];
            isOneToOne: false;
            referencedRelation: 'service_submission_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_read_by_fkey';
            columns: ['read_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_service_interest_id_fkey';
            columns: ['service_interest_id'];
            isOneToOne: false;
            referencedRelation: 'service_interests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_submission_notifications_service_tenant_fkey';
            columns: ['org_id', 'service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      services: {
        Row: {
          availability: string;
          category_id: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_role: string | null;
          cost_amount: number | null;
          cost_details: string | null;
          cost_type: string;
          created_at: string;
          created_by: string | null;
          description: Json | null;
          expires_at: string | null;
          external_url: string | null;
          id: string;
          location: string | null;
          metadata: Json;
          org_id: string;
          provider_name: string | null;
          published_at: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          schedule: string | null;
          status: string;
          submitted_by: string | null;
          title: Json;
          updated_at: string;
          zone: string | null;
        };
        Insert: {
          availability?: string;
          category_id: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          cost_amount?: number | null;
          cost_details?: string | null;
          cost_type?: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          expires_at?: string | null;
          external_url?: string | null;
          id?: string;
          location?: string | null;
          metadata?: Json;
          org_id?: string;
          provider_name?: string | null;
          published_at?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          schedule?: string | null;
          status?: string;
          submitted_by?: string | null;
          title: Json;
          updated_at?: string;
          zone?: string | null;
        };
        Update: {
          availability?: string;
          category_id?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          cost_amount?: number | null;
          cost_details?: string | null;
          cost_type?: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          expires_at?: string | null;
          external_url?: string | null;
          id?: string;
          location?: string | null;
          metadata?: Json;
          org_id?: string;
          provider_name?: string | null;
          published_at?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          schedule?: string | null;
          status?: string;
          submitted_by?: string | null;
          title?: Json;
          updated_at?: string;
          zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'services_category_tenant_fkey';
            columns: ['org_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'services_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'services_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'services_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'services_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_checkouts: {
        Row: {
          checked_in_at: string | null;
          checked_in_by: string | null;
          checked_out_at: string;
          checked_out_by: string | null;
          checked_out_to: string | null;
          created_at: string;
          expected_return_on: string;
          id: string;
          item_type_id: string;
          note: string | null;
          org_id: string;
          quantity: number;
          return_condition: string | null;
          returned_quantity: number | null;
          size: string | null;
        };
        Insert: {
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checked_out_at?: string;
          checked_out_by?: string | null;
          checked_out_to?: string | null;
          created_at?: string;
          expected_return_on: string;
          id?: string;
          item_type_id: string;
          note?: string | null;
          org_id: string;
          quantity: number;
          return_condition?: string | null;
          returned_quantity?: number | null;
          size?: string | null;
        };
        Update: {
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checked_out_at?: string;
          checked_out_by?: string | null;
          checked_out_to?: string | null;
          created_at?: string;
          expected_return_on?: string;
          id?: string;
          item_type_id?: string;
          note?: string | null;
          org_id?: string;
          quantity?: number;
          return_condition?: string | null;
          returned_quantity?: number | null;
          size?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_checkouts_checked_in_by_fkey';
            columns: ['checked_in_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_checkouts_checked_out_by_fkey';
            columns: ['checked_out_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_checkouts_checked_out_to_fkey';
            columns: ['checked_out_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_checkouts_item_type_id_fkey';
            columns: ['item_type_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_item_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_checkouts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          org_id: string;
          profile_id: string;
          role: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          org_id: string;
          profile_id: string;
          role: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          org_id?: string;
          profile_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_invitations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_invitations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_alerts: {
        Row: {
          id: string;
          item_type_id: string;
          opened_at: string;
          org_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          size: string | null;
        };
        Insert: {
          id?: string;
          item_type_id: string;
          opened_at?: string;
          org_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          size?: string | null;
        };
        Update: {
          id?: string;
          item_type_id?: string;
          opened_at?: string;
          org_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          size?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_alerts_item_type_id_fkey';
            columns: ['item_type_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_item_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_alerts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_alerts_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_counts: {
        Row: {
          counted_at: string;
          counted_by: string | null;
          created_at: string;
          id: string;
          item_type_id: string;
          lines: Json;
          note: string | null;
          org_id: string;
        };
        Insert: {
          counted_at?: string;
          counted_by?: string | null;
          created_at?: string;
          id?: string;
          item_type_id: string;
          lines: Json;
          note?: string | null;
          org_id: string;
        };
        Update: {
          counted_at?: string;
          counted_by?: string | null;
          created_at?: string;
          id?: string;
          item_type_id?: string;
          lines?: Json;
          note?: string | null;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_counts_counted_by_fkey';
            columns: ['counted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_counts_item_type_id_fkey';
            columns: ['item_type_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_item_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_counts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_movements: {
        Row: {
          arrival_id: string | null;
          checkout_id: string | null;
          condition: string | null;
          correction_reason: string | null;
          count_id: string | null;
          created_at: string;
          equipment_delivery_id: string | null;
          id: string;
          item_type_id: string;
          kind: string;
          occurred_at: string;
          org_id: string;
          participant_id: string | null;
          quantity: number;
          reason: string | null;
          recorded_by: string | null;
          size: string | null;
          unit_value_cents: number | null;
        };
        Insert: {
          arrival_id?: string | null;
          checkout_id?: string | null;
          condition?: string | null;
          correction_reason?: string | null;
          count_id?: string | null;
          created_at?: string;
          equipment_delivery_id?: string | null;
          id?: string;
          item_type_id: string;
          kind: string;
          occurred_at?: string;
          org_id: string;
          participant_id?: string | null;
          quantity: number;
          reason?: string | null;
          recorded_by?: string | null;
          size?: string | null;
          unit_value_cents?: number | null;
        };
        Update: {
          arrival_id?: string | null;
          checkout_id?: string | null;
          condition?: string | null;
          correction_reason?: string | null;
          count_id?: string | null;
          created_at?: string;
          equipment_delivery_id?: string | null;
          id?: string;
          item_type_id?: string;
          kind?: string;
          occurred_at?: string;
          org_id?: string;
          participant_id?: string | null;
          quantity?: number;
          reason?: string | null;
          recorded_by?: string | null;
          size?: string | null;
          unit_value_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_arrival_id_fkey';
            columns: ['arrival_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_arrivals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_checkout_id_fkey';
            columns: ['checkout_id'];
            isOneToOne: false;
            referencedRelation: 'staff_checkouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_count_id_fkey';
            columns: ['count_id'];
            isOneToOne: false;
            referencedRelation: 'stock_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_equipment_delivery_id_fkey';
            columns: ['equipment_delivery_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_deliveries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_item_type_id_fkey';
            columns: ['item_type_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_item_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      survey_questions: {
        Row: {
          created_at: string;
          id: string;
          options: Json | null;
          org_id: string;
          prompt: Json;
          question_type: string;
          required: boolean;
          sort_order: number;
          survey_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          options?: Json | null;
          org_id: string;
          prompt: Json;
          question_type: string;
          required?: boolean;
          sort_order: number;
          survey_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          options?: Json | null;
          org_id?: string;
          prompt?: Json;
          question_type?: string;
          required?: boolean;
          sort_order?: number;
          survey_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_questions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_questions_survey_tenant_fkey';
            columns: ['org_id', 'survey_id'];
            isOneToOne: false;
            referencedRelation: 'surveys';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      survey_responses: {
        Row: {
          answers_encrypted: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          org_id: string;
          player_id: string;
          status: string;
          survey_id: string;
          updated_at: string;
        };
        Insert: {
          answers_encrypted: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          player_id: string;
          status?: string;
          survey_id: string;
          updated_at?: string;
        };
        Update: {
          answers_encrypted?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          player_id?: string;
          status?: string;
          survey_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_responses_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_responses_player_tenant_fkey';
            columns: ['org_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'survey_responses_survey_tenant_fkey';
            columns: ['org_id', 'survey_id'];
            isOneToOne: false;
            referencedRelation: 'surveys';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      surveys: {
        Row: {
          audience_config: Json;
          audience_kind: string;
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          event_id: string | null;
          id: string;
          org_id: string;
          published_at: string;
          title: Json;
          updated_at: string;
        };
        Insert: {
          audience_config?: Json;
          audience_kind: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          id?: string;
          org_id: string;
          published_at: string;
          title: Json;
          updated_at?: string;
        };
        Update: {
          audience_config?: Json;
          audience_kind?: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          id?: string;
          org_id?: string;
          published_at?: string;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'surveys_creator_tenant_fkey';
            columns: ['org_id', 'created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'surveys_event_tenant_fkey';
            columns: ['org_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'surveys_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      targeted_notification_sends: {
        Row: {
          audience_config: Json;
          audience_kind: string;
          body: Json;
          created_at: string;
          id: string;
          org_id: string;
          recipient_count: number;
          sent_by: string | null;
          template_id: string | null;
          title: Json;
        };
        Insert: {
          audience_config?: Json;
          audience_kind: string;
          body: Json;
          created_at?: string;
          id?: string;
          org_id: string;
          recipient_count: number;
          sent_by?: string | null;
          template_id?: string | null;
          title: Json;
        };
        Update: {
          audience_config?: Json;
          audience_kind?: string;
          body?: Json;
          created_at?: string;
          id?: string;
          org_id?: string;
          recipient_count?: number;
          sent_by?: string | null;
          template_id?: string | null;
          title?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'targeted_notification_sends_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'targeted_notification_sends_sender_tenant_fkey';
            columns: ['org_id', 'sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'targeted_notification_sends_template_tenant_fkey';
            columns: ['org_id', 'template_id'];
            isOneToOne: false;
            referencedRelation: 'notification_templates';
            referencedColumns: ['org_id', 'id'];
          },
        ];
      };
      team_member_access: {
        Row: {
          org_id: string;
          preset_id: string | null;
          profile_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          org_id: string;
          preset_id?: string | null;
          profile_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          org_id?: string;
          preset_id?: string | null;
          profile_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'team_member_access_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_member_access_preset_fkey';
            columns: ['org_id', 'preset_id'];
            isOneToOne: false;
            referencedRelation: 'permission_presets';
            referencedColumns: ['org_id', 'id'];
          },
          {
            foreignKeyName: 'team_member_access_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_member_access_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      team_member_permissions: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          org_id: string;
          permission_code: string;
          profile_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          org_id: string;
          permission_code: string;
          profile_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          org_id?: string;
          permission_code?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_member_permissions_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_member_permissions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_member_permissions_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'team_member_permissions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      terms_acceptances: {
        Row: {
          accepted_at: string;
          id: string;
          is_test_fixture: boolean;
          locale_shown: string;
          profile_id: string;
          terms_version: string;
        };
        Insert: {
          accepted_at?: string;
          id?: string;
          is_test_fixture?: boolean;
          locale_shown: string;
          profile_id: string;
          terms_version: string;
        };
        Update: {
          accepted_at?: string;
          id?: string;
          is_test_fixture?: boolean;
          locale_shown?: string;
          profile_id?: string;
          terms_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'terms_acceptances_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      walk_in_signings: {
        Row: {
          collected_by: string | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          org_id: string;
          payload: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          resolved_profile_id: string | null;
          signed_at: string;
          status: string;
          version_id: string;
        };
        Insert: {
          collected_by?: string | null;
          created_at?: string;
          first_name: string;
          id: string;
          last_name: string;
          org_id: string;
          payload?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolved_profile_id?: string | null;
          signed_at: string;
          status?: string;
          version_id: string;
        };
        Update: {
          collected_by?: string | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          org_id?: string;
          payload?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolved_profile_id?: string | null;
          signed_at?: string;
          status?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'walk_in_signings_collected_by_fkey';
            columns: ['collected_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'walk_in_signings_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'walk_in_signings_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'walk_in_signings_resolved_profile_id_fkey';
            columns: ['resolved_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'walk_in_signings_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'authorization_versions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      attendance_category_stats: {
        Row: {
          absent_count: number | null;
          attendance_rate: number | null;
          category_color: string | null;
          category_id: string | null;
          category_name: Json | null;
          event_count: number | null;
          excused_count: number | null;
          latest_occurrence_at: string | null;
          marked_count: number | null;
          occurrence_count: number | null;
          org_id: string | null;
          present_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance_event_stats: {
        Row: {
          absent_count: number | null;
          attendance_rate: number | null;
          category_color: string | null;
          category_id: string | null;
          category_name: Json | null;
          event_id: string | null;
          event_location: string | null;
          event_title: Json | null;
          excused_count: number | null;
          latest_occurrence_at: string | null;
          marked_count: number | null;
          occurrence_count: number | null;
          org_id: string | null;
          present_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance_participant_stats: {
        Row: {
          absent_count: number | null;
          attendance_rate: number | null;
          excused_count: number | null;
          first_name: string | null;
          last_name: string | null;
          latest_occurrence_at: string | null;
          marked_count: number | null;
          org_id: string | null;
          player_id: string | null;
          present_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance_period_stats: {
        Row: {
          absent_count: number | null;
          attendance_rate: number | null;
          event_count: number | null;
          excused_count: number | null;
          marked_count: number | null;
          occurrence_count: number | null;
          org_id: string | null;
          period_start: string | null;
          present_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance_report_rows: {
        Row: {
          attendance_id: string | null;
          category_color: string | null;
          category_id: string | null;
          category_name: Json | null;
          ends_at: string | null;
          event_id: string | null;
          event_location: string | null;
          event_title: Json | null;
          first_name: string | null;
          is_test_account: boolean | null;
          last_name: string | null;
          marked_at: string | null;
          occurrence_id: string | null;
          org_id: string | null;
          player_id: string | null;
          starts_at: string | null;
          status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'event_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      municipality_compatibility_report: {
        Row: {
          legacy_value: string | null;
          profile_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_city_municipality_canonical_fkey';
            columns: ['legacy_value'];
            isOneToOne: false;
            referencedRelation: 'municipality_catalog';
            referencedColumns: ['canonical'];
          },
        ];
      };
    };
    Functions: {
      accept_my_entity_invitation: { Args: never; Returns: string };
      add_referral_update: {
        Args: {
          p_content: string;
          p_referral_id: string;
          p_update_type: string;
        };
        Returns: string;
      };
      anonymize_participant: {
        Args: { participant_id: string };
        Returns: undefined;
      };
      apply_permission_preset: {
        Args: { p_preset_id: string; p_profile_ids: string[] };
        Returns: number;
      };
      archive_custom_question: { Args: { p_id: string }; Returns: undefined };
      archive_intake_screen: { Args: { p_id: string }; Returns: undefined };
      assert_within_hourly_limit: {
        Args: { limited_action: string; maximum_per_hour: number };
        Returns: undefined;
      };
      authorize_push_dispatch: {
        Args: { dispatch_secret: string };
        Returns: boolean;
      };
      can_read_feedback_object: {
        Args: { p_object_key: string };
        Returns: boolean;
      };
      can_read_internal_document_object: {
        Args: { p_object_key: string };
        Returns: boolean;
      };
      can_read_media_object: {
        Args: { p_object_key: string };
        Returns: boolean;
      };
      can_read_stock_object: {
        Args: { p_object_key: string };
        Returns: boolean;
      };
      checkout_recipients: {
        Args: never;
        Returns: {
          first_name: string;
          last_name: string;
          profile_id: string;
        }[];
      };
      claim_push_deliveries: {
        Args: {
          claim_limit?: number;
          claimed_at?: string;
          claiming_worker_id: string;
          dispatch_secret: string;
        };
        Returns: {
          attempt_count: number;
          body: Json;
          content_id: string;
          content_type: string;
          delivery_id: string;
          expires_at: string;
          language: string;
          publication_id: string;
          push_token_id: string;
          recipient_id: string;
          title: Json;
          token: string;
        }[];
      };
      claim_push_receipts: {
        Args: {
          claim_limit?: number;
          claimed_at?: string;
          claiming_worker_id: string;
          dispatch_secret: string;
        };
        Returns: {
          delivery_id: string;
          push_token_id: string;
          receipt_attempt_count: number;
          ticket_id: string;
        }[];
      };
      complete_entity_referral: {
        Args: { p_profile_id: string; p_referral_id: string };
        Returns: undefined;
      };
      complete_media_item_deletion: {
        Args: {
          p_file_object_key: string;
          p_media_item_id: string;
          p_thumbnail_object_key: string;
        };
        Returns: undefined;
      };
      complete_mentoring_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      complete_onboarding: {
        Args: { payload: Json };
        Returns: {
          address: string | null;
          anonymized_at: string | null;
          applicant_status: string | null;
          applicant_status_details: string | null;
          avatar_url: string | null;
          childcare_need: string | null;
          city: string | null;
          clothing_size: string | null;
          collaborating_entity_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          document_name: string | null;
          document_number: string | null;
          document_type: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          first_name: string;
          has_dependents: boolean;
          health_info: string | null;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          is_test_account: boolean;
          last_name: string;
          media_consent_at: string | null;
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          place_of_birth: string | null;
          postal_code: string | null;
          preferred_language: string;
          prior_seasons: number;
          push_notifications_enabled: boolean;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
          search_document: unknown;
          season_number: number | null;
          sessions_valid_after: string | null;
          shoe_size: string | null;
          specific_needs: string | null;
          supporting_entities: string[] | null;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_onboarding_signed: {
        Args: { p_signing: Json; payload: Json };
        Returns: {
          address: string | null;
          anonymized_at: string | null;
          applicant_status: string | null;
          applicant_status_details: string | null;
          avatar_url: string | null;
          childcare_need: string | null;
          city: string | null;
          clothing_size: string | null;
          collaborating_entity_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          document_name: string | null;
          document_number: string | null;
          document_type: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          first_name: string;
          has_dependents: boolean;
          health_info: string | null;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          is_test_account: boolean;
          last_name: string;
          media_consent_at: string | null;
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          place_of_birth: string | null;
          postal_code: string | null;
          preferred_language: string;
          prior_seasons: number;
          push_notifications_enabled: boolean;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
          search_document: unknown;
          season_number: number | null;
          sessions_valid_after: string | null;
          shoe_size: string | null;
          specific_needs: string | null;
          supporting_entities: string[] | null;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_photo_handoff: {
        Args: {
          p_content_type: string;
          p_file_size: number;
          p_id: string;
          p_object_key: string;
        };
        Returns: string;
      };
      confirm_walk_in: {
        Args: { p_email: string; p_id: string };
        Returns: string;
      };
      count_services_incompatible_with_category_schema: {
        Args: { p_category_id: string; p_metadata_schema: Json };
        Returns: number;
      };
      create_collaborating_entity: { Args: { p_name: string }; Returns: string };
      create_data_export: {
        Args: {
          p_confirmed?: boolean;
          p_dataset: string;
          p_end_date?: string;
          p_format: string;
          p_reason?: string;
          p_scope: string;
          p_start_date?: string;
        };
        Returns: Json;
      };
      create_entity_referral: { Args: { p_payload: Json }; Returns: string };
      create_feedback_submission: {
        Args: { p_content: string; p_image_url: string; p_type: string };
        Returns: string;
      };
      create_forum_post: {
        Args: { p_category_id: string; p_content: string; p_image_url: string };
        Returns: string;
      };
      create_forum_reply: {
        Args: { p_content: string; p_post_id: string };
        Returns: string;
      };
      create_media_item: {
        Args: {
          p_caption: string;
          p_consent_acknowledged: boolean;
          p_consent_version: string;
          p_file_size: number;
          p_file_type: string;
          p_file_url: string;
          p_privacy_level: string;
          p_thumbnail_url: string;
        };
        Returns: string;
      };
      create_mentoring_request: {
        Args: {
          p_preferred_date: string;
          p_preferred_time: string;
          p_topic: string;
          p_topic_detail: string;
        };
        Returns: string;
      };
      create_participant_invite: {
        Args: { payload: Json };
        Returns: {
          email: string;
          expires_at: string;
          invite_id: string;
          profile_id: string;
        }[];
      };
      create_photo_handoff: {
        Args: { p_document_name: string; p_target: string };
        Returns: {
          expires_at: string;
          handoff_id: string;
        }[];
      };
      create_season: {
        Args: { p_make_current: boolean; p_name: string; p_starts_on: string };
        Returns: string;
      };
      create_survey_export: { Args: { p_survey_id: string }; Returns: Json };
      create_targeted_notification_send: {
        Args: {
          p_audience_config: Json;
          p_audience_kind: string;
          p_body: Json;
          p_expected_recipient_count: number;
          p_template_id: string;
          p_title: Json;
        };
        Returns: string;
      };
      current_app_role: { Args: never; Returns: string };
      current_authorization_for_signing: {
        Args: never;
        Returns: {
          content: Json;
          season_name: string;
          version_id: string;
          version_number: number;
        }[];
      };
      current_collaborating_entity_id: { Args: never; Returns: string };
      current_org_id: { Args: never; Returns: string };
      decrypt_field: { Args: { ciphertext: string }; Returns: string };
      default_organization_id: { Args: never; Returns: string };
      delete_custom_notification_group: {
        Args: { p_id: string };
        Returns: undefined;
      };
      delete_forum_category: {
        Args: { p_category_id: string };
        Returns: undefined;
      };
      delete_intake_state_preset: { Args: { p_id: string }; Returns: undefined };
      delete_notification_template: {
        Args: { p_id: string };
        Returns: undefined;
      };
      delete_own_forum_post: { Args: { p_post_id: string }; Returns: undefined };
      delete_participant_permanently: {
        Args: { participant_id: string };
        Returns: undefined;
      };
      delete_permission_preset: {
        Args: { p_preset_id: string };
        Returns: undefined;
      };
      delete_test_player: {
        Args: { p_participant_id: string };
        Returns: undefined;
      };
      discard_walk_in: { Args: { p_id: string }; Returns: undefined };
      edit_own_forum_post: {
        Args: { p_content: string; p_post_id: string };
        Returns: undefined;
      };
      encrypt_field: { Args: { plaintext: string }; Returns: string };
      encryption_key: { Args: never; Returns: string };
      feedback_monthly_counts: {
        Args: never;
        Returns: {
          count: number;
          month: string;
          type: string;
        }[];
      };
      flag_forum_content: {
        Args: {
          p_comment: string;
          p_reason: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: string;
      };
      get_audit_log_page: {
        Args: {
          p_action?: string;
          p_actor_id?: string;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_end_date?: string;
          p_page_size?: number;
          p_start_date?: string;
          p_target_id?: string;
          p_target_type?: string;
        };
        Returns: Json;
      };
      get_conversation_peer: {
        Args: { p_user_id: string };
        Returns: {
          city: string;
          first_name: string;
          id: string;
          last_name: string;
          preferred_language: string;
          role: string;
        }[];
      };
      get_document_step_explanation: { Args: never; Returns: Json };
      get_entity_impact_summary: {
        Args: never;
        Returns: {
          active_count: number;
          attendance_eligible_count: number;
          attendance_marked_count: number;
          attendance_present_count: number;
          attendance_rate: number;
          inactive_count: number;
          referred_count: number;
          suppressed: boolean;
        }[];
      };
      get_entity_referral: {
        Args: { p_referral_id: string };
        Returns: {
          assigned_staff_id: string;
          consent_confirmed_at: string;
          created_at: string;
          documentation_status: string;
          entity_name: string;
          entity_user_id: string;
          id: string;
          intake_answers: Json;
          notes: string;
          referred_email: string;
          referred_first_name: string;
          referred_last_name: string;
          referred_phone: string;
          referred_profile_id: string;
          status: string;
          updated_at: string;
        }[];
      };
      get_impact_report: {
        Args: {
          p_category_id?: string;
          p_collaborating_entity_id?: string;
          p_end_date: string;
          p_start_date: string;
        };
        Returns: Json;
      };
      get_or_create_own_conversation: {
        Args: never;
        Returns: {
          assigned_staff_id: string | null;
          created_at: string;
          id: string;
          org_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'conversations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_or_create_staff_conversation: {
        Args: { p_participant_id: string };
        Returns: string;
      };
      get_own_profile: {
        Args: never;
        Returns: {
          address: string;
          applicant_status: string;
          applicant_status_details: string;
          avatar_url: string;
          childcare_need: string;
          city: string;
          clothing_size: string;
          date_of_birth: string;
          document_name: string;
          document_number: string;
          document_type: string;
          emergency_contact_name: string;
          emergency_contact_phone: string;
          emergency_contact_relation: string;
          first_name: string;
          has_dependents: boolean;
          health_info: string;
          id: string;
          last_name: string;
          media_consent: boolean;
          nationality: string;
          num_dependents: number;
          phone: string;
          place_of_birth: string;
          postal_code: string;
          preferred_language: string;
          reference_contact_name: string;
          reference_entity: string;
          season_number: number;
          shoe_size: string;
          specific_needs: string;
          supporting_entities: string[];
          terms_accepted_at: string;
        }[];
      };
      get_own_service_contacts: {
        Args: never;
        Returns: {
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          contact_role: string;
          provider_name: string;
        }[];
      };
      get_own_survey_response: {
        Args: { p_survey_id: string };
        Returns: {
          answers: Json;
          completed_at: string;
          id: string;
          status: string;
          updated_at: string;
        }[];
      };
      get_participant_profile: {
        Args: { participant_id: string };
        Returns: {
          address: string;
          anonymized_at: string;
          applicant_status: string;
          applicant_status_details: string;
          avatar_url: string;
          childcare_need: string;
          city: string;
          clothing_size: string;
          created_at: string;
          date_of_birth: string;
          document_name: string;
          document_number: string;
          document_type: string;
          emergency_contact_name: string;
          emergency_contact_phone: string;
          emergency_contact_relation: string;
          first_name: string;
          has_dependents: boolean;
          health_info: string;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          is_test_account: boolean;
          last_name: string;
          media_consent: boolean;
          nationality: string;
          num_dependents: number;
          phone: string;
          place_of_birth: string;
          postal_code: string;
          preferred_language: string;
          reference_contact_name: string;
          reference_entity: string;
          season_number: number;
          shoe_size: string;
          specific_needs: string;
          supporting_entities: string[];
          terms_accepted_at: string;
          updated_at: string;
        }[];
      };
      get_public_organization_branding: {
        Args: { organization_slug: string };
        Returns: {
          primary_color: string;
          secondary_color: string;
        }[];
      };
      get_public_organization_logo: {
        Args: { organization_slug: string };
        Returns: string;
      };
      get_service_review_queue: {
        Args: {
          p_category_id: string;
          p_kind: string;
          p_page: number;
          p_query: string;
        };
        Returns: {
          category_id: string;
          changed_at: string;
          contact_name: string;
          current_service: Json;
          item_id: string;
          item_kind: string;
          previous_service: Json;
          provider_name: string;
          service_id: string;
          status: string;
          title: Json;
          total_count: number;
        }[];
      };
      get_unread_message_count: {
        Args: { p_conversation_id?: string };
        Returns: number;
      };
      has_own_attendance_for_event: {
        Args: { attended_event_id: string };
        Returns: boolean;
      };
      has_permission: { Args: { p_code: string }; Returns: boolean };
      immutable_unaccent: { Args: { value: string }; Returns: string };
      intake_catalog: { Args: never; Returns: Json };
      invite_entity_collaborator: {
        Args: {
          p_collaborating_entity_id: string;
          p_email: string;
          p_first_name: string;
          p_last_name: string;
        };
        Returns: {
          email: string;
          expires_at: string;
          invitation_id: string;
          profile_id: string;
        }[];
      };
      invite_staff_member: {
        Args: {
          p_email: string;
          p_first_name: string;
          p_last_name: string;
          p_role: string;
        };
        Returns: {
          email: string;
          expires_at: string;
          profile_id: string;
        }[];
      };
      is_allowed_video_url: { Args: { video_url: string }; Returns: boolean };
      is_content_visible: {
        Args: {
          content_status: string;
          expires_at: string;
          published_at: string;
          visible_at?: string;
        };
        Returns: boolean;
      };
      is_deletable_test_player: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
      is_event_recurrence_rule_valid: {
        Args: { recurrence_rule: string };
        Returns: boolean;
      };
      is_knowledge_body_valid: {
        Args: { content: Json; require_all_languages?: boolean };
        Returns: boolean;
      };
      is_knowledge_body_valid_for_language: {
        Args: { content: Json; source_language: string };
        Returns: boolean;
      };
      is_localized_content_valid: {
        Args: {
          content: Json;
          maximum_length: number;
          require_all_languages?: boolean;
        };
        Returns: boolean;
      };
      is_localized_content_valid_for_language: {
        Args: { content: Json; max_length: number; source_language: string };
        Returns: boolean;
      };
      is_service_metadata_schema_valid: {
        Args: { metadata_schema: Json };
        Returns: boolean;
      };
      is_service_metadata_valid: {
        Args: { metadata: Json; metadata_schema: Json };
        Returns: boolean;
      };
      is_story_image_urls_valid: {
        Args: {
          expected_author_id: string;
          expected_org_id: string;
          image_urls: string[];
        };
        Returns: boolean;
      };
      is_story_status_transition_allowed: {
        Args: { new_status: string; old_status: string };
        Returns: boolean;
      };
      is_team_member: { Args: never; Returns: boolean };
      list_authorization_versions: {
        Args: never;
        Returns: {
          content: Json;
          id: string;
          is_current: boolean;
          published_at: string;
          season_id: string;
          season_name: string;
          version_number: number;
        }[];
      };
      list_collaborating_entities: {
        Args: never;
        Returns: {
          active_collaborator_count: number;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          pending_invitation_count: number;
          referral_count: number;
          updated_at: string;
        }[];
      };
      list_entity_collaborators: {
        Args: { p_collaborating_entity_id: string };
        Returns: {
          accepted_at: string;
          email: string;
          first_name: string;
          invited_at: string;
          is_active: boolean;
          last_name: string;
          profile_id: string;
        }[];
      };
      list_entity_participation_trend: {
        Args: never;
        Returns: {
          attendance_eligible_count: number;
          attendance_marked_count: number;
          attendance_present_count: number;
          attendance_rate: number;
          month_start: string;
          participant_count: number;
        }[];
      };
      list_entity_referral_tracking: {
        Args: never;
        Returns: {
          attendance_absent_count: number;
          attendance_excused_count: number;
          attendance_marked_count: number;
          attendance_present_count: number;
          attendance_rate: number;
          latest_occurrence_at: string;
          referral_id: string;
          referred_first_name: string;
          referred_last_name: string;
          referred_profile_id: string;
          status: string;
        }[];
      };
      list_entity_referrals: {
        Args: never;
        Returns: {
          assigned_staff_id: string;
          created_at: string;
          documentation_status: string;
          entity_name: string;
          entity_user_id: string;
          id: string;
          notes: string;
          referred_email: string;
          referred_first_name: string;
          referred_last_name: string;
          referred_phone: string;
          referred_profile_id: string;
          status: string;
          updated_at: string;
        }[];
      };
      list_entity_upcoming_events: {
        Args: never;
        Returns: {
          category_id: string;
          description: Json;
          ends_at: string;
          id: string;
          is_recurring: boolean;
          location: string;
          location_url: string;
          starts_at: string;
          time_zone: string;
          title: Json;
        }[];
      };
      list_forum_moderation_queue: {
        Args: never;
        Returns: {
          author_first_name: string;
          author_id: string;
          category_id: string;
          comments: Json;
          content: string;
          first_flagged_at: string;
          flag_count: number;
          is_pinned: boolean;
          media_file_type: string;
          media_file_url: string;
          media_thumbnail_url: string;
          post_id: string;
          reasons: Json;
          target_id: string;
          target_type: string;
          visibility: string;
        }[];
      };
      list_notification_send_history: {
        Args: never;
        Returns: {
          audience_config: Json;
          audience_kind: string;
          created_at: string;
          delivered_count: number;
          device_count: number;
          failed_count: number;
          id: string;
          recipient_count: number;
          sent_by: string;
          sent_count: number;
          state: string;
          template_id: string;
        }[];
      };
      list_own_feedback_submissions: {
        Args: never;
        Returns: {
          content: string;
          created_at: string;
          id: string;
          image_url: string;
          resolved_at: string;
          status: string;
          type: string;
          updated_at: string;
        }[];
      };
      list_own_mentoring_requests: {
        Args: never;
        Returns: {
          assigned_staff_name: string;
          completed_at: string;
          created_at: string;
          id: string;
          preferred_date: string;
          preferred_time: string;
          scheduled_at: string;
          status: string;
          topic: string;
          topic_detail: string;
          updated_at: string;
        }[];
      };
      list_participants: {
        Args: {
          p_dependents?: string;
          p_dir?: string;
          p_entity?: string;
          p_nationality?: string;
          p_page?: number;
          p_page_size?: number;
          p_query?: string;
          p_sort?: string;
          p_status?: string;
        };
        Returns: {
          city: string;
          created_at: string;
          first_name: string;
          has_dependents: boolean;
          id: string;
          is_active: boolean;
          is_test_account: boolean;
          joined: boolean;
          last_name: string;
          nationality: string;
          num_dependents: number;
          preferred_language: string;
          reference_entity: string;
          total_count: number;
        }[];
      };
      list_player_surveys: {
        Args: never;
        Returns: {
          closes_at: string;
          completed_at: string;
          event_id: string;
          id: string;
          published_at: string;
          questions: Json;
          response_status: string;
          title: Json;
        }[];
      };
      list_referral_updates: {
        Args: { p_referral_id: string };
        Returns: {
          author_name: string;
          content: string;
          created_at: string;
          id: string;
          update_type: string;
        }[];
      };
      list_staff_conversations: {
        Args: {
          p_assigned_to_me?: boolean;
          p_participant_role?: string;
          p_query?: string;
          p_unread_only?: boolean;
        };
        Returns: {
          assigned_staff_first_name: string;
          assigned_staff_id: string;
          assigned_staff_last_name: string;
          conversation_created_at: string;
          conversation_id: string;
          latest_message_at: string;
          latest_message_preview: string;
          latest_sender_id: string;
          participant_city: string;
          participant_first_name: string;
          participant_id: string;
          participant_language: string;
          participant_last_name: string;
          participant_role: string;
          unread_count: number;
        }[];
      };
      list_staff_feedback_submissions: {
        Args: { p_status?: string; p_type?: string };
        Returns: {
          author_first_name: string;
          author_id: string;
          author_last_name: string;
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          image_url: string;
          resolved_at: string;
          resolved_by: string;
          status: string;
          type: string;
          updated_at: string;
        }[];
      };
      list_staff_members: {
        Args: never;
        Returns: {
          email: string;
          first_name: string;
          invited_at: string;
          is_active: boolean;
          is_test_account: boolean;
          last_name: string;
          profile_id: string;
          role: string;
        }[];
      };
      list_staff_mentoring_requests: {
        Args: never;
        Returns: {
          assigned_staff_id: string;
          assigned_staff_name: string;
          completed_at: string;
          created_at: string;
          id: string;
          player_first_name: string;
          player_id: string;
          player_last_name: string;
          preferred_date: string;
          preferred_time: string;
          scheduled_at: string;
          staff_notes: string;
          status: string;
          topic: string;
          topic_detail: string;
          updated_at: string;
        }[];
      };
      list_staff_referrals: {
        Args: { p_status?: string };
        Returns: {
          assigned_staff_id: string;
          created_at: string;
          documentation_status: string;
          entity_name: string;
          entity_user_id: string;
          id: string;
          notes: string;
          referred_email: string;
          referred_first_name: string;
          referred_last_name: string;
          referred_phone: string;
          referred_profile_id: string;
          status: string;
          updated_at: string;
        }[];
      };
      list_supporting_entity_names: { Args: never; Returns: string[] };
      list_survey_responses: {
        Args: { p_survey_id: string };
        Returns: {
          answers: Json;
          completed_at: string;
          id: string;
          language: string;
          player_id: string;
          player_name: string;
          status: string;
          updated_at: string;
        }[];
      };
      list_surveys: {
        Args: never;
        Returns: {
          audience_config: Json;
          audience_kind: string;
          closes_at: string;
          completed_count: number;
          event_id: string;
          id: string;
          published_at: string;
          questions: Json;
          response_count: number;
          title: Json;
        }[];
      };
      list_walk_in_signings: {
        Args: never;
        Returns: {
          collected_by_name: string;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          signed_at: string;
        }[];
      };
      mark_attendance: {
        Args: {
          attendance_marked_at: string;
          attendance_occurrence_id: string;
          attendance_player_id: string;
          attendance_status: string;
        };
        Returns: {
          id: string;
          marked_at: string;
          marked_by: string | null;
          occurrence_id: string;
          org_id: string;
          player_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'attendance';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string; p_message_id: string };
        Returns: undefined;
      };
      merge_walk_in: {
        Args: { p_id: string; p_profile_id: string };
        Returns: undefined;
      };
      moderate_forum_target: {
        Args: { p_action: string; p_target_id: string; p_target_type: string };
        Returns: undefined;
      };
      monthly_stock_count: {
        Args: never;
        Returns: {
          item_key: string;
          item_type_id: string;
          last_counted_at: string;
        }[];
      };
      my_answered_questions: { Args: never; Returns: string[] };
      my_authorization_status: {
        Args: never;
        Returns: {
          content: Json;
          is_returning: boolean;
          required: boolean;
          season_id: string;
          season_name: string;
          version_id: string;
          version_number: number;
        }[];
      };
      my_consents: {
        Args: never;
        Returns: {
          consent_key: string;
          decided_at: string;
          granted: boolean;
        }[];
      };
      my_custom_answers: {
        Args: never;
        Returns: {
          question_id: string;
          value: Json;
        }[];
      };
      my_entity_invitation: {
        Args: never;
        Returns: {
          collaborating_entity_id: string;
          entity_name: string;
          invitation_id: string;
          invited_at: string;
        }[];
      };
      my_pending_invite: {
        Args: never;
        Returns: {
          invited_at: string;
          reference_entity: string;
        }[];
      };
      my_permissions: { Args: never; Returns: string[] };
      my_questions_to_ask: { Args: never; Returns: string[] };
      my_session_is_current: { Args: never; Returns: boolean };
      my_test_scenario_stamp: { Args: never; Returns: string };
      open_staff_checkouts: {
        Args: never;
        Returns: {
          checked_out_at: string;
          checkout_id: string;
          expected_return_on: string;
          is_overdue: boolean;
          item_key: string;
          note: string;
          quantity: number;
          size: string;
          staff_first_name: string;
          staff_id: string;
          staff_last_name: string;
        }[];
      };
      participant_activity: {
        Args: { participant_id: string };
        Returns: {
          detail: string;
          id: string;
          kind: string;
          occurred_at: string;
          title: string;
        }[];
      };
      participant_authorizations: {
        Args: { p_profile_id: string };
        Returns: {
          id: string;
          language: string;
          method: string;
          paper_signed_on: string;
          season_name: string;
          signature: Json;
          signed_at: string;
          unable_to_draw: boolean;
          version_number: number;
        }[];
      };
      participant_consents: {
        Args: { p_profile_id: string };
        Returns: {
          consent_key: string;
          decided_at: string;
          granted: boolean;
          method: string;
        }[];
      };
      participant_custom_answers: {
        Args: { p_profile_id: string };
        Returns: {
          answered_at: string;
          question_id: string;
          season_id: string;
          season_name: string;
          source: string;
          value: Json;
        }[];
      };
      participant_filter_options: {
        Args: never;
        Returns: {
          entities: string[];
          nationalities: string[];
        }[];
      };
      participant_material: {
        Args: { p_participant_id: string };
        Returns: {
          delivered_on: string;
          delivery_id: string;
          item_key: string;
          mode: string;
          return_condition: string;
          returned_at: string;
          signature_state: string;
          size: string;
          unit_code: string;
        }[];
      };
      participant_material_detail: {
        Args: { p_delivery_id: string };
        Returns: {
          delivered_by_name: string;
          delivery_id: string;
          note: string;
          returned_by_name: string;
          signature: Json;
          signature_reason: string;
          signature_state: string;
          statement_language: string;
        }[];
      };
      participant_question_states: {
        Args: { p_profile_id: string };
        Returns: {
          question: string;
          state: string;
        }[];
      };
      participant_season_answers: {
        Args: { p_profile_id: string };
        Returns: {
          applicant_status: string;
          applicant_status_details: string;
          childcare_need: string;
          season_name: string;
          specific_needs: string;
          starts_on: string;
          supporting_entities: string[];
          updated_at: string;
        }[];
      };
      personal_data_disposition: {
        Args: never;
        Returns: {
          disposition: string;
          participant_column: string;
          reason: string;
          table_name: string;
        }[];
      };
      prepare_media_item_deletion: {
        Args: { p_media_item_id: string };
        Returns: {
          file_object_key: string;
          thumbnail_object_key: string;
        }[];
      };
      preview_notification_audience: {
        Args: { p_audience_config?: Json; p_audience_kind: string };
        Returns: {
          device_count: number;
          full_name: string;
          language: string;
          participant_id: string;
        }[];
      };
      publish_authorization_version: {
        Args: { p_content: Json };
        Returns: string;
      };
      purge_expired_entity_invitations: {
        Args: { p_now?: string };
        Returns: number;
      };
      purge_expired_entity_referrals: {
        Args: { p_now?: string };
        Returns: number;
      };
      record_equipment_arrival: {
        Args: {
          p_id: string;
          p_lines: Json;
          p_photos?: Json;
          p_problems?: string;
          p_received_at: string;
          p_source: string;
          p_source_name?: string;
          p_total_cost_cents?: number;
        };
        Returns: string;
      };
      record_equipment_handover: {
        Args: {
          p_handed_over_at: string;
          p_id: string;
          p_item_type_id: string;
          p_mode: string;
          p_note?: string;
          p_participant_id: string;
          p_signature?: Json;
          p_signature_reason?: string;
          p_signature_state: string;
          p_size: string;
          p_statement_language?: string;
        };
        Returns: {
          delivery_id: string;
          stock_after: number;
          unit_code: string;
        }[];
      };
      record_equipment_return: {
        Args: { p_condition: string; p_delivery_id: string };
        Returns: undefined;
      };
      record_paper_authorization: {
        Args: { p_profile_id: string; p_signed_on: string };
        Returns: string;
      };
      record_push_delivery_results: {
        Args: {
          dispatch_secret: string;
          recorded_at?: string;
          recording_worker_id: string;
          results: Json;
        };
        Returns: number;
      };
      record_push_receipt_results: {
        Args: {
          dispatch_secret: string;
          recorded_at?: string;
          recording_worker_id: string;
          results: Json;
        };
        Returns: number;
      };
      record_staff_checkin: {
        Args: {
          p_checkout_id: string;
          p_condition?: string;
          p_returned: number;
        };
        Returns: undefined;
      };
      record_staff_checkout: {
        Args: {
          p_expected_return_on: string;
          p_id: string;
          p_item_type_id: string;
          p_note?: string;
          p_quantity: number;
          p_size: string;
          p_staff_id: string;
        };
        Returns: string;
      };
      record_staff_device_signature: {
        Args: {
          p_payload: Json;
          p_profile_id: string;
          p_signature_id: string;
          p_signed_at: string;
          p_version_id: string;
        };
        Returns: string;
      };
      record_stock_count: {
        Args: {
          p_id: string;
          p_item_type_id: string;
          p_lines: Json;
          p_note?: string;
          p_reason?: string;
        };
        Returns: {
          corrections: number;
          count_id: string;
        }[];
      };
      referral_answer_keys: {
        Args: { p_referral_id: string };
        Returns: string[];
      };
      referral_custom_answers: {
        Args: { p_referral_id: string };
        Returns: {
          question_id: string;
          value: Json;
        }[];
      };
      register_internal_document: {
        Args: {
          p_content_type: string;
          p_file_size: number;
          p_name: string;
          p_object_key: string;
        };
        Returns: string;
      };
      remove_staff_member: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      renew_participant_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
      reorder_custom_questions: {
        Args: { p_ids: string[]; p_screen_id: string };
        Returns: undefined;
      };
      reorder_intake_screens: {
        Args: { p_after_screen: string; p_ids: string[] };
        Returns: undefined;
      };
      reorder_service_categories: {
        Args: { p_category_ids: string[] };
        Returns: undefined;
      };
      reset_second_factor: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      restore_permission_preset_default: {
        Args: { p_preset_id: string };
        Returns: undefined;
      };
      resubmit_entity_service: {
        Args: { p_service_id: string };
        Returns: undefined;
      };
      review_entity_service: {
        Args: {
          p_comment: string;
          p_decision: string;
          p_payload: Json;
          p_service_id: string;
        };
        Returns: string;
      };
      revoke_participant_invite: {
        Args: { p_invite_id: string };
        Returns: undefined;
      };
      save_admin_service: { Args: { p_payload: Json }; Returns: string };
      save_builtin_question_override: {
        Args: {
          p_help: Json;
          p_is_hidden: boolean;
          p_label: Json;
          p_option_overrides: Json;
          p_question: string;
        };
        Returns: undefined;
      };
      save_custom_notification_group: {
        Args: { p_id: string; p_name: string; p_participant_ids: string[] };
        Returns: string;
      };
      save_custom_question: {
        Args: {
          p_help: Json;
          p_id: string;
          p_label: Json;
          p_options?: Json;
          p_placements: string[];
          p_privacy: string;
          p_screen_id: string;
          p_type: string;
        };
        Returns: string;
      };
      save_entity_service: { Args: { p_payload: Json }; Returns: string };
      save_forum_category: {
        Args: {
          p_category_id: string;
          p_color: string;
          p_icon: string;
          p_name: Json;
          p_slug: string;
          p_sort_order: number;
        };
        Returns: string;
      };
      save_intake_screen: {
        Args: {
          p_after_screen: string;
          p_id: string;
          p_intro: Json;
          p_title: Json;
        };
        Returns: string;
      };
      save_intake_state_preset: {
        Args: { p_id: string; p_name: string; p_states: Json };
        Returns: string;
      };
      save_item_type: {
        Args: {
          p_code_prefix: string;
          p_default_value_cents: number;
          p_id: string;
          p_is_active: boolean;
          p_kind: string;
          p_name: Json;
          p_sizes: string[];
        };
        Returns: string;
      };
      save_my_custom_answers: { Args: { p_answers: Json }; Returns: undefined };
      save_notification_template: {
        Args: {
          p_body: Json;
          p_category: string;
          p_id: string;
          p_name: string;
          p_title: Json;
        };
        Returns: string;
      };
      save_permission_preset: {
        Args: {
          p_name: string;
          p_permission_codes: string[];
          p_preset_id: string;
        };
        Returns: string;
      };
      save_referral_custom_answers: {
        Args: { p_answers: Json; p_referral_id: string };
        Returns: undefined;
      };
      save_survey: {
        Args: {
          p_audience_config: Json;
          p_audience_kind: string;
          p_closes_at: string;
          p_event_id: string;
          p_id: string;
          p_published_at: string;
          p_questions: Json;
          p_title: Json;
        };
        Returns: string;
      };
      save_survey_response: {
        Args: { p_answers: Json; p_complete?: boolean; p_survey_id: string };
        Returns: string;
      };
      schedule_mentoring_request: {
        Args: {
          p_assigned_staff_id: string;
          p_request_id: string;
          p_scheduled_at: string;
          p_staff_notes: string;
        };
        Returns: undefined;
      };
      search_internal_documents: {
        Args: { p_query?: string };
        Returns: {
          content_type: string;
          created_at: string;
          file_size: number;
          id: string;
          name: string;
          object_key: string;
          uploaded_by: string;
          uploader_name: string;
        }[];
      };
      season_registration_status: {
        Args: { p_season_id?: string };
        Returns: {
          first_name: string;
          last_name: string;
          method: string;
          profile_id: string;
          registered: boolean;
          signed_at: string;
        }[];
      };
      send_message: {
        Args: {
          p_content: string;
          p_conversation_id: string;
          p_image_url: string;
          p_message_id: string;
        };
        Returns: {
          content: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          image_url: string | null;
          org_id: string;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_collaborating_entity_active: {
        Args: { p_collaborating_entity_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      set_conversation_assignment: {
        Args: { p_conversation_id: string; p_staff_id: string };
        Returns: undefined;
      };
      set_current_season: { Args: { p_season_id: string }; Returns: undefined };
      set_document_step_explanation: {
        Args: { p_explanation: Json };
        Returns: Json;
      };
      set_entity_collaborator_active: {
        Args: { p_is_active: boolean; p_profile_id: string };
        Returns: undefined;
      };
      set_forum_post_category: {
        Args: { p_category_id: string; p_post_id: string };
        Returns: undefined;
      };
      set_forum_post_pinned: {
        Args: { p_is_pinned: boolean; p_post_id: string };
        Returns: undefined;
      };
      set_forum_posting_disabled: {
        Args: { p_disabled: boolean; p_participant_id: string };
        Returns: undefined;
      };
      set_intake_question_states: {
        Args: { p_profile_id: string; p_states: Json };
        Returns: undefined;
      };
      set_media_item_moderation: {
        Args: { p_media_item_id: string; p_state: string };
        Returns: undefined;
      };
      set_media_item_privacy: {
        Args: { p_media_item_id: string; p_privacy_level: string };
        Returns: undefined;
      };
      set_optional_consent: {
        Args: { p_granted: boolean; p_key: string };
        Returns: undefined;
      };
      set_participant_active: {
        Args: { next_is_active: boolean; participant_id: string };
        Returns: undefined;
      };
      set_participant_custom_answers: {
        Args: { p_answers: Json; p_profile_id: string };
        Returns: undefined;
      };
      set_prior_seasons: {
        Args: { p_count: number; p_profile_id: string };
        Returns: undefined;
      };
      set_service_interest: {
        Args: { p_interested: boolean; p_service_id: string };
        Returns: boolean;
      };
      set_staff_member_role: {
        Args: { p_profile_id: string; p_role: string };
        Returns: undefined;
      };
      set_team_member_permissions: {
        Args: {
          p_permission_codes: string[];
          p_preset_id?: string;
          p_profile_id: string;
        };
        Returns: undefined;
      };
      set_team_member_test_account: {
        Args: { p_is_test_account: boolean; p_profile_id: string };
        Returns: undefined;
      };
      set_test_player_scenario: {
        Args: { p_change: Json; p_profile_id: string };
        Returns: undefined;
      };
      sign_authorization: {
        Args: { p_payload: Json; p_version_id: string };
        Returns: string;
      };
      sign_out_everywhere: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      start_player_preview: { Args: never; Returns: Json };
      stock_levels: {
        Args: never;
        Returns: {
          item_key: string;
          item_type_id: string;
          kind: string;
          quantity: number;
          size: string;
        }[];
      };
      submit_walk_in_signing: {
        Args: {
          p_first_name: string;
          p_id: string;
          p_last_name: string;
          p_payload: Json;
          p_signed_at: string;
          p_version_id: string;
        };
        Returns: string;
      };
      test_player_scenario: { Args: { p_profile_id: string }; Returns: Json };
      test_sign_in_account: { Args: { p_email: string }; Returns: string };
      test_sign_in_record_success: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      test_sign_in_register_attempt: {
        Args: { p_email: string; p_network: string };
        Returns: boolean;
      };
      transition_deletion_request: {
        Args: {
          p_request_id: string;
          p_resolution_note?: string;
          p_state: string;
        };
        Returns: undefined;
      };
      transition_feedback_submission: {
        Args: { p_status: string; p_submission_id: string };
        Returns: undefined;
      };
      update_my_season_answers: {
        Args: { p_payload: Json };
        Returns: undefined;
      };
      update_organization_settings: {
        Args: {
          p_available_languages: string[];
          p_contact_email: string;
          p_contact_phone: string;
          p_default_language: string;
          p_logo_url: string;
          p_name: string;
          p_primary_color: string;
          p_secondary_color: string;
        };
        Returns: {
          available_languages: string[];
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          default_language: string;
          document_step_explanation: Json | null;
          id: string;
          locked_default_language: string | null;
          logo_url: string | null;
          name: string;
          primary_color: string;
          secondary_color: string;
          slug: string;
        };
        SetofOptions: {
          from: '*';
          to: 'organizations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_own_profile: { Args: { payload: Json }; Returns: undefined };
      update_participant_profile: {
        Args: { participant_id: string; payload: Json };
        Returns: undefined;
      };
      user_is_in_current_org: {
        Args: { target_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
