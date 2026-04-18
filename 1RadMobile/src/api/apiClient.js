import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for token injection
apiClient.interceptors.request.use(
  async (config) => {
    // Note: In a production app, we would use a more robust token storage 
    // but for now, we'll allow AuthContext to set this or use a shared state.
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;
