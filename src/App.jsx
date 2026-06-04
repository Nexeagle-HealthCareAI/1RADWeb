import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRouter from './routes/AppRouter';
import ApiErrorToast from './components/ApiErrorToast';
import { OverdueProvider } from './components/OverdueAppointments/OverdueContext';

// In the Electron desktop app the page loads over file:// (no real URL path),
// so BrowserRouter can't match routes — it needs HashRouter (index.html#/…).
// On the web (window.electron is undefined) we keep clean BrowserRouter URLs.
const Router = (typeof window !== 'undefined' && window.electron) ? HashRouter : BrowserRouter;

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* OverdueProvider polls /appointments/overdue every 30s and exposes
            the result to the nav-bar bell + each board's row decorator. */}
        <OverdueProvider>
          <AppRouter />
          {/* Global API error notifications — listens for the
              '1rad:api-error' window event dispatched by apiClient. */}
          <ApiErrorToast />
        </OverdueProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
