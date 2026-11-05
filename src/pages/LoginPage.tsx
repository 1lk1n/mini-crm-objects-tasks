import { useState } from 'react'
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setPending(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Неверный email или пароль' : error.message)
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>Мини-CRM</Title>
              <Text c="dimmed" size="sm">
                Объекты и задачи
              </Text>
            </div>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            <PasswordInput label="Пароль" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            <Button type="submit" loading={pending} fullWidth>
              Войти
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              Регистрация закрыта. Доступ выдаёт администратор.
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
