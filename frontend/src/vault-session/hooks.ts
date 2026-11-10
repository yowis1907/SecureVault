import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type SessionState, type UnlockedState } from './session';

export function useVaultSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** For screens rendered only behind the unlock guard. */
export function useUnlockedVault(): UnlockedState {
  const session = useVaultSession();
  if (session.status !== 'unlocked') {
    throw new Error('useUnlockedVault used while the vault is locked');
  }
  return session;
}
