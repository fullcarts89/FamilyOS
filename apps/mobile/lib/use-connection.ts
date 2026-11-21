import { useSyncExternalStore } from 'react';
import { currentConnection, onConnectionChange } from './api';

/** 'online' or 'offline', from the requests the app makes and the browser's own events. */
export function useConnection(): 'online' | 'offline' {
  return useSyncExternalStore(onConnectionChange, currentConnection, currentConnection);
}
