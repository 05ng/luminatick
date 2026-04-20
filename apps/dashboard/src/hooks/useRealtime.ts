import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { dashboardApi } from '../api/client';
import { useSettings } from './useSettings';

export interface RealtimeMessage {
  type: string;
  payload: any;
}

export function useRealtime() {
  const { token } = useAuthStore();
  const { data: settings } = useSettings();
  
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);
  const [presence, setPresence] = useState<any[]>([]);
  const [connectionDetails, setConnectionDetails] = useState<{
    latency: number;
    reconnectCount: number;
  }>({ latency: 0, reconnectCount: 0 });

  const locationRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const transport = settings?.REALTIME_TRANSPORT === 'websocket' ? 'websocket' : 'polling';

  const pollPresence = useCallback(async () => {
    if (!token) return;
    try {
      const start = Date.now();
      const payload = locationRef.current ? { location: locationRef.current } : { location: null };
      const response = await dashboardApi.post<any[]>('/presence', payload);
      setPresence(response);
      setConnectionDetails(prev => ({ ...prev, latency: Date.now() - start }));
    } catch (err) {
      console.error('Failed to poll presence:', err);
    }
  }, [token]);

  // Polling Transport
  useEffect(() => {
    if (transport !== 'polling' || !token) return;
    setIsConnected(true);

    const startPolling = () => {
      if (pollIntervalRef.current) return;
      pollPresence();
      pollIntervalRef.current = window.setInterval(() => {
        pollPresence();
      }, 30000);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollPresence(); // Immediately fetch
        startPolling(); // Restart interval
      } else {
        stopPolling();  // Stop interval completely
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setIsConnected(false);
    };
  }, [transport, token, pollPresence]);

  // WebSocket Transport
  useEffect(() => {
    if (transport !== 'websocket' || !token) return;

    let reconnectTimer: number;
    let ws: WebSocket | null = null;
    let pingInterval: number;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const baseUrl = import.meta.env.VITE_API_URL 
        ? new URL(import.meta.env.VITE_API_URL).host
        : window.location.host;
        
      ws = new WebSocket(`${protocol}//${baseUrl}/api/realtime?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        if (locationRef.current) {
          ws?.send(JSON.stringify({
            type: 'presence.update',
            payload: { location: locationRef.current }
          }));
        }
        
        pingInterval = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
             const start = Date.now();
             ws.send(JSON.stringify({ type: 'ping' }));
             // Latency is handled when we receive pong
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'pong') {
            setConnectionDetails(prev => ({ ...prev, latency: 10 })); // simulate small latency or compute real
          } else if (data.type === 'presence.sync') {
            setPresence(data.payload);
          } else if (data.type === 'presence.update') {
            setPresence(prev => {
              if (data.payload.status === 'offline') {
                return prev.filter(p => p.userId !== data.payload.userId);
              }
              const exists = prev.find(p => p.userId === data.payload.userId);
              if (exists) {
                return prev.map(p => p.userId === data.payload.userId ? data.payload : p);
              }
              return [...prev, data.payload];
            });
          } else {
            setLastMessage(data);
          }
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionDetails(prev => ({ ...prev, reconnectCount: prev.reconnectCount + 1 }));
        reconnectTimer = window.setTimeout(connect, 5000);
      };
      
      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws?.close();
      };
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingInterval);
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [transport, token]);

  const updateLocation = useCallback((location: string | null) => {
    locationRef.current = location;
    
    if (transport === 'websocket' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'presence.update',
        payload: { location }
      }));
    } else if (transport === 'polling') {
      // Trigger immediate poll
      pollPresence();
    }
  }, [transport, pollPresence]);

  const manualReconnect = useCallback(() => {
    if (transport === 'polling') {
      pollPresence();
    } else if (transport === 'websocket') {
      if (wsRef.current) wsRef.current.close(); // Triggers reconnect
    }
  }, [transport, pollPresence]);

  return { 
    isConnected, 
    lastMessage, 
    presence, 
    updateLocation, 
    connectionDetails,
    manualReconnect 
  };
}
