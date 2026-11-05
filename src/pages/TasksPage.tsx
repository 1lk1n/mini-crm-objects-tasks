import { useState } from 'react'
import { Anchor, Paper, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useProfiles, useTasks } from '../lib/api'
import type { TaskStatus } from '../lib/database.types'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { EmptyText, ErrorAlert, PageLoader, StatusBadge } from '../components/common'
import { formatDate } from '../lib/ui'

type Filter = TaskStatus | 'active' | 'all'
const ACTIVE: TaskStatus[] = ['new', 'in_progress', 'review', 'rework']

/**
 * Executor: "Мои задачи" (RLS returns only their own tasks).
 * Manager:  "Все задачи", opened on "На проверке" — what needs their attention.
 */
export function TasksPage() {
  const me = useMe()
  const isManager = me.role === 'manager'
  const tasks = useTasks()
  const profiles = useProfiles()
  const [filter, setFilter] = useState<Filter>(isManager ? 'review' : 'active')

  if (tasks.isPending) return <PageLoader />
  if (tasks.isError) return <ErrorAlert error={tasks.error} />

  const all = tasks.data
  const count = (f: Filter) =>
    f === 'all' ? all.length : f === 'active' ? all.filter((t) => ACTIVE.includes(t.status)).length : all.filter((t) => t.status === f).length
  const visible = all
    .filter((t) => (filter === 'all' ? true : filter === 'active' ? ACTIVE.includes(t.status) : t.status === filter))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  const options: Filter[] = ['active', ...STATUS_ORDER, 'all']
  const label = (f: Filter) => (f === 'all' ? 'Все' : f === 'active' ? 'Активные' : STATUS_LABEL[f])

  return (
    <Stack>
      <Title order={2}>{isManager ? 'Все задачи' : 'Мои задачи'}</Title>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        data={options.map((f) => ({ value: f, label: `${label(f)} (${count(f)})` }))}
        style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
      />

      {visible.length === 0 ? (
        <EmptyText>Задач нет</EmptyText>
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Задача</Table.Th>
                  <Table.Th>Объект</Table.Th>
                  {isManager && <Table.Th>Исполнитель</Table.Th>}
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Создана</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/tasks/${t.id}`} fw={500}>
                        {t.title}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      {t.object ? (
                        <Anchor component={Link} to={`/objects/${t.object.id}`} c="dimmed">
                          {t.object.name}
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    {isManager && <Table.Td>{profiles.data?.byId.get(t.assignee_id)?.full_name ?? '—'}</Table.Td>}
                    <Table.Td>
                      <StatusBadge status={t.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(t.created_at)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  )
}
