import { useState } from 'react'
import { Anchor, Breadcrumbs, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useDeleteObject, useObject, useObjectTasks } from '../lib/api'
import { notifyError, notifySuccess } from '../lib/ui'
import { useViewMode } from '../lib/viewMode'
import { EmptyText, ErrorAlert, NotFound, PageLoader } from '../components/common'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { TaskBoard } from '../components/TaskBoard'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskTable'
import { ViewToggle } from '../components/ViewToggle'

export function ObjectPage() {
  const { objectId = '' } = useParams()
  const me = useMe()
  const isManager = me.role === 'manager'
  const navigate = useNavigate()
  const object = useObject(objectId)
  const tasks = useObjectTasks(objectId)
  const [view, setView] = useViewMode()
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
        <Group gap="sm">
          <ViewToggle value={view} onChange={setView} />
          {isManager && <Button onClick={() => setCreatingTask(true)}>Новая задача</Button>}
        </Group>
      </Group>

      {tasks.isPending ? (
        <PageLoader />
      ) : tasks.isError ? (
        <ErrorAlert error={tasks.error} />
      ) : tasks.data.length === 0 ? (
        <EmptyText>Задач пока нет</EmptyText>
      ) : view === 'board' ? (
        <TaskBoard tasks={tasks.data} showAssignee={isManager} />
      ) : (
        <TaskTable tasks={tasks.data} showAssignee={isManager} />
      )}

      <ObjectFormModal opened={editing} onClose={() => setEditing(false)} object={o} />
      <TaskFormModal opened={creatingTask} onClose={() => setCreatingTask(false)} objectId={o.id} onSaved={(id) => navigate(`/tasks/${id}`)} />
    </Stack>
  )
}
