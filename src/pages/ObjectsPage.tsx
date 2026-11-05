import { useState } from 'react'
import { Anchor, Badge, Button, Group, Paper, Table, Text, Title } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useObjects } from '../lib/api'
import type { TaskStatus } from '../lib/database.types'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { EmptyText, ErrorAlert, PageLoader } from '../components/common'
import { ObjectFormModal } from '../components/ObjectFormModal'

function StatusCounts({ tasks }: { tasks: { status: TaskStatus }[] }) {
  if (tasks.length === 0) return <Text size="sm" c="dimmed">нет задач</Text>
  const counts = new Map<TaskStatus, number>()
  tasks.forEach((t) => counts.set(t.status, (counts.get(t.status) ?? 0) + 1))
  return (
    <Group gap={6}>
      {STATUS_ORDER.filter((s) => counts.has(s)).map((s) => (
        <Badge key={s} color={STATUS_COLOR[s]} variant="light" size="sm">
          {STATUS_LABEL[s]}: {counts.get(s)}
        </Badge>
      ))}
    </Group>
  )
}

export function ObjectsPage() {
  const me = useMe()
  const objects = useObjects()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const isManager = me.role === 'manager'

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={() => setCreating(true)}>Добавить объект</Button>}
      </Group>
      {!isManager && (
        <Text c="dimmed" size="sm" mb="sm">
          Показаны объекты, в которых у вас есть задачи.
        </Text>
      )}

      {objects.isPending ? (
        <PageLoader />
      ) : objects.isError ? (
        <ErrorAlert error={objects.error} />
      ) : objects.data.length === 0 ? (
        <EmptyText>{isManager ? 'Объектов пока нет. Добавьте первый.' : 'Вам пока не назначено ни одной задачи.'}</EmptyText>
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={600}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Название</Table.Th>
                  <Table.Th>Адрес</Table.Th>
                  <Table.Th>{isManager ? 'Задачи' : 'Мои задачи'}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {objects.data.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/objects/${o.id}`} fw={500}>
                        {o.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{o.address}</Table.Td>
                    <Table.Td>
                      <StatusCounts tasks={o.tasks} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <ObjectFormModal opened={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/objects/${id}`)} />
    </>
  )
}
