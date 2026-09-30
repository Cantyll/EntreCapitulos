export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          author: string;
          cover_path: string | null;
          created_at: string;
          current_chapter: number;
          finished_at: string | null;
          genres: string[];
          id: string;
          palette: Json | null;
          rating: number | null;
          slug: string;
          started_at: string | null;
          status: string;
          synopsis: string | null;
          theme_auto: boolean;
          theme_tokens: Json | null;
          title: string;
          total_chapters: number;
          updated_at: string;
        };
        Insert: {
          author: string;
          cover_path?: string | null;
          created_at?: string;
          current_chapter?: number;
          finished_at?: string | null;
          genres?: string[];
          id?: string;
          palette?: Json | null;
          rating?: number | null;
          slug: string;
          started_at?: string | null;
          status?: string;
          synopsis?: string | null;
          theme_auto?: boolean;
          theme_tokens?: Json | null;
          title: string;
          total_chapters: number;
          updated_at?: string;
        };
        Update: {
          author?: string;
          cover_path?: string | null;
          created_at?: string;
          current_chapter?: number;
          finished_at?: string | null;
          genres?: string[];
          id?: string;
          palette?: Json | null;
          rating?: number | null;
          slug?: string;
          started_at?: string | null;
          status?: string;
          synopsis?: string | null;
          theme_auto?: boolean;
          theme_tokens?: Json | null;
          title?: string;
          total_chapters?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          flag_reason: string | null;
          id: string;
          parent_id: string | null;
          read_up_to: number | null;
          session_id: string;
          spoiler_up_to: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          flag_reason?: string | null;
          id?: string;
          parent_id?: string | null;
          read_up_to?: number | null;
          session_id: string;
          spoiler_up_to?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          flag_reason?: string | null;
          id?: string;
          parent_id?: string | null;
          read_up_to?: number | null;
          session_id?: string;
          spoiler_up_to?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'reading_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          approved_comment_count: number;
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          approved_comment_count?: number;
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          approved_comment_count?: number;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_progress: {
        Row: {
          book_id: string;
          chapter: number;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          book_id: string;
          chapter?: number;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          book_id?: string;
          chapter?: number;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_progress_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reading_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reading_sessions: {
        Row: {
          body: NonNullable<Json>;
          book_id: string;
          chapter_from: number;
          chapter_to: number;
          comments_open: boolean;
          created_at: string;
          excerpt: string | null;
          id: string;
          number: number;
          published_at: string | null;
          rating: number | null;
          read_minutes: number | null;
          status: string;
          title: string;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          body?: NonNullable<Json>;
          book_id: string;
          chapter_from: number;
          chapter_to: number;
          comments_open?: boolean;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          number: number;
          published_at?: string | null;
          rating?: number | null;
          read_minutes?: number | null;
          status?: string;
          title: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          body?: NonNullable<Json>;
          book_id?: string;
          chapter_from?: number;
          chapter_to?: number;
          comments_open?: boolean;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          number?: number;
          published_at?: string | null;
          rating?: number | null;
          read_minutes?: number | null;
          status?: string;
          title?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_sessions_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
        ];
      };
      session_notes: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          position: number;
          reference: string | null;
          session_id: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          position?: number;
          reference?: string | null;
          session_id: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          position?: number;
          reference?: string | null;
          session_id?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_notes_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'reading_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      session_questions: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          session_id: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position?: number;
          session_id: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          session_id?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_questions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'reading_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      derive_avatar_url: { Args: { meta: Json }; Returns: string };
      derive_display_name: { Args: { email: string; meta: Json }; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
