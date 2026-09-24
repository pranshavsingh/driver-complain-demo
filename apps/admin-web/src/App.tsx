import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ComplaintsListPage } from './pages/ComplaintsListPage';
import { ComplaintDetailPage } from './pages/ComplaintDetailPage';
import { LoadingTrackerPage } from './pages/LoadingTrackerPage';
import { TripDetailsPage } from './pages/TripDetailsPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { SparePartsPage } from './pages/SparePartsPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { SupportChatPage } from './pages/SupportChatPage';
import { SettingsPage } from './pages/SettingsPage';

import { ThemeProvider } from './context/ThemeContext';
import { NotFoundPage } from './pages/NotFoundPage';

export function App(): ReactElement {
  return (
    <ThemeProvider>
      <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin Shell Layout with Left Sidebar */}
      <Route
        element={
          <RequireAdmin>
            <Layout />
          </RequireAdmin>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/drivers" element={<Navigate to="/dashboard" replace />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/complaints" element={<ComplaintsListPage />} />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/loading" element={<LoadingTrackerPage />} />
        <Route path="/trips" element={<TripDetailsPage />} />
        <Route path="/fuel-logs" element={<Navigate to="/maintenance?tab=fuel" replace />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/spare-parts" element={<SparePartsPage />} />
        <Route path="/support" element={<SupportChatPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </ThemeProvider>
  );
}


