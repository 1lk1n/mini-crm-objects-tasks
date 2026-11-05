import { Alert, Button, Center, Stack } from '@mantine/core'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import { AppLayout } from './components/AppLayout'
import { NotFound, PageLoader } from './components/common'
import { LoginPage } from './pages/LoginPage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'

function RequireAuth() {
  const { session, profile, loading, error, signOut } = useAuth()
  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!profile)
    return (
      <Center mih="100vh" p="md">
        <Stack maw={420}>
          <Alert color="red" title="Нет доступа">
            {error ?? 'Профиль не найден'}
          </Alert>
          <Button variant="default" onClick={signOut}>
            Выйти
          </Button>
        </Stack>
      </Center>
    )
  return <Outlet />
}

function Home() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'executor' ? '/my-tasks' : '/objects'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="/objects" element={<ObjectsPage />} />
          <Route path="/objects/:objectId" element={<ObjectPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/my-tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskPage />} />
          <Route path="*" element={<NotFound what="Страница" />} />
        </Route>
      </Route>
    </Routes>
  )
}
