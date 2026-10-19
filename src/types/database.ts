/**
-- Database TypeScript Definitions for Klyvo Supabase Schema
-- Auto-generated types matching:
-- 1. supabase/migrations/20261016000000_secure_multi_tenant_foundation.sql
-- 2. supabase/migrations/20261016000001_orders_and_customers.sql
*/

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrderStatus = "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled";
export type PaymentStatus = "Unpaid" | "Paid" | "Refunded";
export type PaymentMethod = "Cash on Delivery" | "InstaPay" | "Vodafone Cash" | "Credit / Debit Card";

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          currency: string;
          description: string | null;
          logo_url: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          address: string | null;
          city: string | null;
          governorate: string | null;
          primary_color: string;
          secondary_color: string;
          language: string;
          timezone: string;
          shipping_enabled: boolean;
          shipping_fee: number;
          free_shipping_threshold: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          currency?: string;
          description?: string | null;
          logo_url?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address?: string | null;
          city?: string | null;
          governorate?: string | null;
          primary_color?: string;
          secondary_color?: string;
          language?: string;
          timezone?: string;
          shipping_enabled?: boolean;
          shipping_fee?: number;
          free_shipping_threshold?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          slug?: string;
          currency?: string;
          description?: string | null;
          logo_url?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address?: string | null;
          city?: string | null;
          governorate?: string | null;
          primary_color?: string;
          secondary_color?: string;
          language?: string;
          timezone?: string;
          shipping_enabled?: boolean;
          shipping_fee?: number;
          free_shipping_threshold?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          name_ar: string | null;
          name_en: string | null;
          sku: string;
          description: string | null;
          category: string;
          price: number;
          compare_at_price: number | null;
          stock: number;
          image_url: string | null;
          status: "Active" | "Draft" | "Archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          name_ar?: string | null;
          name_en?: string | null;
          sku: string;
          description?: string | null;
          category?: string;
          price: number;
          compare_at_price?: number | null;
          stock?: number;
          image_url?: string | null;
          status?: "Active" | "Draft" | "Archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          name_ar?: string | null;
          name_en?: string | null;
          sku?: string;
          description?: string | null;
          category?: string;
          price?: number;
          compare_at_price?: number | null;
          stock?: number;
          image_url?: string | null;
          status?: "Active" | "Draft" | "Archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          }
        ];
      };
      customers: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          email: string | null;
          phone: string;
          address: string;
          city: string;
          governorate: string;
          total_orders: number;
          total_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          email?: string | null;
          phone: string;
          address?: string;
          city?: string;
          governorate?: string;
          total_orders?: number;
          total_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          email?: string | null;
          phone?: string;
          address?: string;
          city?: string;
          governorate?: string;
          total_orders?: number;
          total_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          customer_id: string | null;
          order_number: string;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string;
          shipping_address: string;
          shipping_city: string;
          shipping_governorate: string;
          status: OrderStatus;
          payment_status: PaymentStatus;
          payment_method: PaymentMethod;
          currency: string;
          subtotal: number;
          discount_amount: number | null;
          coupon_code: string | null;
          shipping_fee: number;
          total: number;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          customer_id?: string | null;
          order_number: string;
          customer_name: string;
          customer_email?: string | null;
          customer_phone: string;
          shipping_address: string;
          shipping_city?: string;
          shipping_governorate?: string;
          status?: OrderStatus;
          payment_status?: PaymentStatus;
          payment_method?: PaymentMethod;
          currency?: string;
          subtotal: number;
          discount_amount?: number | null;
          coupon_code?: string | null;
          shipping_fee?: number;
          total: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          customer_id?: string | null;
          order_number?: string;
          customer_name?: string;
          customer_email?: string | null;
          customer_phone?: string;
          shipping_address?: string;
          shipping_city?: string;
          shipping_governorate?: string;
          status?: OrderStatus;
          payment_status?: PaymentStatus;
          payment_method?: PaymentMethod;
          currency?: string;
          subtotal?: number;
          discount_amount?: number | null;
          coupon_code?: string | null;
          shipping_fee?: number;
          total?: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      store_payment_methods: {
        Row: {
          id: string;
          store_id: string;
          method: PaymentMethod;
          enabled: boolean;
          instructions: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          method: PaymentMethod;
          enabled?: boolean;
          instructions?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          method?: PaymentMethod;
          enabled?: boolean;
          instructions?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_payment_methods_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          variant_label: string | null;
          product_name: string;
          sku: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          variant_label?: string | null;
          product_name: string;
          sku?: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          variant_label?: string | null;
          product_name?: string;
          sku?: string | null;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      coupons: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          discount_type: "percentage" | "fixed_amount";
          discount_value: number;
          min_order_subtotal: number | null;
          max_discount_amount: number | null;
          starts_at: string;
          expires_at: string | null;
          usage_limit: number | null;
          per_customer_limit: number | null;
          is_active: boolean;
          usage_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          discount_type: "percentage" | "fixed_amount";
          discount_value: number;
          min_order_subtotal?: number | null;
          max_discount_amount?: number | null;
          starts_at?: string;
          expires_at?: string | null;
          usage_limit?: number | null;
          per_customer_limit?: number | null;
          is_active?: boolean;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          code?: string;
          discount_type?: "percentage" | "fixed_amount";
          discount_value?: number;
          min_order_subtotal?: number | null;
          max_discount_amount?: number | null;
          starts_at?: string;
          expires_at?: string | null;
          usage_limit?: number | null;
          per_customer_limit?: number | null;
          is_active?: boolean;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          }
        ];
      };
      carts: {
        Row: {
          id: string;
          store_id: string;
          token_hash: string;
          status: string;
          items: Json | null;
          item_count: number;
          estimated_value: number;
          first_seen_at: string;
          last_activity_at: string;
          abandoned_at: string | null;
          restored_at: string | null;
          converted_order_id: string | null;
          converted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          token_hash: string;
          status?: string;
          items?: Json | null;
          item_count?: number;
          estimated_value?: number;
          first_seen_at?: string;
          last_activity_at?: string;
          abandoned_at?: string | null;
          restored_at?: string | null;
          converted_order_id?: string | null;
          converted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          token_hash?: string;
          status?: string;
          items?: Json | null;
          item_count?: number;
          estimated_value?: number;
          first_seen_at?: string;
          last_activity_at?: string;
          abandoned_at?: string | null;
          restored_at?: string | null;
          converted_order_id?: string | null;
          converted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          }
        ];
      };
      abandoned_cart_settings: {
        Row: {
          store_id: string;
          tracking_enabled: boolean;
          inactivity_hours: number;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          tracking_enabled?: boolean;
          inactivity_hours?: number;
          updated_at?: string;
        };
        Update: {
          store_id?: string;
          tracking_enabled?: boolean;
          inactivity_hours?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      coupon_usage: {
        Row: {
          id: string;
          coupon_id: string;
          store_id: string;
          order_id: string;
          customer_id: string | null;
          customer_phone_hash: string;
          discount_amount: number;
          order_subtotal: number;
          order_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          store_id: string;
          order_id: string;
          customer_id?: string | null;
          customer_phone_hash: string;
          discount_amount: number;
          order_subtotal: number;
          order_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          coupon_id?: string;
          store_id?: string;
          order_id?: string;
          customer_id?: string | null;
          customer_phone_hash?: string;
          discount_amount?: number;
          order_subtotal?: number;
          order_total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_usage_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_usage_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      loyalty_settings: {
        Row: {
          store_id: string;
          enabled: boolean;
          points_per_unit: number;
          min_order_amount: number;
          redemption_enabled: boolean;
          points_to_currency: number;
          redemption_cap_percent: number;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          enabled?: boolean;
          points_per_unit?: number;
          min_order_amount?: number;
          redemption_enabled?: boolean;
          points_to_currency?: number;
          redemption_cap_percent?: number;
          updated_at?: string;
        };
        Update: {
          store_id?: string;
          enabled?: boolean;
          points_per_unit?: number;
          min_order_amount?: number;
          redemption_enabled?: boolean;
          points_to_currency?: number;
          redemption_cap_percent?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_loyalty: {
        Row: {
          store_id: string;
          customer_id: string;
          balance: number;
          lifetime_earned: number;
          lifetime_redeemed: number;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          customer_id: string;
          balance?: number;
          lifetime_earned?: number;
          lifetime_redeemed?: number;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          lifetime_earned?: number;
          lifetime_redeemed?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      loyalty_ledger: {
        Row: {
          id: string;
          store_id: string;
          customer_id: string;
          order_id: string | null;
          delta: number;
          reason: string;
          notes: string | null;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          customer_id: string;
          order_id?: string | null;
          delta: number;
          reason: string;
          notes?: string | null;
          idempotency_key: string;
          created_at?: string;
        };
        Update: {
          delta?: number;
          reason?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      product_options: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          name: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          name: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          position?: number;
        };
        Relationships: [];
      };
      product_option_values: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          option_id: string;
          value: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          option_id: string;
          value: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          value?: string;
          position?: number;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          sku: string;
          price: number | null;
          stock: number;
          is_active: boolean;
          option_value_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          sku: string;
          price?: number | null;
          stock?: number;
          is_active?: boolean;
          option_value_ids: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sku?: string;
          price?: number | null;
          stock?: number;
          is_active?: boolean;
          option_value_ids?: string[];
        };
        Relationships: [];
      };
      shipping_zones: {
        Row: {
          id: string;
          store_id: string;
          governorate: string;
          area: string;
          fee: number;
          free_shipping_threshold: number | null;
          is_active: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          governorate: string;
          area?: string;
          fee?: number;
          free_shipping_threshold?: number | null;
          is_active?: boolean;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          governorate?: string;
          area?: string;
          fee?: number;
          free_shipping_threshold?: number | null;
          is_active?: boolean;
          position?: number;
        };
        Relationships: [];
      };
      store_appearance: {
        Row: {
          store_id: string;
          draft: Json;
          published: Json | null;
          published_at: string | null;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          draft?: Json;
          published?: Json | null;
          published_at?: string | null;
          updated_at?: string;
        };
        Update: {
          draft?: Json;
          published?: Json | null;
          published_at?: string | null;
        };
        Relationships: [];
      };
      product_reviews: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          customer_id: string | null;
          order_id: string | null;
          rating: number;
          title: string;
          body: string;
          reviewer_name: string;
          author_key: string;
          author_store_key: string;
          is_verified_purchase: boolean;
          status: "pending" | "published" | "rejected";
          moderation_note: string | null;
          created_at: string;
          updated_at: string;
          published_at: string | null;
        };
        Insert: {
          store_id: string;
          product_id: string;
          customer_id?: string | null;
          order_id?: string | null;
          rating: number;
          title?: string;
          body: string;
          reviewer_name: string;
          author_key: string;
          author_store_key: string;
          is_verified_purchase?: boolean;
          status?: "pending" | "published" | "rejected";
          moderation_note?: string | null;
        };
        Update: {
          status?: "pending" | "published" | "rejected";
          moderation_note?: string | null;
          published_at?: string | null;
        };
        Relationships: [];
      };
      marketing_campaigns: {
        Row: {
          id: string;
          store_id: string;
          coupon_id: string;
          name: string;
          token: string;
          status: "draft" | "active" | "paused";
          starts_at: string;
          ends_at: string | null;
          product_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          coupon_id: string;
          name: string;
          token: string;
          status?: "draft" | "active" | "paused";
          starts_at?: string;
          ends_at?: string | null;
          product_ids?: string[];
        };
        Update: {
          coupon_id?: string;
          name?: string;
          status?: "draft" | "active" | "paused";
          starts_at?: string;
          ends_at?: string | null;
          product_ids?: string[];
        };
        Relationships: [];
      };
      campaign_visits: {
        Row: {
          id: string;
          campaign_id: string;
          store_id: string;
          visitor_key: string;
          created_at: string;
        };
        Insert: {
          campaign_id: string;
          store_id: string;
          visitor_key: string;
          created_at?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      campaign_orders: {
        Row: {
          id: string;
          campaign_id: string;
          store_id: string;
          order_id: string;
          revenue: number;
          discount_amount: number;
          created_at: string;
        };
        Insert: {
          campaign_id: string;
          store_id: string;
          order_id: string;
          revenue?: number;
          discount_amount?: number;
          created_at?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      handle_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      sync_public_cart: {
        Args: { p_slug: string; p_token: string; p_items: Json };
        Returns: Json;
      };
      restore_public_cart: {
        Args: { p_slug: string; p_token: string };
        Returns: Json;
      };
      complete_public_cart: {
        Args: { p_token: string; p_order_id: string };
        Returns: boolean;
      };
      get_store_abandoned_carts: {
        Args: { p_status?: string | null; p_page?: number; p_page_size?: number };
        Returns: Json;
      };
      get_store_sales_analytics: {
        Args: { p_from_date: string; p_to_date: string };
        Returns: Json;
      };
      get_store_loyalty_overview: {
        Args: { p_page?: number; p_page_size?: number };
        Returns: Json;
      };
      get_customer_loyalty_ledger: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number };
        Returns: Json;
      };
      adjust_customer_loyalty_points: {
        Args: { p_customer_id: string; p_delta: number; p_notes?: string | null };
        Returns: Json;
      };
      award_order_loyalty_points: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      reverse_order_loyalty_points: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      get_public_store: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_public_store_products: {
        Args: {
          p_slug: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string | null;
          p_category?: string | null;
          p_product_id?: string | null;
        };
        Returns: Json;
      };
      validate_public_coupon: {
        Args: {
          p_slug: string;
          p_code: string;
          p_subtotal: number;
          p_phone_norm?: string | null;
        };
        Returns: Json;
      };
      create_public_store_order: {
        Args: {
          p_store_slug: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_customer_email: string | null;
          p_shipping_address: string;
          p_shipping_city: string | null;
          p_shipping_governorate: string | null;
          p_payment_method: string;
          p_notes: string | null;
          p_items: Json;
          p_coupon_code?: string | null;
          p_shipping_zone_id?: string | null;
        };
        Returns: Json;
      };
      submit_public_product_review: {
        Args: {
          p_slug: string;
          p_product_id: string;
          p_rating: number;
          p_title: string;
          p_body: string;
          p_reviewer_name: string;
          p_phone: string;
        };
        Returns: Json;
      };
      get_public_product_reviews: {
        Args: {
          p_slug: string;
          p_product_id: string;
          p_page?: number;
          p_page_size?: number;
        };
        Returns: Json;
      };
      record_campaign_visit: {
        Args: { p_slug: string; p_token: string; p_visitor_token: string };
        Returns: Json;
      };
      record_campaign_order: {
        Args: { p_token: string; p_order_id: string };
        Returns: Json;
      };
      create_store_order: {
        Args: {
          p_store_id: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_customer_email?: string | null;
          p_shipping_address: string;
          p_shipping_city?: string | null;
          p_shipping_governorate?: string | null;
          p_payment_method: string;
          p_shipping_fee: number;
          p_notes?: string | null;
          p_items: Json;
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
}

export type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
export type StoreInsert = Database["public"]["Tables"]["stores"]["Insert"];
export type StoreUpdate = Database["public"]["Tables"]["stores"]["Update"];

export type StorePaymentMethodRow =
  Database["public"]["Tables"]["store_payment_methods"]["Row"];
export type StorePaymentMethodInsert =
  Database["public"]["Tables"]["store_payment_methods"]["Insert"];
export type StorePaymentMethodUpdate =
  Database["public"]["Tables"]["store_payment_methods"]["Update"];

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
export type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];
export type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];

export type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];
export type CouponInsert = Database["public"]["Tables"]["coupons"]["Insert"];
export type CouponUpdate = Database["public"]["Tables"]["coupons"]["Update"];

export type CouponUsageRow = Database["public"]["Tables"]["coupon_usage"]["Row"];
export type CouponUsageInsert = Database["public"]["Tables"]["coupon_usage"]["Insert"];
export type CouponUsageUpdate = Database["public"]["Tables"]["coupon_usage"]["Update"];

export type CartRow = Database["public"]["Tables"]["carts"]["Row"];
export type CartInsert = Database["public"]["Tables"]["carts"]["Insert"];
export type CartUpdate = Database["public"]["Tables"]["carts"]["Update"];

export type AbandonedCartSettingsRow =
  Database["public"]["Tables"]["abandoned_cart_settings"]["Row"];
export type AbandonedCartSettingsInsert =
  Database["public"]["Tables"]["abandoned_cart_settings"]["Insert"];
export type AbandonedCartSettingsUpdate =
  Database["public"]["Tables"]["abandoned_cart_settings"]["Update"];

export type LoyaltySettingsRow = Database["public"]["Tables"]["loyalty_settings"]["Row"];
export type LoyaltySettingsInsert = Database["public"]["Tables"]["loyalty_settings"]["Insert"];
export type LoyaltySettingsUpdate = Database["public"]["Tables"]["loyalty_settings"]["Update"];

export type CustomerLoyaltyRow = Database["public"]["Tables"]["customer_loyalty"]["Row"];
export type CustomerLoyaltyInsert = Database["public"]["Tables"]["customer_loyalty"]["Insert"];
export type CustomerLoyaltyUpdate = Database["public"]["Tables"]["customer_loyalty"]["Update"];

export type LoyaltyLedgerRow = Database["public"]["Tables"]["loyalty_ledger"]["Row"];
export type LoyaltyLedgerInsert = Database["public"]["Tables"]["loyalty_ledger"]["Insert"];
export type LoyaltyLedgerUpdate = Database["public"]["Tables"]["loyalty_ledger"]["Update"];

export type ProductOptionRow =
  Database["public"]["Tables"]["product_options"]["Row"];
export type ProductOptionValueRow =
  Database["public"]["Tables"]["product_option_values"]["Row"];
export type ProductVariantRow =
  Database["public"]["Tables"]["product_variants"]["Row"];
export type ShippingZoneRow =
  Database["public"]["Tables"]["shipping_zones"]["Row"];
export type StoreAppearanceRow =
  Database["public"]["Tables"]["store_appearance"]["Row"];
export type ProductReviewRow =
  Database["public"]["Tables"]["product_reviews"]["Row"];
export type MarketingCampaignRow =
  Database["public"]["Tables"]["marketing_campaigns"]["Row"];
export type CampaignVisitRow =
  Database["public"]["Tables"]["campaign_visits"]["Row"];
export type CampaignOrderRow =
  Database["public"]["Tables"]["campaign_orders"]["Row"];
