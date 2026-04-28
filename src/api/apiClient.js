import axios from 'axios';

const BASE_URL = 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Authorization header
apiClient.interceptors.request.use((config) => {
  // Do not add auth header for public authentication routes
  const publicRoutes = ['/auth/login', '/auth/otp/send', '/auth/otp/verify', '/auth/forgot-password'];
  const isPublicRoute = publicRoutes.some(route => config.url.includes(route));

  if (!isPublicRoute) {
    const token = sessionStorage.getItem('1rad_token') || sessionStorage.getItem('1rad_initiation_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor to handle responses and token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isLogin = error.config.url.includes('/auth/login');
      if (!isLogin) {
        console.warn('[API] Unauthorized. Session may have expired.');
      } else {
        console.warn('[API] Login failed: Invalid credentials.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
