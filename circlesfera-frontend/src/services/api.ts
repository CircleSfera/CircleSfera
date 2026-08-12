import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { useAdminAuthStore } from '../stores/adminAuthStore';
import { useAuthStore } from '../stores/authStore';
import { isAdminPanelHost } from '../utils/adminPanel';
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

    this.client.interceptors.response.use(
      (response) => {
        const url = response.config.url || '';
        if (
          url.includes('/auth/login') ||
          url.includes('/auth/register') ||
          url.includes('/auth/refresh') ||
          url.includes('/admin-auth/login') ||
          url.includes('/admin-auth/refresh') ||
          url.includes('/admin-auth/mfa/verify')
        ) {
          this.csrfToken = null;
        }

        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) return Promise.reject(error);

        const adminPanel = isAdminPanelHost();
        const isAuthRequest = adminPanel
          ? originalRequest.url?.includes('/admin-auth/login') ||
            originalRequest.url?.includes('/admin-auth/mfa/verify') ||
            originalRequest.url?.includes('/admin-auth/refresh')
          : originalRequest.url?.includes('/auth/login') ||
            originalRequest.url?.includes('/auth/register') ||
            originalRequest.url?.includes('/auth/refresh');

        if (error.response?.status === 403 && !originalRequest._csrfRetry) {
          originalRequest._csrfRetry = true;
          this.csrfToken = null;
          const newToken = await getCSRFToken();
          if (newToken) {
            originalRequest.headers['x-csrf-token'] = newToken;
            return this.client(originalRequest);
          }
        }

        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !isAuthRequest
        ) {
          originalRequest._retry = true;

          try {
            const refreshPath = adminPanel
              ? '/admin-auth/refresh'
              : '/auth/refresh';
            await axios.post(
              `${API_URL}${refreshPath}`,
              {},
              { withCredentials: true },
            );
            this.csrfToken = null;
            await getCSRFToken();
            return this.client(originalRequest);
          } catch (refreshError) {
            if (adminPanel) {
              void useAdminAuthStore.getState().logout();
              if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
              }
            } else if (
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
