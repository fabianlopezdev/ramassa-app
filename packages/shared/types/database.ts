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
      profiles: {
        Row: {
          address: string | null;
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
            foreignKeyName: 'profiles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
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
      [_ in never]: never;
    };
    Functions: {
      complete_onboarding: {
        Args: { payload: Json };
        Returns: {
          address: string | null;
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
      current_app_role: { Args: never; Returns: string };
      current_org_id: { Args: never; Returns: string };
      decrypt_field: { Args: { ciphertext: string }; Returns: string };
      default_organization_id: { Args: never; Returns: string };
      encrypt_field: { Args: { plaintext: string }; Returns: string };
      encryption_key: { Args: never; Returns: string };
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
      immutable_unaccent: { Args: { value: string }; Returns: string };
      is_staff_or_admin: { Args: never; Returns: boolean };
      update_own_profile: { Args: { payload: Json }; Returns: undefined };
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
