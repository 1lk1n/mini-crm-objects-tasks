import { AppShell, Badge, Button, Container, Group, Text } from '@mantine/core'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useMe } from '../auth/context'

const ROLE_LABEL = { manager: 'Постановщик', executor: 'Исполнитель' } as const

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <Button variant={isActive ? 'light' : 'subtle'} size="sm">
          {children}
        </Button>
      )}
    </NavLink>
  )
}

export function AppLayout() {
  const me = useMe()
  const { signOut } = useAuth()

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Text fw={700} mr="sm" visibleFrom="xs">
                Мини-CRM
              </Text>
              {me.role === 'executor' ? (
                <NavItem to="/my-tasks">Мои задачи</NavItem>
              ) : (
                <NavItem to="/tasks">Все задачи</NavItem>
              )}
              <NavItem to="/objects">Объекты</NavItem>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" visibleFrom="sm">
                {me.full_name}
              </Text>
              <Badge variant="outline" color={me.role === 'manager' ? 'indigo' : 'teal'} visibleFrom="xs">
                {ROLE_LABEL[me.role]}
              </Badge>
              <Button variant="default" size="xs" onClick={signOut}>
                Выйти
              </Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
