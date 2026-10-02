import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireNonExecutive, RequirePageAccess } from './auth/RequireAdmin';
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
        <Route
          path="/users"
          element={
            <RequireNonExecutive>
              <UsersPage />
            </RequireNonExecutive>
          }
        />
        <Route
          path="/complaints"
          element={
            <RequirePageAccess path="/complaints">
              <ComplaintsListPage />
            </RequirePageAccess>
          }
        />
        <Route
          path="/complaints/:id"
          element={
            <RequirePageAccess path="/complaints">
              <ComplaintDetailPage />
            </RequirePageAccess>
          }
        />
        <Route
          path="/loading"
          element={
            <RequirePageAccess path="/loading">
              <LoadingTrackerPage />
            </RequirePageAccess>
          }
        />
        <Route path="/loading-tracker" element={<Navigate to="/loading" replace />} />
        <Route
          path="/trips"
          element={
            <RequirePageAccess path="/trips">
              <TripDetailsPage />
            </RequirePageAccess>
          }
        />
        <Route path="/fuel-logs" element={<Navigate to="/maintenance?tab=fuel" replace />} />
        <Route
          path="/maintenance"
          element={
            <RequirePageAccess path="/maintenance">
              <MaintenancePage />
            </RequirePageAccess>
          }
        />
        <Route
          path="/spare-parts"
          element={
            <RequirePageAccess path="/spare-parts">
              <SparePartsPage />
            </RequirePageAccess>
          }
        />
        <Route
          path="/support"
          element={
            <RequirePageAccess path="/support">
              <RequireNonExecutive>
                <SupportChatPage />
              </RequireNonExecutive>
            </RequirePageAccess>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePageAccess path="/reports">
              <ReportsPage />
            </RequirePageAccess>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePageAccess path="/settings">
              <RequireNonExecutive>
                <SettingsPage />
              </RequireNonExecutive>
            </RequirePageAccess>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </ThemeProvider>
  );
}


