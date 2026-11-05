import { useState } from 'react'
import { Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { useMe } from '../auth/context'
import { useChangeStatus, useTransitions } from '../lib/api'
import type { StatusTransition, Task } from '../lib/database.types'
import { actionLabel, availableTransitions, STATUS_LABEL } from '../lib/status'
import { notifyError, notifySuccess } from '../lib/ui'

/**
 * Buttons for the status transitions the current user can perform right now,
 * plus a comment that is saved to the history with the transition.
 * The comment is optional, except where the transition requires it (rework).
 * Note: hiding buttons is only UX; the database enforces the same rules.
 */
export function TaskActions({ task, assigneeName }: { task: Task; assigneeName: string }) {
  const me = useMe()
  const transitions = useTransitions()
  const change = useChangeStatus()
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)

  if (transitions.isPending) return null
  const actions = availableTransitions(task, me, transitions.data ?? [])
  if (actions.length === 0) return <WaitingHint task={task} assigneeName={assigneeName} />

  const run = (t: StatusTransition) => {
    const text = comment.trim()
    if (t.comment_required && !text) {
      setCommentError(`Чтобы «${actionLabel(t).toLowerCase()}», напишите комментарий: что нужно исправить`)
      return
    }
    change.mutate(
      { taskId: task.id, status: t.to_status, comment: text || undefined },
      {
        onSuccess: () => {
          notifySuccess(`Статус изменён: ${STATUS_LABEL[t.to_status]}`)
          setComment('')
          setCommentError(null)
        },
        onError: notifyError,
      },
    )
  }

  const commentRequired = actions.some((t) => t.comment_required)

  return (
    <Stack gap="sm">
      <Textarea
        label="Комментарий"
        description={commentRequired ? 'Обязателен при возврате на доработку' : 'Необязательно, сохранится в истории'}
        placeholder={commentRequired ? 'Что нужно исправить' : undefined}
        autosize
        minRows={2}
        maxLength={2000}
        value={comment}
        error={commentError}
        onChange={(e) => {
          setComment(e.currentTarget.value)
          setCommentError(null)
        }}
      />
      <Group gap="sm">
        {actions.map((t) => (
          <Button
            key={t.to_status}
            color={t.to_status === 'rework' ? 'red' : t.to_status === 'accepted' ? 'green' : undefined}
            variant={t.to_status === 'rework' ? 'light' : 'filled'}
            loading={change.isPending && change.variables?.status === t.to_status}
            disabled={change.isPending}
            onClick={() => run(t)}
          >
            {actionLabel(t)}
          </Button>
        ))}
      </Group>
    </Stack>
  )
}

/** Shown when the current user has nothing to do with the task right now. */
function WaitingHint({ task, assigneeName }: { task: Task; assigneeName: string }) {
  const text =
    task.status === 'accepted'
      ? 'Задача принята. Это конечный статус.'
      : task.status === 'review'
        ? 'Задача на проверке у постановщика.'
        : `Ожидает действий исполнителя: ${assigneeName}.`
  return (
    <Text size="sm" c="dimmed">
      {text}
    </Text>
  )
}
