import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRouter from './routes/AppRouter';
import ApiErrorToast from './components/ApiErrorToast';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        {/* Global API error notifications — listens for the
            '1rad:api-error' window event dispatched by apiClient. */}
        <ApiErrorToast />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
