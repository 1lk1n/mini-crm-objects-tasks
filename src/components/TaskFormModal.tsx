import { useState } from 'react'
import { Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core'
import { useObjects, useProfiles, useSaveTask } from '../lib/api'
import type { Task } from '../lib/database.types'
import { notifyError, notifySuccess } from '../lib/ui'

type Props = {
  opened: boolean
  onClose: () => void
  objectId: string // object the new task belongs to
  task?: Task // edit mode when set
  onSaved?: (id: string) => void
}

export function TaskFormModal({ opened, onClose, objectId, task, onSaved }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'} size="lg">
      {opened && <TaskForm key={task?.id ?? 'new'} objectId={objectId} task={task} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

function TaskForm({ objectId, task, onClose, onSaved }: Omit<Props, 'opened'>) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignee_id ?? null)
  const [targetObjectId, setTargetObjectId] = useState<string | null>(task?.object_id ?? objectId)
  const profiles = useProfiles()
  const objects = useObjects()
  const save = useSaveTask()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigneeId || !targetObjectId) return
    save.mutate(
      {
        id: task?.id,
        values: {
          title: title.trim(),
          description: description.trim(),
          assignee_id: assigneeId,
          object_id: targetObjectId,
        },
      },
      {
        onSuccess: (id) => {
          notifySuccess(task ? 'Задача сохранена' : 'Задача создана')
          onClose()
          onSaved?.(id)
        },
        onError: notifyError,
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Название" required maxLength={200} value={title} onChange={(e) => setTitle(e.currentTarget.value)} data-autofocus />
        <Textarea
          label="Описание"
          autosize
          minRows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Select
          label="Исполнитель"
          required
          searchable
          placeholder="Выберите исполнителя"
          data={(profiles.data?.executors ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
          value={assigneeId}
          onChange={setAssigneeId}
          nothingFoundMessage="Нет исполнителей"
        />
        {task && (
          <Select
            label="Объект"
            required
            searchable
            data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
            value={targetObjectId}
            onChange={setTargetObjectId}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!title.trim() || !assigneeId || !targetObjectId}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
