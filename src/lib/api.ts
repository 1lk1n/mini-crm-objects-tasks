// Data access. Every query goes straight to Supabase with the user's session;
// what comes back is already filtered by the RLS policies in the database.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Database, Profile, TaskStatus } from './database.types'

type Tables = Database['public']['Tables']

function unwrap<T>(res: PostgrestSingleResponse<T>): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// ---------- reference data ----------

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const rows = unwrap(await supabase.from('profiles').select('*').order('full_name'))
      return {
        list: rows,
        byId: new Map<string, Profile>(rows.map((p) => [p.id, p])),
        executors: rows.filter((p) => p.role === 'executor'),
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useTransitions() {
  return useQuery({
    queryKey: ['transitions'],
    queryFn: async () => unwrap(await supabase.from('task_status_transitions').select('*')),
    staleTime: Infinity,
  })
}

// ---------- objects ----------

export function useObjects() {
  return useQuery({
    queryKey: ['objects'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('objects')
          // embedded tasks are filtered by RLS too: an executor gets only their own
          .select('*, tasks(status)')
          .order('created_at', { ascending: false }),
      ),
  })
}

export function useObject(id: string) {
  return useQuery({
    queryKey: ['objects', id],
    queryFn: async () => unwrap(await supabase.from('objects').select('*').eq('id', id).maybeSingle()),
  })
}

// ---------- tasks ----------

export function useObjectTasks(objectId: string) {
  return useQuery({
    queryKey: ['tasks', { objectId }],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tasks')
          .select('*')
          .eq('object_id', objectId)
          .order('created_at', { ascending: false }),
      ),
  })
}

/** All tasks visible to the user: everything for a manager, own tasks for an executor (RLS). */
export function useTasks() {
  return useQuery({
    queryKey: ['tasks', 'list'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tasks')
          .select('*, object:objects(id, name)')
          .order('created_at', { ascending: false }),
      ),
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tasks')
          .select('*, object:objects(id, name, address)')
          .eq('id', id)
          .maybeSingle(),
      ),
  })
}

export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: ['history', taskId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('task_status_history')
          .select('*')
          .eq('task_id', taskId)
          .order('changed_at', { ascending: true })
          .order('id', { ascending: true }),
      ),
  })
}

// ---------- mutations ----------
// Data sets are small, so after any change we simply refetch everything.

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ predicate: (q) => !['me', 'profiles', 'transitions'].includes(q.queryKey[0] as string) })
}

export function useSaveObject() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Tables['objects']['Insert'] }) => {
      if (id) {
        unwrap(await supabase.from('objects').update(values).eq('id', id).select('id').single())
        return id
      }
      return unwrap(await supabase.from('objects').insert(values).select('id').single()).id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteObject() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('delete_object', { p_object_id: id })),
    onSuccess: invalidate,
  })
}

export function useSaveTask() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Tables['tasks']['Insert'] }) => {
      if (id) {
        unwrap(await supabase.from('tasks').update(values).eq('id', id).select('id').single())
        return id
      }
      return unwrap(await supabase.from('tasks').insert(values).select('id').single()).id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('delete_task', { p_task_id: id })),
    onSuccess: invalidate,
  })
}

export function useChangeStatus() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (args: { taskId: string; status: TaskStatus; comment?: string }) =>
      unwrap(
        await supabase.rpc('change_task_status', {
          p_task_id: args.taskId,
          p_new_status: args.status,
          p_comment: args.comment ?? null,
        }),
      ),
    onSuccess: invalidate,
  })
}
