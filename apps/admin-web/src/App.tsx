import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireNonExecutive, RequirePageAccess } from './auth/RequireAdmin';
import { Layout } from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import { PageModuleSkeleton } from './components/LoadingSystem';

const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ComplaintsListPage = lazy(() => import('./pages/ComplaintsListPage').then((m) => ({ default: m.ComplaintsListPage })));
const ComplaintDetailPage = lazy(() => import('./pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage })));
const LoadingTrackerPage = lazy(() => import('./pages/LoadingTrackerPage').then((m) => ({ default: m.LoadingTrackerPage })));
const TripDetailsPage = lazy(() => import('./pages/TripDetailsPage').then((m) => ({ default: m.TripDetailsPage })));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })));
const SparePartsPage = lazy(() => import('./pages/SparePartsPage').then((m) => ({ default: m.SparePartsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })));
const SupportChatPage = lazy(() => import('./pages/SupportChatPage').then((m) => ({ default: m.SupportChatPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export function App(): ReactElement {
  return (
    <ThemeProvider>
      <Suspense fallback={<PageModuleSkeleton title="Loading console..." subtitle="Initializing enterprise fleet session…" />}>
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
      </Suspense>
    </ThemeProvider>
  );
}


