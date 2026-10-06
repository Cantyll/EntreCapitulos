export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_deletions: {
        Row: {
          deleted_at: string;
          user_id: string;
        };
        Insert: {
          deleted_at?: string;
          user_id: string;
        };
        Update: {
          deleted_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
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
      comment_flags: {
        Row: {
          comment_id: string;
          created_at: string;
          reason: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          reason: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comment_flags_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: true;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
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
      member_audit: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          details: NonNullable<Json>;
          id: string;
          target_id: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          target_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          target_id?: string;
        };
        Relationships: [];
      };
      member_suspensions: {
        Row: {
          suspended_at: string;
          user_id: string;
        };
        Insert: {
          suspended_at?: string;
          user_id: string;
        };
        Update: {
          suspended_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'member_suspensions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
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
          display_name_confirmed_at: string | null;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          approved_comment_count?: number;
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          display_name_confirmed_at?: string | null;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          approved_comment_count?: number;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          display_name_confirmed_at?: string | null;
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
      site_page_drafts: {
        Row: {
          content: NonNullable<Json>;
          slug: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content: NonNullable<Json>;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: NonNullable<Json>;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'site_page_drafts_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      site_page_revisions: {
        Row: {
          content: NonNullable<Json>;
          id: number;
          kind: string;
          published_at: string;
          published_by: string | null;
          slug: string;
        };
        Insert: {
          content: NonNullable<Json>;
          id?: never;
          kind: string;
          published_at?: string;
          published_by?: string | null;
          slug: string;
        };
        Update: {
          content?: NonNullable<Json>;
          id?: never;
          kind?: string;
          published_at?: string;
          published_by?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'site_page_revisions_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      site_pages: {
        Row: {
          content: NonNullable<Json>;
          published_at: string;
          slug: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content: NonNullable<Json>;
          published_at?: string;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: NonNullable<Json>;
          published_at?: string;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'site_pages_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      terms_acceptances: {
        Row: {
          accepted_at: string;
          first_accepted_at: string;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          first_accepted_at?: string;
          user_id: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          first_accepted_at?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'terms_acceptances_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
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
      accept_terms: { Args: { p_version: string }; Returns: undefined };
      admin_delete_member: { Args: { p_user_id: string }; Returns: undefined };
      admin_find_member_by_email: { Args: { p_email: string }; Returns: string };
      admin_masked_emails: {
        Args: { p_user_ids: string[] };
        Returns: {
          masked_email: string;
          user_id: string;
        }[];
      };
      admin_member_contact: {
        Args: { p_user_id: string };
        Returns: {
          email: string;
          last_sign_in_at: string;
          providers: string[];
        }[];
      };
      admin_member_export: { Args: { p_user_id: string }; Returns: Json };
      delete_account_cascade: { Args: { p_user_id: string }; Returns: undefined };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      derive_avatar_url: { Args: { meta: Json }; Returns: string };
      derive_display_name: { Args: { meta: Json }; Returns: string };
      finish_book: {
        Args: { p_book_id: string; p_rating: number };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'books';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      mask_email: { Args: { p_email: string }; Returns: string };
      publish_session: {
        Args: { p_session_id: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'reading_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      publish_site_page: {
        Args: { p_expected_updated_at: string; p_slug: string };
        Returns: string;
      };
      purge_account_deletions: { Args: Record<PropertyKey, never>; Returns: number };
      restore_site_page_revision: {
        Args: { p_expected_updated_at?: string; p_revision_id: number; p_slug: string };
        Returns: string;
      };
      retract_comment: { Args: { p_comment_id: string }; Returns: string };
      save_site_page_draft: {
        Args: { p_content: Json; p_expected_updated_at?: string; p_slug: string };
        Returns: string;
      };
      set_member_role: {
        Args: { p_expected_role?: string; p_role: string; p_user_id: string };
        Returns: string;
      };
      set_member_suspension: {
        Args: { p_suspended: boolean; p_user_id: string };
        Returns: boolean;
      };
      site_page_content_problem: { Args: { p_content: Json; p_slug: string }; Returns: string };
      start_book: {
        Args: { p_book_id: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'books';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      unpublish_session: {
        Args: { p_session_id: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'reading_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
