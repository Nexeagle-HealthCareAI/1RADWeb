import axios from 'axios';

import * as SecureStore from 'expo-secure-store';

const apiClient = axios.create({
  baseURL: 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for secure token injection
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('1rad_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('[MOBILE API] SecureStore access failed:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for session expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[MOBILE API] Unauthorized. Session may have expired.');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
