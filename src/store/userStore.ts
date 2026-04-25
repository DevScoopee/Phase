import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types/api';

interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  notifications: boolean;
  hasAcceptedPolicy: boolean;
}

interface UserState {
  user: UserProfile | null;
  consent: ConsentState;
  setUser: (user: UserProfile | null) => void;
  setConsent: (consent: Partial<ConsentState>) => void;
  acceptAll: () => void;
  resetConsent: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      consent: {
        analytics: false,
        marketing: false,
        notifications: true, // Default to true for core functionality
        hasAcceptedPolicy: false,
      },
      setUser: (user) => set(() => ({ user })),
      setConsent: (newConsent) =>
        set((state) => ({
          consent: { ...state.consent, ...newConsent },
        })),
      acceptAll: () =>
        set(() => ({
          consent: {
            analytics: true,
            marketing: true,
            notifications: true,
            hasAcceptedPolicy: true,
          },
        })),
      resetConsent: () =>
        set(() => ({
          consent: {
            analytics: false,
            marketing: false,
            notifications: false,
            hasAcceptedPolicy: false,
          },
        })),
    }),
    {
      name: 'subtrackr-user-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
