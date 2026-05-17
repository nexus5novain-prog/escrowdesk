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
      disputes: {
        Row: {
          created_at: string
          id: string
          opened_by: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          trade_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opened_by: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          trade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opened_by?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          asset: Database["public"]["Enums"]["asset_type"]
          available_crypto: number
          created_at: string
          fiat_currency: string
          id: string
          maker_id: string
          max_amount: number
          min_amount: number
          payment_method_types: string[]
          price: number
          side: Database["public"]["Enums"]["offer_side"]
          status: Database["public"]["Enums"]["offer_status"]
          terms: string | null
          updated_at: string
        }
        Insert: {
          asset: Database["public"]["Enums"]["asset_type"]
          available_crypto: number
          created_at?: string
          fiat_currency: string
          id?: string
          maker_id: string
          max_amount: number
          min_amount: number
          payment_method_types?: string[]
          price: number
          side: Database["public"]["Enums"]["offer_side"]
          status?: Database["public"]["Enums"]["offer_status"]
          terms?: string | null
          updated_at?: string
        }
        Update: {
          asset?: Database["public"]["Enums"]["asset_type"]
          available_crypto?: number
          created_at?: string
          fiat_currency?: string
          id?: string
          maker_id?: string
          max_amount?: number
          min_amount?: number
          payment_method_types?: string[]
          price?: number
          side?: Database["public"]["Enums"]["offer_side"]
          status?: Database["public"]["Enums"]["offer_status"]
          terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          details: string
          id: string
          is_active: boolean
          label: string
          method_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details: string
          id?: string
          is_active?: boolean
          label: string
          method_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          is_active?: boolean
          label?: string
          method_type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          is_banned: boolean
          rating_count: number
          rating_sum: number
          telegram_user_id: number | null
          telegram_username: string | null
          trades_completed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_banned?: boolean
          rating_count?: number
          rating_sum?: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          trades_completed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_banned?: boolean
          rating_count?: number
          rating_sum?: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          trades_completed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trade_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_system: boolean
          sender_id: string
          trade_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_system?: boolean
          sender_id: string
          trade_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_system?: boolean
          sender_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_messages_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          asset: Database["public"]["Enums"]["asset_type"]
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          crypto_amount: number
          fee_amount: number
          fiat_amount: number
          fiat_currency: string
          id: string
          offer_id: string
          paid_at: string | null
          payment_method_id: string | null
          payment_window_minutes: number
          price: number
          released_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["trade_status"]
          updated_at: string
        }
        Insert: {
          asset: Database["public"]["Enums"]["asset_type"]
          buyer_id: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount: number
          fee_amount?: number
          fiat_amount: number
          fiat_currency: string
          id?: string
          offer_id: string
          paid_at?: string | null
          payment_method_id?: string | null
          payment_window_minutes?: number
          price: number
          released_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Update: {
          asset?: Database["public"]["Enums"]["asset_type"]
          buyer_id?: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount?: number
          fee_amount?: number
          fiat_amount?: number
          fiat_currency?: string
          id?: string
          offer_id?: string
          paid_at?: string | null
          payment_method_id?: string | null
          payment_window_minutes?: number
          price?: number
          released_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          asset: Database["public"]["Enums"]["asset_type"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["tx_kind"]
          note: string | null
          trade_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["tx_kind"]
          note?: string | null
          trade_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["tx_kind"]
          note?: string | null
          trade_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          asset: Database["public"]["Enums"]["asset_type"]
          available: number
          created_at: string
          escrow: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: Database["public"]["Enums"]["asset_type"]
          available?: number
          created_at?: string
          escrow?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: Database["public"]["Enums"]["asset_type"]
          available?: number
          created_at?: string
          escrow?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      asset_type: "USDT" | "BTC"
      dispute_status: "open" | "resolved_buyer" | "resolved_seller"
      offer_side: "buy" | "sell"
      offer_status: "active" | "paused" | "closed"
      trade_status:
        | "pending_payment"
        | "paid"
        | "released"
        | "cancelled"
        | "disputed"
      tx_kind:
        | "deposit"
        | "withdraw"
        | "escrow_lock"
        | "escrow_release"
        | "escrow_refund"
        | "fee"
        | "adjustment"
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
      app_role: ["admin", "moderator", "user"],
      asset_type: ["USDT", "BTC"],
      dispute_status: ["open", "resolved_buyer", "resolved_seller"],
      offer_side: ["buy", "sell"],
      offer_status: ["active", "paused", "closed"],
      trade_status: [
        "pending_payment",
        "paid",
        "released",
        "cancelled",
        "disputed",
      ],
      tx_kind: [
        "deposit",
        "withdraw",
        "escrow_lock",
        "escrow_release",
        "escrow_refund",
        "fee",
        "adjustment",
      ],
    },
  },
} as const
