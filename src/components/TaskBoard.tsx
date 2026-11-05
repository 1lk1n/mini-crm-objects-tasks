import { useState, type ReactNode } from 'react'
import { Anchor, Badge, Box, Button, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/context'
import { useChangeStatus, useProfiles, useTransitions } from '../lib/api'
import type { StatusTransition, TaskRow, TaskStatus } from '../lib/database.types'
import { actionLabel, availableTransitions, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { formatDate, notifyError, notifySuccess } from '../lib/ui'

type Props = { tasks: TaskRow[]; showObject?: boolean; showAssignee?: boolean }

/**
 * Kanban board: one column per status.
 * A card can be dragged (or moved with its buttons) only along the transitions
 * the current user is allowed to perform. While dragging, allowed columns are
 * highlighted and the rest are dimmed. Every move calls the same database
 * function as the task card, so the database stays the one that enforces it.
 */
export function TaskBoard({ tasks, showObject = false, showAssignee = false }: Props) {
  const me = useMe()
  const transitions = useTransitions()
  const profiles = useProfiles()
  const change = useChangeStatus()
  // Status shown while a move is being saved, so the card jumps immediately.
  const [optimistic, setOptimistic] = useState<Record<string, TaskStatus>>({})
  const [dragged, setDragged] = useState<TaskRow | null>(null)
  const [needsComment, setNeedsComment] = useState<{ task: TaskRow; transition: StatusTransition } | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens a short press starts dragging, so the board still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const statusOf = (t: TaskRow) => optimistic[t.id] ?? t.status
  const actionsFor = (t: TaskRow) =>
    availableTransitions({ status: statusOf(t), assignee_id: t.assignee_id }, me, transitions.data ?? [])

  const move = async (task: TaskRow, t: StatusTransition, comment?: string) => {
    setOptimistic((o) => ({ ...o, [task.id]: t.to_status }))
    try {
      await change.mutateAsync({ taskId: task.id, status: t.to_status, comment })
      notifySuccess(`«${task.title}»: ${STATUS_LABEL[t.to_status]}`)
    } catch (e) {
      notifyError(e)
    } finally {
      setOptimistic((o) => {
        const next = { ...o }
        delete next[task.id]
        return next
      })
    }
  }

  const requestMove = (task: TaskRow, t: StatusTransition) => {
    if (t.comment_required) setNeedsComment({ task, transition: t })
    else void move(task, t)
  }

  const onDragStart = (e: DragStartEvent) => setDragged(tasks.find((t) => t.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    const task = dragged
    setDragged(null)
    if (!task || !e.over) return
    const t = actionsFor(task).find((a) => a.to_status === e.over!.id)
    if (t) requestMove(task, t)
  }

  const allowedTargets = dragged ? new Map(actionsFor(dragged).map((a) => [a.to_status, a])) : null
  const assigneeName = (t: TaskRow) => profiles.data?.byId.get(t.assignee_id)?.full_name ?? null

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragged(null)}>
        <Box style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(230px, 1fr))`,
              gap: 12,
              alignItems: 'start',
            }}
          >
            {STATUS_ORDER.map((status) => {
              const cards = tasks.filter((t) => statusOf(t) === status)
              const myMoves = cards.filter((t) => actionsFor(t).length > 0).length
              const target = allowedTargets?.get(status)
              const state = !dragged ? 'idle' : target ? 'allowed' : statusOf(dragged) === status ? 'source' : 'blocked'
              return (
                <Column key={status} status={status} count={cards.length} myMoves={myMoves} state={state} dropLabel={target && actionLabel(target)}>
                  {cards.length === 0 && state !== 'allowed' && (
                    <Text size="xs" c="dimmed" ta="center" py="md">
                      Пусто
                    </Text>
                  )}
                  {cards.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      actions={actionsFor(t)}
                      showObject={showObject}
                      assignee={showAssignee ? assigneeName(t) : null}
                      saving={t.id in optimistic}
                      onAction={(a) => requestMove(t, a)}
                    />
                  ))}
                </Column>
              )
            })}
          </Box>
        </Box>

        <DragOverlay dropAnimation={null}>
          {dragged && (
            <CardView task={dragged} actions={[]} showObject={showObject} assignee={showAssignee ? assigneeName(dragged) : null} lifted />
          )}
        </DragOverlay>
      </DndContext>

      <Modal opened={needsComment !== null} onClose={() => setNeedsComment(null)} title="Вернуть на доработку">
        {needsComment && (
          <ReworkForm
            title={needsComment.task.title}
            onCancel={() => setNeedsComment(null)}
            onSubmit={(comment) => {
              void move(needsComment.task, needsComment.transition, comment)
              setNeedsComment(null)
            }}
          />
        )}
      </Modal>
    </>
  )
}

type ColumnState = 'idle' | 'allowed' | 'blocked' | 'source'

function Column(props: { status: TaskStatus; count: number; myMoves: number; state: ColumnState; dropLabel?: string; children: ReactNode }) {
  const { status, count, myMoves, state, dropLabel, children } = props
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const color = STATUS_COLOR[status]
  const allowed = state === 'allowed'

  return (
    <Paper
      ref={setNodeRef}
      p="xs"
      radius="md"
      bg={allowed && isOver ? `var(--mantine-color-${color}-1)` : 'var(--mantine-color-gray-0)'}
      data-testid={`column-${status}`}
      style={{
        border: allowed
          ? `2px dashed var(--mantine-color-${color}-${isOver ? 7 : 4})`
          : '1px solid var(--mantine-color-gray-3)',
        opacity: state === 'blocked' ? 0.45 : 1,
        minHeight: 140,
        transition: 'opacity 120ms, background-color 120ms',
      }}
    >
      <Group justify="space-between" px={4} wrap="nowrap" gap={6}>
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <Box w={10} h={10} style={{ borderRadius: '50%', background: `var(--mantine-color-${color}-6)`, flexShrink: 0 }} />
          <Text fw={600} size="sm" truncate>
            {STATUS_LABEL[status]}
          </Text>
        </Group>
        <Badge size="sm" color="gray" variant="light" style={{ flexShrink: 0 }}>
          {count}
        </Badge>
      </Group>
      <Text size="xs" px={4} mb="xs" mt={2} fw={500} c={myMoves > 0 ? `${color}.7` : 'transparent'} title="Задачи, по которым вы можете сделать следующий шаг">
        {myMoves > 0 ? `Ваш ход: ${myMoves}` : '\u00a0'}
      </Text>
      <Stack gap="xs">
        {allowed && (
          <Text size="xs" ta="center" py={6} c={`${color}.8`} fw={500}>
            Отпустите: {dropLabel?.toLowerCase()}
          </Text>
        )}
        {children}
      </Stack>
    </Paper>
  )
}

type CardProps = {
  task: TaskRow
  actions: StatusTransition[]
  showObject: boolean
  assignee: string | null
  saving?: boolean
  lifted?: boolean
  onAction?: (t: StatusTransition) => void
}

function DraggableCard(props: CardProps) {
  const movable = props.actions.length > 0
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: props.task.id, disabled: !movable || props.saving })
  return <CardView {...props} innerRef={setNodeRef} listeners={movable ? listeners : undefined} dimmed={isDragging} />
}

function CardView({
  task,
  actions,
  showObject,
  assignee,
  saving,
  lifted,
  onAction,
  innerRef,
  listeners,
  dimmed,
}: CardProps & { innerRef?: (el: HTMLElement | null) => void; listeners?: DraggableSyntheticListeners; dimmed?: boolean }) {
  const movable = !!listeners || lifted
  return (
    <Paper
      ref={innerRef}
      {...listeners}
      withBorder
      p="sm"
      radius="md"
      shadow={lifted ? 'lg' : 'xs'}
      data-testid="task-card"
      data-task-id={task.id}
      style={{
        cursor: lifted ? 'grabbing' : movable ? 'grab' : 'default',
        opacity: dimmed || saving ? 0.45 : 1,
        transform: lifted ? 'rotate(2deg)' : undefined,
        userSelect: 'none',
        touchAction: movable ? 'manipulation' : undefined,
      }}
    >
      <Group justify="space-between" align="flex-start" gap={6} wrap="nowrap">
        <Anchor component={Link} to={`/tasks/${task.id}`} fw={500} size="sm" draggable={false} style={{ wordBreak: 'break-word' }}>
          {task.title}
        </Anchor>
        {movable && <GripIcon />}
      </Group>
      {showObject && task.object && (
        <Text size="xs" c="dimmed" mt={2} lineClamp={1}>
          {task.object.name}
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={6}>
        {assignee ? `${assignee} · ` : ''}
        {formatDate(task.created_at)}
      </Text>
      {actions.length > 0 && onAction && (
        <Group gap={6} mt="xs">
          {actions.map((a) => (
            <Button
              key={a.to_status}
              size="compact-xs"
              variant="light"
              color={a.to_status === 'rework' ? 'red' : a.to_status === 'accepted' ? 'green' : 'blue'}
              disabled={saving}
              onClick={() => onAction(a)}
            >
              {actionLabel(a)}
            </Button>
          ))}
        </Group>
      )}
    </Paper>
  )
}

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden style={{ flexShrink: 0, marginTop: 2, color: 'var(--mantine-color-gray-5)' }}>
      {[3, 9].map((x) => [3, 8, 13].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} fill="currentColor" />))}
    </svg>
  )
}

function ReworkForm({ title, onSubmit, onCancel }: { title: string; onSubmit: (c: string) => void; onCancel: () => void }) {
  const [comment, setComment] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(comment.trim())
      }}
    >
      <Stack>
        <Text size="sm">
          Задача «{title}». Опишите, что нужно исправить: комментарий увидит исполнитель, он сохранится в истории.
        </Text>
        <Textarea label="Комментарий" required autosize minRows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.currentTarget.value)} data-autofocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" color="red" disabled={!comment.trim()}>
            Вернуть на доработку
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
