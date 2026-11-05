import { useState } from 'react'
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useSaveObject } from '../lib/api'
import type { CrmObject } from '../lib/database.types'
import { notifyError, notifySuccess } from '../lib/ui'

type Props = {
  opened: boolean
  onClose: () => void
  object?: CrmObject // edit mode when set
  onSaved?: (id: string) => void
}

export function ObjectFormModal({ opened, onClose, object, onSaved }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={object ? 'Редактировать объект' : 'Новый объект'}>
      {/* key: reset the form each time the modal opens */}
      {opened && <ObjectForm key={object?.id ?? 'new'} object={object} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

function ObjectForm({ object, onClose, onSaved }: Omit<Props, 'opened'>) {
  const [name, setName] = useState(object?.name ?? '')
  const [address, setAddress] = useState(object?.address ?? '')
  const save = useSaveObject()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    save.mutate(
      { id: object?.id, values: { name: name.trim(), address: address.trim() } },
      {
        onSuccess: (id) => {
          notifySuccess(object ? 'Объект сохранён' : 'Объект создан')
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
        <TextInput label="Название" required maxLength={200} value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput label="Адрес" required maxLength={500} value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!name.trim() || !address.trim()}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
