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
  const token = sessionStorage.getItem('1rad_token') || sessionStorage.getItem('1rad_initiation_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      console.warn('[API] Unauthorized. Session may have expired.');
      // Optional: Trigger logout flow if token is expired
    }
    return Promise.reject(error);
  }
);

export default apiClient;
