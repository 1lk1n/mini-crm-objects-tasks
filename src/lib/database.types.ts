// Types for the Supabase schema in supabase/migrations.
// Same shape as `supabase gen types typescript` output, but Insert/Update list
// only the columns the API actually allows clients to write (see the GRANTs
// in the migration), so the compiler mirrors the database rules.

export type UserRole = 'manager' | 'executor'
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: UserRole
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      objects: {
        Row: {
          id: string
          name: string
          address: string
          created_by: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          name: string
          address: string
        }
        Update: {
          name?: string
          address?: string
        }
        Relationships: [
          {
            foreignKeyName: 'objects_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          object_id: string
          title: string
          description: string
          assignee_id: string
          status: TaskStatus
          author_id: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          object_id: string
          title: string
          description?: string
          assignee_id: string
        }
        Update: {
          object_id?: string
          title?: string
          description?: string
          assignee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_object_id_fkey'
            columns: ['object_id']
            isOneToOne: false
            referencedRelation: 'objects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      task_status_transitions: {
        Row: {
          from_status: TaskStatus
          to_status: TaskStatus
          actor: UserRole
          comment_required: boolean
        }
        Insert: never
        Update: never
        Relationships: []
      }
      task_status_history: {
        Row: {
          id: number
          task_id: string
          from_status: TaskStatus | null
          to_status: TaskStatus
          changed_by: string
          changed_at: string
          comment: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'task_status_history_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      change_task_status: {
        Args: { p_task_id: string; p_new_status: TaskStatus; p_comment?: string | null }
        Returns: undefined
      }
      delete_task: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      delete_object: {
        Args: { p_object_id: string }
        Returns: undefined
      }
    }
    Enums: {
      user_role: UserRole
      task_status: TaskStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Profile = PublicTables['profiles']['Row']
export type CrmObject = PublicTables['objects']['Row']
export type Task = PublicTables['tasks']['Row']
export type StatusTransition = PublicTables['task_status_transitions']['Row']
export type StatusHistoryEntry = PublicTables['task_status_history']['Row']
