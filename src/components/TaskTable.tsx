import { Anchor, Paper, Table, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useProfiles } from '../lib/api'
import type { TaskRow } from '../lib/database.types'
import { formatDate } from '../lib/ui'
import { StatusBadge } from './common'

type Props = { tasks: TaskRow[]; showObject?: boolean; showAssignee?: boolean }

export function TaskTable({ tasks, showObject = false, showAssignee = false }: Props) {
  const profiles = useProfiles()
  return (
    <Paper withBorder>
      <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Задача</Table.Th>
              {showObject && <Table.Th>Объект</Table.Th>}
              {showAssignee && <Table.Th>Исполнитель</Table.Th>}
              <Table.Th>Статус</Table.Th>
              <Table.Th>Создана</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/tasks/${t.id}`} fw={500}>
                    {t.title}
                  </Anchor>
                </Table.Td>
                {showObject && (
                  <Table.Td>
                    {t.object ? (
                      <Anchor component={Link} to={`/objects/${t.object.id}`} c="dimmed">
                        {t.object.name}
                      </Anchor>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                )}
                {showAssignee && <Table.Td>{profiles.data?.byId.get(t.assignee_id)?.full_name ?? '—'}</Table.Td>}
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
  )
}
