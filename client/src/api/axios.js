import axios from 'axios';

/**
 * Pre-configured Axios instance for the Chat Service API.
 * withCredentials ensures the httpOnly accessToken cookie is sent on every request.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
