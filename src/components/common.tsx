import { Alert, Badge, Center, Loader, Text } from '@mantine/core'
import type { TaskStatus } from '../lib/database.types'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/status'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant="light" style={{ flexShrink: 0 }}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function PageLoader() {
  return (
    <Center py="xl">
      <Loader />
    </Center>
  )
}

export function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert color="red" title="Ошибка">
      {error instanceof Error ? error.message : String(error)}
    </Alert>
  )
}

export function NotFound({ what }: { what: string }) {
  return (
    <Alert color="gray" title={`${what} не найден(а)`}>
      Запись не существует, удалена или у вас нет к ней доступа.
    </Alert>
  )
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <Text c="dimmed" ta="center" py="lg">
      {children}
    </Text>
  )
}
