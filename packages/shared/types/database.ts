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
          nationality: string | null;
          num_dependents: number;
          org_id: string;
          phone: string | null;
          postal_code: string | null;
          preferred_language: string;
          reference_contact_name: string | null;
          reference_entity: string | null;
          role: string;
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
          nationality?: string | null;
          num_dependents?: number;
          org_id: string;
          phone?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
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
          nationality?: string | null;
          num_dependents?: number;
          org_id?: string;
          phone?: string | null;
          postal_code?: string | null;
          preferred_language?: string;
          reference_contact_name?: string | null;
          reference_entity?: string | null;
          role?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_app_role: { Args: never; Returns: string };
      current_org_id: { Args: never; Returns: string };
      decrypt_field: { Args: { ciphertext: string }; Returns: string };
      encrypt_field: { Args: { plaintext: string }; Returns: string };
      encryption_key: { Args: never; Returns: string };
      is_staff_or_admin: { Args: never; Returns: boolean };
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
