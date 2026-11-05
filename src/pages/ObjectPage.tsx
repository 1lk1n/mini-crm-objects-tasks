import { useState } from 'react'
import { Anchor, Breadcrumbs, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useDeleteObject, useObject, useObjectTasks, useProfiles } from '../lib/api'
import { EmptyText, ErrorAlert, NotFound, PageLoader, StatusBadge } from '../components/common'
import { formatDate, notifyError, notifySuccess } from '../lib/ui'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { TaskFormModal } from '../components/TaskFormModal'

export function ObjectPage() {
  const { objectId = '' } = useParams()
  const me = useMe()
  const isManager = me.role === 'manager'
  const navigate = useNavigate()
  const object = useObject(objectId)
  const tasks = useObjectTasks(objectId)
  const profiles = useProfiles()
  const deleteObject = useDeleteObject()
  const [editing, setEditing] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)

  if (object.isPending) return <PageLoader />
  if (object.isError) return <ErrorAlert error={object.error} />
  if (!object.data) return <NotFound what="Объект" />
  const o = object.data

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Удалить объект?',
      children: (
        <Text size="sm">
          Объект «{o.name}» и все его задачи будут удалены из списка. История статусов сохраняется в базе.
        </Text>
      ),
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteObject.mutate(o.id, {
          onSuccess: () => {
            notifySuccess('Объект удалён')
            navigate('/objects')
          },
          onError: notifyError,
        }),
    })

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/objects">
          Объекты
        </Anchor>
        <Text>{o.name}</Text>
      </Breadcrumbs>

      <Paper withBorder p="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>{o.name}</Title>
            <Text c="dimmed">{o.address}</Text>
          </div>
          {isManager && (
            <Group gap="xs">
              <Button variant="default" onClick={() => setEditing(true)}>
                Редактировать
              </Button>
              <Button variant="light" color="red" onClick={confirmDelete} loading={deleteObject.isPending}>
                Удалить
              </Button>
            </Group>
          )}
        </Group>
      </Paper>

      <Group justify="space-between">
        <Title order={3}>{isManager ? 'Задачи' : 'Мои задачи на объекте'}</Title>
        {isManager && <Button onClick={() => setCreatingTask(true)}>Новая задача</Button>}
      </Group>

      {tasks.isPending ? (
        <PageLoader />
      ) : tasks.isError ? (
        <ErrorAlert error={tasks.error} />
      ) : tasks.data.length === 0 ? (
        <EmptyText>Задач пока нет</EmptyText>
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={600}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Задача</Table.Th>
                  <Table.Th>Исполнитель</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Создана</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tasks.data.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/tasks/${t.id}`} fw={500}>
                        {t.title}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{profiles.data?.byId.get(t.assignee_id)?.full_name ?? '—'}</Table.Td>
                    <Table.Td>
                      <StatusBadge status={t.status} />
                    </Table.Td>
                    <Table.Td>{formatDate(t.created_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <ObjectFormModal opened={editing} onClose={() => setEditing(false)} object={o} />
      <TaskFormModal opened={creatingTask} onClose={() => setCreatingTask(false)} objectId={o.id} onSaved={(id) => navigate(`/tasks/${id}`)} />
    </Stack>
  )
}
