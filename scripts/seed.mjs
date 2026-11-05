// Creates demo users and demo data.
//
//   node --env-file=.env.seed.local scripts/seed.mjs
//
// Needs (in .env.seed.local, which is git-ignored):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SEED_PASSWORD
//
// The service_role key is used ONLY here, locally, to create users (open
// registration is disabled). All demo data is then created by logging in as
// those users with the public key, i.e. through the same RLS policies and
// status-transition function as the real app, so the history is genuine.
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { USERS } from './demo-users.mjs'

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SEED_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SEED_PASSWORD) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SEED_PASSWORD')
  process.exit(1)
}

// Node < 22 has no global WebSocket; supabase-js needs one for its realtime client.
const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: globalThis.WebSocket ?? ws } }
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts)

function check({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function ensureUser({ email, full_name, role }) {
  const attrs = {
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { role }, // only the service_role can set app_metadata
  }
  const created = await admin.auth.admin.createUser({ email, ...attrs })
  if (!created.error) return created.data.user.id

  // Already exists: find it, reset password/role.
  const list = check(await admin.auth.admin.listUsers({ perPage: 1000 }), 'listUsers')
  const user = list.users.find((u) => u.email === email)
  if (!user) throw new Error(`createUser ${email}: ${created.error.message}`)
  check(await admin.auth.admin.updateUserById(user.id, attrs), `update ${email}`)
  // upsert: also restores the profile if the database was reset after the user was created
  check(await admin.from('profiles').upsert({ id: user.id, full_name, role }), `profile ${email}`)
  return user.id
}

async function login(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts)
  check(await client.auth.signInWithPassword({ email, password: SEED_PASSWORD }), `login ${email}`)
  return client
}

async function main() {
  console.log('Users:')
  const ids = {}
  for (const [key, u] of Object.entries(USERS)) {
    ids[key] = await ensureUser(u)
    console.log(`  ${u.role.padEnd(8)} ${u.email}  (${u.full_name})`)
  }

  const m = await login(USERS.manager.email)
  const existing = check(await m.from('objects').select('id'), 'objects')
  if (existing.length > 0) {
    console.log('\nObjects already exist, skipping demo data.')
    return
  }

  const iv = await login(USERS.ivanov.email)
  const sd = await login(USERS.sidorov.email)
  const as = { manager: m, ivanov: iv, sidorov: sd }

  const objects = [
    { name: 'ЖК «Северный парк», корпус 2', address: 'г. Москва, ул. Лесная, 12' },
    { name: 'БЦ «Меридиан»', address: 'г. Москва, Ленинградский пр-т, 45' },
    { name: 'Частный дом, Истра', address: 'Московская обл., г. Истра, ул. Садовая, 7' },
  ]
  const objIds = []
  for (const o of objects) objIds.push(check(await m.from('objects').insert(o).select('id').single(), 'object').id)

  // [object index, assignee, title, description, steps: [actor, status, comment?]]
  const tasks = [
    [0, 'ivanov', 'Залить фундамент секции А', 'Бетон B25, армирование по проекту, лист КЖ-3.',
      [['ivanov', 'in_progress'], ['ivanov', 'review'], ['manager', 'accepted']]],
    [0, 'ivanov', 'Монтаж опалубки 3 этажа', 'Щитовая опалубка, проверить вертикальность стоек.',
      [['ivanov', 'in_progress'], ['ivanov', 'review']]],
    [0, 'sidorov', 'Кладка внутренних перегородок', 'Газобетон D500, кв. 10–18.',
      [['sidorov', 'in_progress'], ['sidorov', 'review'],
       ['manager', 'rework', 'Перегородка в кв. 14 отклоняется от вертикали на 2 см — переложить.']]],
    [1, 'sidorov', 'Замена электропроводки на 2 этаже', 'Кабель ВВГнг-LS 3×2.5, новые автоматы в щите.',
      [['sidorov', 'in_progress']]],
    [1, 'sidorov', 'Установка противопожарных дверей', 'EI 60, 6 шт., лестничная клетка.', []],
    [1, 'sidorov', 'Покраска фасада', 'Цвет RAL 7016, два слоя.',
      [['sidorov', 'in_progress'], ['sidorov', 'review'],
       ['manager', 'rework', 'Оттенок не совпадает с RAL 7016, нужен второй слой с южной стороны.'],
       ['sidorov', 'in_progress']]],
    [2, 'ivanov', 'Утепление кровли', 'Минвата 200 мм, пароизоляция.', [['ivanov', 'in_progress']]],
    [2, 'ivanov', 'Подключение септика', 'Септик на 4 человек, отвод от дома 8 м.', []],
  ]

  console.log('\nTasks:')
  for (const [oi, assignee, title, description, steps] of tasks) {
    const { id } = check(
      await m.from('tasks').insert({ object_id: objIds[oi], title, description, assignee_id: ids[assignee] }).select('id').single(),
      `task ${title}`,
    )
    for (const [actor, status, comment] of steps) {
      check(await as[actor].rpc('change_task_status', { p_task_id: id, p_new_status: status, p_comment: comment ?? null }), `${title} -> ${status}`)
    }
    console.log(`  ${(steps.at(-1)?.[1] ?? 'new').padEnd(12)} ${title}  →  ${USERS[assignee].full_name}`)
  }
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
