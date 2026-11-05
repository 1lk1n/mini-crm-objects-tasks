import { useState } from 'react'
import { Anchor, Breadcrumbs, Button, Divider, Grid, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useDeleteTask, useProfiles, useTask } from '../lib/api'
import { ErrorAlert, NotFound, PageLoader, StatusBadge } from '../components/common'
import { formatDate, notifyError, notifySuccess } from '../lib/ui'
import { TaskActions } from '../components/TaskActions'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskHistory } from '../components/TaskHistory'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{children}</Text>
    </div>
  )
}

export function TaskPage() {
  const { taskId = '' } = useParams()
  const me = useMe()
  const isManager = me.role === 'manager'
  const navigate = useNavigate()
  const task = useTask(taskId)
  const profiles = useProfiles()
  const deleteTask = useDeleteTask()
  const [editing, setEditing] = useState(false)

  if (task.isPending) return <PageLoader />
  if (task.isError) return <ErrorAlert error={task.error} />
  if (!task.data) return <NotFound what="Задача" />
  const t = task.data
  const name = (id: string) => profiles.data?.byId.get(id)?.full_name ?? '—'

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Удалить задачу?',
      children: <Text size="sm">Задача «{t.title}» будет удалена из списков. История статусов сохраняется в базе.</Text>,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteTask.mutate(t.id, {
          onSuccess: () => {
            notifySuccess('Задача удалена')
            navigate(t.object ? `/objects/${t.object.id}` : '/objects')
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
        {t.object && (
          <Anchor component={Link} to={`/objects/${t.object.id}`}>
            {t.object.name}
          </Anchor>
        )}
        <Text>{t.title}</Text>
      </Breadcrumbs>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="md">
            <Stack>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Title order={2} style={{ wordBreak: 'break-word' }}>
                  {t.title}
                </Title>
                <StatusBadge status={t.status} />
              </Group>

              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <Field label="Объект">
                  {t.object ? (
                    <Anchor component={Link} to={`/objects/${t.object.id}`}>
                      {t.object.name}
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Исполнитель">{name(t.assignee_id)}</Field>
                <Field label="Автор">{name(t.author_id)}</Field>
                <Field label="Создана">{formatDate(t.created_at)}</Field>
              </SimpleGrid>

              <Field label="Описание">
                <Text style={{ whiteSpace: 'pre-wrap' }} c={t.description ? undefined : 'dimmed'}>
                  {t.description || 'Без описания'}
                </Text>
              </Field>

              <Divider />
              <TaskActions task={t} assigneeName={name(t.assignee_id)} />

              {isManager && (
                <Group gap="xs">
                  <Button variant="default" size="xs" onClick={() => setEditing(true)}>
                    Редактировать
                  </Button>
                  <Button variant="subtle" color="red" size="xs" onClick={confirmDelete} loading={deleteTask.isPending}>
                    Удалить
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder p="md">
            <Title order={4} mb="md">
              История статусов
            </Title>
            <TaskHistory taskId={t.id} />
          </Paper>
        </Grid.Col>
      </Grid>

      <TaskFormModal opened={editing} onClose={() => setEditing(false)} objectId={t.object_id} task={t} />
    </Stack>
  )
}
