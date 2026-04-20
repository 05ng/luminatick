import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  mfa_enabled: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  mfaRequired: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  setMfaRequired: (required: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      mfaRequired: false,
      setAuth: (token, user) => set({ token, user, mfaRequired: false }),
      updateUser: (updates) => set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
      setMfaRequired: (required) => set({ mfaRequired: required }),
      logout: () => set({ token: null, user: null, mfaRequired: false }),
    }),
    {
      name: 'lumina-auth',
    }
  )
);
