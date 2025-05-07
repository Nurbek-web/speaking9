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
      users: {
        Row: {
          id: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      tests: {
        Row: {
          id: string
          name: string
          book_number: number
          test_number: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          book_number: number
          test_number: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          book_number?: number
          test_number?: number
          created_at?: string
        }
        Relationships: []
      }
      responses: {
        Row: {
          id: string
          user_id: string
          test_id: string
          part_number: number
          audio_url: string
          transcript: string
          band_score: number | null
          feedback: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          test_id: string
          part_number: number
          audio_url: string
          transcript?: string
          band_score?: number | null
          feedback?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          test_id?: string
          part_number?: number
          audio_url?: string
          transcript?: string
          band_score?: number | null
          feedback?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 