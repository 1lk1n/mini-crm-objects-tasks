import { Paper, Text, Timeline } from '@mantine/core'
import { useProfiles, useTaskHistory } from '../lib/api'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/status'
import { EmptyText, ErrorAlert, PageLoader } from './common'
import { formatDate } from '../lib/ui'

export function TaskHistory({ taskId }: { taskId: string }) {
  const history = useTaskHistory(taskId)
  const profiles = useProfiles()

  if (history.isPending) return <PageLoader />
  if (history.isError) return <ErrorAlert error={history.error} />
  if (history.data.length === 0) return <EmptyText>История пуста</EmptyText>

  return (
    <Timeline active={history.data.length - 1} bulletSize={14} lineWidth={2}>
      {history.data.map((h) => (
        <Timeline.Item
          key={h.id}
          color={STATUS_COLOR[h.to_status]}
          title={h.from_status ? `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}` : `Создана (${STATUS_LABEL[h.to_status]})`}
        >
          <Text size="sm" c="dimmed">
            {profiles.data?.byId.get(h.changed_by)?.full_name ?? 'Пользователь'} · {formatDate(h.changed_at)}
          </Text>
          {h.comment && (
            <Paper withBorder p="xs" mt={4} bg="var(--mantine-color-gray-0)">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {h.comment}
              </Text>
            </Paper>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  )
}
