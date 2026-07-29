import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import type { Notification } from '../types';

export function useGlobalSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { isAuthenticated } = useAuthStore();
  const { addNotification } = useNotificationsStore();

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (!socketRef.current) {
      // API_URL might be http://localhost:3000/api/v1, so we need the base origin
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const baseUrl = new URL(apiUrl).origin;

      socketRef.current = io(`${baseUrl}/events`, {
        path: '/socket.io',
        withCredentials: true,
        reconnection: true,
      });

      socketRef.current.on('connect', () => {
        console.log('Global socket connected for notifications');
      });

      socketRef.current.on('notification', (notification: Notification) => {
        // Increment global badge and add to live notifications
        addNotification(notification as any);

        // Show Toast
        toast(notification.content || 'Tienes una nueva notificación', {
          icon: '🔔',
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
        });
      });

      socketRef.current.on('disconnect', () => {
        console.log('Global socket disconnected');
      });
    }

    return () => {
      // We don't disconnect on every render, only when user changes
    };
  }, [isAuthenticated, addNotification]);

  return {
    socket: socketRef.current,
  };
}
