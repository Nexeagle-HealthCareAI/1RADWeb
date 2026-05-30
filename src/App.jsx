import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRouter from './routes/AppRouter';
import ApiErrorToast from './components/ApiErrorToast';
import { OverdueProvider } from './components/OverdueAppointments/OverdueContext';

function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
