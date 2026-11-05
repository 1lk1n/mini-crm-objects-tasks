import { notifications } from '@mantine/notifications'

export function notifyError(error: unknown) {
  notifications.show({
    color: 'red',
    title: 'Не удалось выполнить действие',
    message: error instanceof Error ? error.message : String(error),
  })
}

export function notifySuccess(message: string) {
  notifications.show({ color: 'green', message })
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}
