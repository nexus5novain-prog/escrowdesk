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
      escrow_group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["escrow_member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role: Database["public"]["Enums"]["escrow_member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["escrow_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "escrow_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_group_messages: {
        Row: {
          body: string
          created_at: string
          from_telegram: boolean
          group_id: string
          id: string
          is_system: boolean
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          from_telegram?: boolean
          group_id: string
          id?: string
          is_system?: boolean
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          from_telegram?: boolean
          group_id?: string
          id?: string
          is_system?: boolean
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escrow_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "escrow_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_groups: {
        Row: {
          amount: number
          asset: Database["public"]["Enums"]["asset_type"]
          counterparty_id: string | null
          created_at: string
          creator_id: string
          deposit_tx_hash: string | null
          escrow_address: string | null
          escrow_address_chain: string | null
          fiat_amount: number | null
          fiat_currency: string
          id: string
          invited_telegram: string | null
          invited_username: string | null
          listing_id: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["escrow_group_status"]
          telegram_chat_id: number | null
          telegram_link_token: string | null
          trade_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          asset: Database["public"]["Enums"]["asset_type"]
          counterparty_id?: string | null
          created_at?: string
          creator_id: string
          deposit_tx_hash?: string | null
          escrow_address?: string | null
          escrow_address_chain?: string | null
          fiat_amount?: number | null
          fiat_currency?: string
          id?: string
          invited_telegram?: string | null
          invited_username?: string | null
          listing_id?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_group_status"]
          telegram_chat_id?: number | null
          telegram_link_token?: string | null
          trade_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          asset?: Database["public"]["Enums"]["asset_type"]
          counterparty_id?: string | null
          created_at?: string
          creator_id?: string
          deposit_tx_hash?: string | null
          escrow_address?: string | null
          escrow_address_chain?: string | null
          fiat_amount?: number | null
          fiat_currency?: string
          id?: string
          invited_telegram?: string | null
          invited_username?: string | null
          listing_id?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_group_status"]
          telegram_chat_id?: number | null
          telegram_link_token?: string | null
          trade_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          amount: number | null
          category: string
          contact_telegram: string | null
          contact_website: string | null
          created_at: string
          currency: string | null
          description: string
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          name: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          category: string
          contact_telegram?: string | null
          contact_website?: string | null
          created_at?: string
          currency?: string | null
          description: string
          id?: string
          kind: Database["public"]["Enums"]["listing_kind"]
          name: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          category?: string
          contact_telegram?: string | null
          contact_website?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          name?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          bio: string | null
          btc_volume_usd: number
          created_at: string
          display_name: string
          distinct_partners: number
          five_star_count: number
          id: string
          is_banned: boolean
          is_premium: boolean
          is_trusted: boolean
          rating_count: number
          rating_sum: number
          telegram_user_id: number | null
          telegram_username: string | null
          trades_completed: number
          updated_at: string
          user_id: string
          wallet_address_btc: string | null
          wallet_address_eth: string | null
          wallet_address_usdc: string | null
          wallet_address_usdc_chain: string | null
          wallet_address_usdt: string | null
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          bio?: string | null
          btc_volume_usd?: number
          created_at?: string
          display_name: string
          distinct_partners?: number
          five_star_count?: number
          id?: string
          is_banned?: boolean
          is_premium?: boolean
          is_trusted?: boolean
          rating_count?: number
          rating_sum?: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          trades_completed?: number
          updated_at?: string
          user_id: string
          wallet_address_btc?: string | null
          wallet_address_eth?: string | null
          wallet_address_usdc?: string | null
          wallet_address_usdc_chain?: string | null
          wallet_address_usdt?: string | null
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          bio?: string | null
          btc_volume_usd?: number
          created_at?: string
          display_name?: string
          distinct_partners?: number
          five_star_count?: number
          id?: string
          is_banned?: boolean
          is_premium?: boolean
          is_trusted?: boolean
          rating_count?: number
          rating_sum?: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          trades_completed?: number
          updated_at?: string
          user_id?: string
          wallet_address_btc?: string | null
          wallet_address_eth?: string | null
          wallet_address_usdc?: string | null
          wallet_address_usdc_chain?: string | null
          wallet_address_usdt?: string | null
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
      trade_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          stars: number
          trade_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          stars: number
          trade_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          stars?: number
          trade_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          asset: Database["public"]["Enums"]["asset_type"]
          buyer_id: string
          buyer_payout_address: string | null
          cancelled_at: string | null
          created_at: string
          crypto_amount: number
          deposit_confirmed_at: string | null
          deposit_tx_hash: string | null
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
          seller_payout_address: string | null
          signature_buyer: string | null
          signature_seller: string | null
          signed_by_buyer_at: string | null
          signed_by_seller_at: string | null
          status: Database["public"]["Enums"]["trade_status"]
          terms_buyer: string | null
          terms_seller: string | null
          updated_at: string
        }
        Insert: {
          asset: Database["public"]["Enums"]["asset_type"]
          buyer_id: string
          buyer_payout_address?: string | null
          cancelled_at?: string | null
          created_at?: string
          crypto_amount: number
          deposit_confirmed_at?: string | null
          deposit_tx_hash?: string | null
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
          seller_payout_address?: string | null
          signature_buyer?: string | null
          signature_seller?: string | null
          signed_by_buyer_at?: string | null
          signed_by_seller_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
          terms_buyer?: string | null
          terms_seller?: string | null
          updated_at?: string
        }
        Update: {
          asset?: Database["public"]["Enums"]["asset_type"]
          buyer_id?: string
          buyer_payout_address?: string | null
          cancelled_at?: string | null
          created_at?: string
          crypto_amount?: number
          deposit_confirmed_at?: string | null
          deposit_tx_hash?: string | null
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
          seller_payout_address?: string | null
          signature_buyer?: string | null
          signature_seller?: string | null
          signed_by_buyer_at?: string | null
          signed_by_seller_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
          terms_buyer?: string | null
          terms_seller?: string | null
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
      user_warnings: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: string
          issued_by: string
          reason: string
          severity: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          issued_by: string
          reason: string
          severity?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          issued_by?: string
          reason?: string
          severity?: string
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
      assign_role: {
        Args: {
          _caller: string
          _role: Database["public"]["Enums"]["app_role"]
          _target: string
        }
        Returns: undefined
      }
      ban_user: {
        Args: { _caller: string; _reason: string; _target: string }
        Returns: undefined
      }
      cancel_trade: {
        Args: { _caller: string; _trade_id: string }
        Returns: undefined
      }
      compute_fee_bps: { Args: { _fiat_amount: number }; Returns: number }
      confirm_buyer_deposit: {
        Args: { _caller: string; _trade_id: string }
        Returns: undefined
      }
      credit_wallet: {
        Args: {
          _amount: number
          _asset: Database["public"]["Enums"]["asset_type"]
          _note: string
          _user: string
        }
        Returns: undefined
      }
      debit_wallet: {
        Args: {
          _amount: number
          _asset: Database["public"]["Enums"]["asset_type"]
          _note: string
          _user: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group: string; _user: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_trade_paid: {
        Args: { _caller: string; _trade_id: string }
        Returns: undefined
      }
      open_dispute: {
        Args: { _caller: string; _reason: string; _trade_id: string }
        Returns: string
      }
      recompute_user_badges: { Args: { _user: string }; Returns: undefined }
      release_trade: {
        Args: { _caller: string; _trade_id: string }
        Returns: undefined
      }
      resolve_dispute: {
        Args: {
          _award_to: string
          _caller: string
          _note: string
          _trade_id: string
        }
        Returns: undefined
      }
      revoke_role: {
        Args: {
          _caller: string
          _role: Database["public"]["Enums"]["app_role"]
          _target: string
        }
        Returns: undefined
      }
      sign_terms: {
        Args: {
          _caller: string
          _signature: string
          _terms: string
          _trade_id: string
        }
        Returns: undefined
      }
      start_trade: {
        Args: {
          _buyer: string
          _fiat_amount: number
          _offer_id: string
          _payment_method_id: string
        }
        Returns: string
      }
      unban_user: {
        Args: { _caller: string; _target: string }
        Returns: undefined
      }
      warn_user: {
        Args: {
          _caller: string
          _reason: string
          _severity: string
          _target: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "judge" | "finance" | "support"
      asset_type: "USDT" | "BTC" | "USDC" | "ETH"
      dispute_status: "open" | "resolved_buyer" | "resolved_seller"
      escrow_group_status:
        | "awaiting_counterparty"
        | "active"
        | "funded"
        | "released"
        | "cancelled"
        | "disputed"
      escrow_member_role: "buyer" | "seller" | "moderator"
      listing_kind: "selling" | "seeking"
      listing_status: "active" | "inactive" | "sold"
      offer_side: "buy" | "sell"
      offer_status: "active" | "paused" | "closed"
      trade_status:
        | "pending_payment"
        | "paid"
        | "released"
        | "cancelled"
        | "disputed"
        | "awaiting_agreement"
        | "awaiting_deposit"
        | "awaiting_seller_confirm"
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
      app_role: ["admin", "moderator", "user", "judge", "finance", "support"],
      asset_type: ["USDT", "BTC", "USDC", "ETH"],
      dispute_status: ["open", "resolved_buyer", "resolved_seller"],
      escrow_group_status: [
        "awaiting_counterparty",
        "active",
        "funded",
        "released",
        "cancelled",
        "disputed",
      ],
      escrow_member_role: ["buyer", "seller", "moderator"],
      listing_kind: ["selling", "seeking"],
      listing_status: ["active", "inactive", "sold"],
      offer_side: ["buy", "sell"],
      offer_status: ["active", "paused", "closed"],
      trade_status: [
        "pending_payment",
        "paid",
        "released",
        "cancelled",
        "disputed",
        "awaiting_agreement",
        "awaiting_deposit",
        "awaiting_seller_confirm",
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
