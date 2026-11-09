import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../services/api';

const SocketContext = createContext({ socket: null, connected: false });

/**
 * เชื่อมต่อ Socket.IO ขณะผู้ใช้เข้าสู่ระบบ (ครอบไว้ใน MainLayout — ออกจากระบบแล้วตัดการเชื่อมต่ออัตโนมัติ)
 * ส่ง JWT ทุกครั้งที่เชื่อมต่อ/เชื่อมต่อใหม่ — Backend จัดให้อยู่ในห้อง role:<role>
 *
 * Event จาก Backend: order:created, order:updated, menu:updated (payload: { order } / { menu })
 */
export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: (cb) => cb({ token: getToken() }),
      transports: ['websocket', 'polling'],
    });
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    s.on('connect', up);
    s.on('disconnect', down);
    s.on('connect_error', down);
    setSocket(s);
    return () => {
      s.off('connect', up);
      s.off('disconnect', down);
      s.off('connect_error', down);
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, []);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocketStatus() {
  return useContext(SocketContext).connected;
}

/** ฟัง event จาก Backend — handler ล่าสุดถูกเรียกเสมอโดยไม่ต้อง subscribe ใหม่ */
export function useSocketEvent(event, handler) {
  const { socket } = useContext(SocketContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

/** เรียกเมื่อเชื่อมต่อกลับมาได้หลังหลุด — ใช้โหลดข้อมูลใหม่เพราะอาจพลาด event ระหว่างนั้น */
export function useSocketReconnect(handler) {
  const { socket } = useContext(SocketContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const fn = () => ref.current();
    socket.io.on('reconnect', fn);
    return () => socket.io.off('reconnect', fn);
  }, [socket]);
}
