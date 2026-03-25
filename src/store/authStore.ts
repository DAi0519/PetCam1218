import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: { id: string; email: string; name: string } | null;
  isChecking: boolean;
  setUser: (user: AuthState['user']) => void;
  setChecking: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isChecking: true,
      setUser: (user) => set({ user }),
      setChecking: (value) => set({ isChecking: value }),
      reset: () => set({ user: null, isChecking: false }),
    }),
    {
      name: 'app-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
