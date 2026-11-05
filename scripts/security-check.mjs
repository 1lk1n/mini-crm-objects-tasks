// Attacks the deployed Supabase API directly (bypassing the UI) and checks
// that every forbidden action is rejected by the database.
//
//   node --env-file=.env.seed.local scripts/security-check.mjs
//
// Needs only the PUBLIC key and the demo users' password:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SEED_PASSWORD
// Non-destructive: every write it attempts is supposed to fail.
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { USERS } from './demo-users.mjs'

const { SUPABASE_URL, SUPABASE_ANON_KEY, SEED_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SEED_PASSWORD) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SEED_PASSWORD')
  process.exit(1)
}

// Node < 22 has no global WebSocket; supabase-js needs one for its realtime client.
const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: globalThis.WebSocket ?? ws } }
const client = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts)

let passed = 0
let failed = 0
function report(ok, name, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const section = (title) => console.log(`\n${title}`)

/** The request must come back with an error. */
async function expectError(name, req) {
  const { error } = await req
  report(!!error, name, error ? error.message : 'NOT REJECTED')
}
/** Read/write must either error or touch zero rows (RLS hides the row). */
async function expectNothing(name, req) {
  const { data, error } = await req
  const ok = !!error || (Array.isArray(data) && data.length === 0) || data === null
  report(ok, name, error ? error.message : ok ? '0 rows' : `GOT ${JSON.stringify(data).slice(0, 80)}`)
}

async function login(email) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { c, id: data.user.id }
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`)

  section('Без входа (anon)')
  const anon = client()
  await expectNothing('нельзя читать задачи', anon.from('tasks').select('*'))
  await expectNothing('нельзя читать объекты', anon.from('objects').select('*'))
  await expectNothing('нельзя читать историю', anon.from('task_status_history').select('*'))
  await expectError('нельзя вызвать смену статуса', anon.rpc('change_task_status', { p_task_id: crypto.randomUUID(), p_new_status: 'accepted' }))
  await expectError('открытая регистрация отключена', anon.auth.signUp({ email: `probe-${Date.now()}@example.com`, password: 'Probe-12345-x' }))

  const m = await login(USERS.manager.email)
  const iv = await login(USERS.ivanov.email)
  const sd = await login(USERS.sidorov.email)

  // Ground truth, as the manager sees it.
  const { data: all, error } = await m.c.from('tasks').select('id, title, status, assignee_id, object_id')
  if (error) throw new Error(error.message)
  const ivTasks = all.filter((t) => t.assignee_id === iv.id)
  const sdTask = all.find((t) => t.assignee_id === sd.id)
  const ivTask = ivTasks.find((t) => t.status === 'in_progress') ?? ivTasks[0]
  const newTask = all.find((t) => t.status === 'new')
  const reviewTask = all.find((t) => t.status === 'review')
  if (!ivTask || !sdTask) throw new Error('Run scripts/seed.mjs first')

  section('Исполнитель: чтение чужого')
  {
    const { data } = await iv.c.from('tasks').select('id, assignee_id')
    report(data.length === ivTasks.length && data.every((t) => t.assignee_id === iv.id), `видит только свои задачи (${data.length} из ${all.length})`)
    await expectNothing('не может прочитать чужую задачу по id', iv.c.from('tasks').select('*').eq('id', sdTask.id))
    await expectNothing('не видит историю чужой задачи', iv.c.from('task_status_history').select('*').eq('task_id', sdTask.id))
    const { data: objs } = await iv.c.from('objects').select('id')
    const expected = new Set(ivTasks.map((t) => t.object_id))
    report(objs.length === expected.size && objs.every((o) => expected.has(o.id)), `видит только объекты со своими задачами (${objs.length})`)
    const { data: profs } = await iv.c.from('profiles').select('id')
    report(!profs.some((p) => p.id === sd.id), 'не видит профиль другого исполнителя')
  }

  section('Исполнитель: изменение данных в обход интерфейса')
  await expectNothing('не может изменить чужую задачу', iv.c.from('tasks').update({ title: 'hacked' }).eq('id', sdTask.id).select())
  await expectNothing('не может переназначить чужую задачу на себя', iv.c.from('tasks').update({ assignee_id: iv.id }).eq('id', sdTask.id).select())
  await expectNothing('не может редактировать даже свою задачу', iv.c.from('tasks').update({ title: 'hacked' }).eq('id', ivTask.id).select())
  await expectError('не может записать статус напрямую', iv.c.from('tasks').update({ status: 'accepted' }).eq('id', ivTask.id).select())
  await expectError('не может сменить статус чужой задачи', iv.c.rpc('change_task_status', { p_task_id: sdTask.id, p_new_status: 'in_progress' }))
  await expectError('не может принять свою задачу (запрещённый переход)', iv.c.rpc('change_task_status', { p_task_id: ivTask.id, p_new_status: 'accepted' }))
  await expectError('не может создать объект', iv.c.from('objects').insert({ name: 'x', address: 'y' }).select())
  await expectError('не может создать задачу', iv.c.from('tasks').insert({ object_id: ivTask.object_id, title: 'x', assignee_id: iv.id }).select())
  await expectError('не может удалить задачу', iv.c.rpc('delete_task', { p_task_id: ivTask.id }))
  await expectError('не может удалить задачу напрямую', iv.c.from('tasks').delete().eq('id', ivTask.id).select())
  await expectError('не может удалить объект', iv.c.rpc('delete_object', { p_object_id: ivTask.object_id }))
  await expectError('не может повысить себе роль в профиле', iv.c.from('profiles').update({ role: 'manager' }).eq('id', iv.id).select())
  {
    // Classic hole: role taken from user_metadata, which users can edit themselves.
    await iv.c.auth.updateUser({ data: { role: 'manager' } })
    await iv.c.auth.refreshSession()
    await expectError('role в user_metadata не даёт прав постановщика', iv.c.from('objects').insert({ name: 'x', address: 'y' }).select())
    await iv.c.auth.updateUser({ data: { role: null } })
  }

  section('История статусов неизменяема')
  await expectError('нельзя добавить запись', iv.c.from('task_status_history').insert({ task_id: ivTask.id, to_status: 'accepted', changed_by: m.id }).select())
  await expectError('нельзя изменить запись (исполнитель)', iv.c.from('task_status_history').update({ comment: 'x' }).eq('task_id', ivTask.id).select())
  await expectError('нельзя удалить запись (исполнитель)', iv.c.from('task_status_history').delete().eq('task_id', ivTask.id).select())
  await expectError('нельзя изменить запись (постановщик)', m.c.from('task_status_history').update({ comment: 'x' }).eq('task_id', ivTask.id).select())
  await expectError('нельзя удалить запись (постановщик)', m.c.from('task_status_history').delete().eq('task_id', ivTask.id).select())

  section('Постановщик: переходы проверяются базой')
  await expectError('не может записать статус напрямую', m.c.from('tasks').update({ status: 'accepted' }).eq('id', ivTask.id).select())
  if (newTask) await expectError('не может «взять в работу» за исполнителя', m.c.rpc('change_task_status', { p_task_id: newTask.id, p_new_status: 'in_progress' }))
  if (reviewTask) await expectError('не может вернуть на доработку без комментария', m.c.rpc('change_task_status', { p_task_id: reviewTask.id, p_new_status: 'rework', p_comment: '  ' }))
  await expectError('не может создать задачу сразу «Принятой»', m.c.from('tasks').insert({ object_id: ivTask.object_id, title: 'x', assignee_id: iv.id, status: 'accepted' }).select())
  await expectError('не может назначить исполнителем постановщика', m.c.from('tasks').insert({ object_id: ivTask.object_id, title: 'x', assignee_id: m.id }).select())

  section('Проверка, что ничего не изменилось')
  {
    const { data: after } = await m.c.from('tasks').select('id, title, status, assignee_id')
    const before = new Map(all.map((t) => [t.id, t]))
    const unchanged = after.length === all.length && after.every((t) => {
      const b = before.get(t.id)
      return b && b.title === t.title && b.status === t.status && b.assignee_id === t.assignee_id
    })
    report(unchanged, 'данные задач не изменились')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
