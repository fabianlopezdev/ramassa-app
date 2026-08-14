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
      entity_referrals: {
        Row: {
          assigned_staff_id: string | null;
          created_at: string;
          documentation_status: string;
          entity_user_id: string;
          id: string;
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
          created_at?: string;
          documentation_status: string;
          entity_user_id: string;
          id?: string;
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
          created_at?: string;
          documentation_status?: string;
          entity_user_id?: string;
          id?: string;
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
      equipment_deliveries: {
        Row: {
          created_at: string;
          delivered_by: string;
          delivered_on: string;
          id: string;
          item: string;
          note: string | null;
          profile_id: string;
          size: string | null;
        };
        Insert: {
          created_at?: string;
          delivered_by: string;
          delivered_on?: string;
          id?: string;
          item: string;
          note?: string | null;
          profile_id: string;
          size?: string | null;
        };
        Update: {
          created_at?: string;
          delivered_by?: string;
          delivered_on?: string;
          id?: string;
          item?: string;
          note?: string | null;
          profile_id?: string;
          size?: string | null;
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
      organizations: {
        Row: {
          available_languages: string[];
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          default_language: string;
          id: string;
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
          id?: string;
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
          id?: string;
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
      profiles: {
        Row: {
          address: string | null;
          anonymized_at: string | null;
          auth_method: string;
          avatar_url: string | null;
          city: string | null;
          clothing_size: string | null;
          created_at: string;
          date_of_birth: string | null;
          document_number: string | null;
          document_type: string | null;
          first_name: string;
          has_dependents: boolean;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          last_name: string;
          media_consent_at: string | null;
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          place_of_birth: string | null;
          postal_code: string | null;
          preferred_language: string;
          push_notifications_enabled: boolean;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
          search_document: unknown;
          shoe_size: string | null;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          anonymized_at?: string | null;
          auth_method?: string;
          avatar_url?: string | null;
          city?: string | null;
          clothing_size?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          first_name: string;
          has_dependents?: boolean;
          id: string;
          is_active?: boolean;
          is_forum_banned?: boolean;
          last_name: string;
          media_consent_at?: string | null;
          nationality?: string | null;
          num_dependents?: number;
          org_id: string;
          phone?: string | null;
          place_of_birth?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          push_notifications_enabled?: boolean;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
          search_document?: unknown;
          shoe_size?: string | null;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          anonymized_at?: string | null;
          auth_method?: string;
          avatar_url?: string | null;
          city?: string | null;
          clothing_size?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          first_name?: string;
          has_dependents?: boolean;
          id?: string;
          is_active?: boolean;
          is_forum_banned?: boolean;
          last_name?: string;
          media_consent_at?: string | null;
          nationality?: string | null;
          num_dependents?: number;
          org_id?: string;
          phone?: string | null;
          place_of_birth?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          push_notifications_enabled?: boolean;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
          search_document?: unknown;
          shoe_size?: string | null;
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
      terms_acceptances: {
        Row: {
          accepted_at: string;
          id: string;
          locale_shown: string;
          profile_id: string;
          terms_version: string;
        };
        Insert: {
          accepted_at?: string;
          id?: string;
          locale_shown: string;
          profile_id: string;
          terms_version: string;
        };
        Update: {
          accepted_at?: string;
          id?: string;
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
      ascii_local_part: { Args: { source: string }; Returns: string };
      assert_within_hourly_limit: {
        Args: { limited_action: string; maximum_per_hour: number };
        Returns: undefined;
      };
      authorize_push_dispatch: {
        Args: { dispatch_secret: string };
        Returns: boolean;
      };
      can_read_media_object: {
        Args: { p_object_key: string };
        Returns: boolean;
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
      complete_onboarding: {
        Args: { payload: Json };
        Returns: {
          address: string | null;
          anonymized_at: string | null;
          auth_method: string;
          avatar_url: string | null;
          city: string | null;
          clothing_size: string | null;
          created_at: string;
          date_of_birth: string | null;
          document_number: string | null;
          document_type: string | null;
          first_name: string;
          has_dependents: boolean;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
          last_name: string;
          media_consent_at: string | null;
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          place_of_birth: string | null;
          postal_code: string | null;
          preferred_language: string;
          push_notifications_enabled: boolean;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
          search_document: unknown;
          shoe_size: string | null;
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
      count_services_incompatible_with_category_schema: {
        Args: { p_category_id: string; p_metadata_schema: Json };
        Returns: number;
      };
      create_entity_referral: { Args: { p_payload: Json }; Returns: string };
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
      create_participant_account: {
        Args: { payload: Json };
        Returns: {
          email: string;
          password: string;
          profile_id: string;
        }[];
      };
      create_participant_invite: {
        Args: { payload: Json };
        Returns: {
          email: string;
          expires_at: string;
          invite_id: string;
        }[];
      };
      current_app_role: { Args: never; Returns: string };
      current_org_id: { Args: never; Returns: string };
      decrypt_field: { Args: { ciphertext: string }; Returns: string };
      default_organization_id: { Args: never; Returns: string };
      delete_forum_category: {
        Args: { p_category_id: string };
        Returns: undefined;
      };
      delete_own_forum_post: { Args: { p_post_id: string }; Returns: undefined };
      delete_participant_permanently: {
        Args: { participant_id: string };
        Returns: undefined;
      };
      edit_own_forum_post: {
        Args: { p_content: string; p_post_id: string };
        Returns: undefined;
      };
      encrypt_field: { Args: { plaintext: string }; Returns: string };
      encryption_key: { Args: never; Returns: string };
      flag_forum_content: {
        Args: {
          p_comment: string;
          p_reason: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: string;
      };
      get_entity_referral: {
        Args: { p_referral_id: string };
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
          avatar_url: string;
          city: string;
          clothing_size: string;
          date_of_birth: string;
          document_number: string;
          document_type: string;
          first_name: string;
          has_dependents: boolean;
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
          shoe_size: string;
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
      get_participant_profile: {
        Args: { participant_id: string };
        Returns: {
          address: string;
          anonymized_at: string;
          auth_method: string;
          avatar_url: string;
          city: string;
          clothing_size: string;
          created_at: string;
          date_of_birth: string;
          document_number: string;
          document_type: string;
          first_name: string;
          has_dependents: boolean;
          id: string;
          is_active: boolean;
          is_forum_banned: boolean;
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
          shoe_size: string;
          terms_accepted_at: string;
          updated_at: string;
        }[];
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
      immutable_unaccent: { Args: { value: string }; Returns: string };
      is_admin: { Args: never; Returns: boolean };
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
      is_staff_or_admin: { Args: never; Returns: boolean };
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
      moderate_forum_target: {
        Args: { p_action: string; p_target_id: string; p_target_type: string };
        Returns: undefined;
      };
      my_pending_invite: {
        Args: never;
        Returns: {
          invited_at: string;
          reference_entity: string;
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
      participant_filter_options: {
        Args: never;
        Returns: {
          entities: string[];
          nationalities: string[];
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
      purge_expired_entity_referrals: {
        Args: { p_now?: string };
        Returns: number;
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
      reorder_service_categories: {
        Args: { p_category_ids: string[] };
        Returns: undefined;
      };
      reset_participant_password: {
        Args: { participant_id: string };
        Returns: string;
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
      save_admin_service: { Args: { p_payload: Json }; Returns: string };
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
      set_conversation_assignment: {
        Args: { p_conversation_id: string; p_staff_id: string };
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
      set_media_item_privacy: {
        Args: { p_media_item_id: string; p_privacy_level: string };
        Returns: undefined;
      };
      set_participant_active: {
        Args: { next_is_active: boolean; participant_id: string };
        Returns: undefined;
      };
      set_service_interest: {
        Args: { p_interested: boolean; p_service_id: string };
        Returns: boolean;
      };
      unambiguous_token: { Args: { length: number }; Returns: string };
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
