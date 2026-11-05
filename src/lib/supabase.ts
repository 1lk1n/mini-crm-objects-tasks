import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
// Public ("anon" / "publishable") key. It is safe to ship to the browser:
// it only identifies the project, and all access is enforced by RLS in the DB.
// The secret service_role key is never used by the frontend.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example)')
}

export const supabase = createClient<Database>(url, anonKey)
