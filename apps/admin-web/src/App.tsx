import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireSuperAdmin } from './auth/RequireAdmin';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DriversPage } from './pages/DriversPage';
import { ComplaintsListPage } from './pages/ComplaintsListPage';
import { ComplaintDetailPage } from './pages/ComplaintDetailPage';
import { LoadingTrackerPage } from './pages/LoadingTrackerPage';
import { TripDetailsPage } from './pages/TripDetailsPage';
import { UsersPage } from './pages/UsersPage';
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
        <Route path="/drivers" element={<DriversPage />} />
        <Route
          path="/users"
          element={
            <RequireSuperAdmin>
              <UsersPage />
            </RequireSuperAdmin>
          }
        />
        <Route path="/complaints" element={<ComplaintsListPage />} />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/loading" element={<LoadingTrackerPage />} />
        <Route path="/trips" element={<TripDetailsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </ThemeProvider>
  );
}
