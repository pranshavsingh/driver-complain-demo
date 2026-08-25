import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
// Fail loudly: a missing #root means index.html and this entry point have drifted apart, and
// a blank page with no console error is the worst way to find that out.
if (!container) throw new Error('index.html is missing the #root element');

createRoot(container).render(
  <StrictMode>
    {/* Outermost, above the providers: this one catches a throw in AuthProvider or
        RealtimeProvider too, which the in-shell boundary cannot see. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
