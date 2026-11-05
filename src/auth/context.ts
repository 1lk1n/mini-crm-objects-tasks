import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../lib/database.types'

export type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Profile of the logged-in user. Only use under <RequireAuth>. */
export function useMe(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useMe() called without a logged-in user')
  return profile
}
