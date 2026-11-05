import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Fires INITIAL_SESSION right away, then on every sign-in / sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  // The role is read from the database (profiles), never from the JWT/user
  // metadata, and the DB checks it again on every request anyway.
  const profile = useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  const error = profile.error?.message ?? (profile.data === null ? 'Профиль пользователя не найден. Обратитесь к администратору.' : null)

  return (
    <AuthContext.Provider
      value={{
        session,
        profile: userId ? (profile.data ?? null) : null,
        loading: !ready || (!!userId && profile.isPending),
        error,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
