import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { handleApiError } from '../utils/apiUtils';

// In production, this should be https://circlesfera.com/api/v1
// In development, it defaults to localhost:3000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;
  private csrfToken: string | null = null;
  private csrfTokenPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    const getCSRFToken = async () => {
      if (this.csrfTokenPromise) return this.csrfTokenPromise;

      this.csrfTokenPromise = (async () => {
        try {
          // Use a direct axios call to avoid the interceptor loop
          const { data } = await axios.get(`${API_URL}/csrf-token`, {
            withCredentials: true,
          });
          this.csrfToken = data.csrfToken;
          return data.csrfToken;
        } catch (error) {
          console.error('Failed to fetch CSRF token:', error);
          return null;
        } finally {
          this.csrfTokenPromise = null;
        }
      })();

      return this.csrfTokenPromise;
    };

    // Request interceptor to inject CSRF token
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const method = config.method?.toUpperCase();
        if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          if (!this.csrfToken) {
            await getCSRFToken();
          }
          if (this.csrfToken) {
            config.headers['x-csrf-token'] = this.csrfToken;
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const url = response.config.url || '';
        if (
          url.includes('/auth/login') ||
          url.includes('/auth/register') ||
          url.includes('/auth/refresh')
        ) {
          this.csrfToken = null;
        }

        // --- GLOBAL MEDIA SANITIZER ---
        console.log('CircleSfera: Global URL Sanitizer v3 Active');
        // Prepend API_URL to relative /uploads paths and normalize legacy localhost URLs
        const sanitize = (obj: unknown): unknown => {
          if (!obj || typeof obj !== 'object') {
            if (typeof obj === 'string') {
              // 1. Normalize legacy hardcoded localhost:3000 URLs to just /uploads
              const processed = obj.replace(
                /^https?:\/\/localhost:3000\/uploads/,
                '/uploads',
              );

              // 2. If it's a relative /uploads path, prepend the current API_URL
              if (processed.startsWith('/uploads')) {
                // Ensure we don't double prepend if API_URL also contains /uploads (unlikely but safe)
                const baseUrl = API_URL.replace(/\/api\/v1\/?$/, '');
                return `${baseUrl}${processed}`;
              }
              return processed;
            }
            return obj;
          }
          if (Array.isArray(obj)) return obj.map(sanitize);
          const record = obj as Record<string, unknown>;
          const newObj: Record<string, unknown> = {};
          for (const key in record) {
            newObj[key] = sanitize(record[key]);
          }
          return newObj;
        };

        response.data = sanitize(response.data);
        // ------------------------------

        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) return Promise.reject(error);

        const isAuthRequest =
          originalRequest.url?.includes('/auth/login') ||
          originalRequest.url?.includes('/auth/register') ||
          originalRequest.url?.includes('/auth/refresh');

        // Handle CSRF failure (403 Forbidden)
        if (error.response?.status === 403 && !originalRequest._csrfRetry) {
          originalRequest._csrfRetry = true;
          this.csrfToken = null;
          const newToken = await getCSRFToken();
          if (newToken) {
            originalRequest.headers['x-csrf-token'] = newToken;
            return this.client(originalRequest);
          }
        }

        // Handle Auth failure (401 Unauthorized)
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !isAuthRequest
        ) {
          originalRequest._retry = true;

          try {
            await axios.post(
              `${API_URL}/auth/refresh`,
              {},
              { withCredentials: true },
            );
            this.csrfToken = null;
            await getCSRFToken();
            return this.client(originalRequest);
          } catch (refreshError) {
            if (
              !isAuthRequest &&
              !window.location.pathname.includes('/accounts/')
            ) {
              useAuthStore.getState().logout();
              window.location.href = '/accounts/login';
            }
            return Promise.reject(refreshError);
          }
        }

        return handleApiError(error);
      },
    );
  }

  getClient(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient().getClient();
