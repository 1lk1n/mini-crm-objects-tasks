import type { Profile, StatusTransition, Task, TaskStatus } from './database.types'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'yellow',
  review: 'violet',
  accepted: 'green',
  rework: 'red',
}

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted']

// Button labels for transitions; the transitions themselves come from the DB.
const ACTION_LABEL: Partial<Record<`${TaskStatus}->${TaskStatus}`, string>> = {
  'new->in_progress': 'Взять в работу',
  'in_progress->review': 'Отправить на проверку',
  'review->accepted': 'Принять',
  'review->rework': 'Вернуть на доработку',
  'rework->in_progress': 'Взять в работу',
}

export function actionLabel(t: StatusTransition): string {
  return ACTION_LABEL[`${t.from_status}->${t.to_status}`] ?? `→ ${STATUS_LABEL[t.to_status]}`
}

/**
 * Transitions the current user may perform on this task right now.
 * Mirrors the check in public.change_task_status(): the UI only hides buttons,
 * the database is what actually enforces the rule.
 */
export function availableTransitions(
  task: Pick<Task, 'status' | 'assignee_id'>,
  me: Profile,
  transitions: StatusTransition[],
): StatusTransition[] {
  return transitions.filter(
    (t) =>
      t.from_status === task.status &&
      t.actor === me.role &&
      (t.actor === 'manager' || task.assignee_id === me.id),
  )
}
