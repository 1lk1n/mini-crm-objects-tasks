import { useState } from 'react'
import { Group, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useMe } from '../auth/context'
import { useTasks } from '../lib/api'
import type { TaskStatus } from '../lib/database.types'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { useViewMode } from '../lib/viewMode'
import { EmptyText, ErrorAlert, PageLoader } from '../components/common'
import { TaskBoard } from '../components/TaskBoard'
import { TaskTable } from '../components/TaskTable'
import { ViewToggle } from '../components/ViewToggle'

type Filter = TaskStatus | 'active' | 'all'
const ACTIVE: TaskStatus[] = ['new', 'in_progress', 'review', 'rework']

/**
 * Executor: "Мои задачи" (RLS returns only their own tasks).
 * Manager:  "Все задачи". In list view it opens on "На проверке",
 * i.e. what is waiting for the manager's decision.
 */
export function TasksPage() {
  const me = useMe()
  const isManager = me.role === 'manager'
  const tasks = useTasks()
  const [view, setView] = useViewMode()
  const [filter, setFilter] = useState<Filter>(isManager ? 'review' : 'active')

  const header = (
    <Group justify="space-between">
      <Title order={2}>{isManager ? 'Все задачи' : 'Мои задачи'}</Title>
      <ViewToggle value={view} onChange={setView} />
    </Group>
  )

  if (tasks.isPending) return <Stack>{header}<PageLoader /></Stack>
  if (tasks.isError) return <Stack>{header}<ErrorAlert error={tasks.error} /></Stack>

  const all = tasks.data
  if (all.length === 0)
    return (
      <Stack>
        {header}
        <EmptyText>{isManager ? 'Задач пока нет. Создайте задачу в карточке объекта.' : 'Вам пока не назначено ни одной задачи.'}</EmptyText>
      </Stack>
    )

  if (view === 'board')
    return (
      <Stack>
        {header}
        <Text size="sm" c="dimmed">
          Перетащите карточку в другую колонку или нажмите кнопку на карточке. Подсвечиваются только переходы, доступные вам.
        </Text>
        <TaskBoard tasks={all} showObject showAssignee={isManager} />
      </Stack>
    )

  const count = (f: Filter) =>
    f === 'all' ? all.length : f === 'active' ? all.filter((t) => ACTIVE.includes(t.status)).length : all.filter((t) => t.status === f).length
  const visible = all
    .filter((t) => (filter === 'all' ? true : filter === 'active' ? ACTIVE.includes(t.status) : t.status === filter))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
  const options: Filter[] = ['active', ...STATUS_ORDER, 'all']
  const label = (f: Filter) => (f === 'all' ? 'Все' : f === 'active' ? 'Активные' : STATUS_LABEL[f])

  return (
    <Stack>
      {header}
      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        data={options.map((f) => ({ value: f, label: `${label(f)} (${count(f)})` }))}
        style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
      />
      {visible.length === 0 ? <EmptyText>Задач нет</EmptyText> : <TaskTable tasks={visible} showObject showAssignee={isManager} />}
    </Stack>
  )
}
