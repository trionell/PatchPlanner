import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RootGate } from './components/RootGate'
import { DashboardPage } from './pages/Dashboard'
import { EventDetailPage } from './pages/EventDetail'
import { EventsPage } from './pages/Events'
import { InventoriesPage } from './pages/Inventories'
import { LoginPage } from './pages/Login'
import { MyDefaultsPage } from './pages/MyDefaults'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RootGate />}>
            <Route index element={<DashboardPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route path="inventories" element={<InventoriesPage />} />
            <Route path="my-defaults" element={<MyDefaultsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
