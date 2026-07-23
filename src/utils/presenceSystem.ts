import { useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';

let globalPresenceChannel: any = null;
const presenceListeners = new Set<(state: any) => void>();

export const initPresence = (userId: string) => {
  if (!globalPresenceChannel) {
    globalPresenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    globalPresenceChannel.on('presence', { event: 'sync' }, () => {
      const state = globalPresenceChannel.presenceState();
      presenceListeners.forEach(listener => listener(state));
    });

    globalPresenceChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await globalPresenceChannel.track({
          online: true,
          activity: 'Online',
          updated_at: new Date().toISOString(),
        });
      }
    });
  }
  return globalPresenceChannel;
};

export const subscribeToPresence = (callback: (state: any) => void) => {
  presenceListeners.add(callback);
  if (globalPresenceChannel && globalPresenceChannel.state === 'joined') {
    callback(globalPresenceChannel.presenceState());
  }
  return () => {
    presenceListeners.delete(callback);
  };
};

export const updateActivity = async (activity: string) => {
  if (globalPresenceChannel && globalPresenceChannel.state === 'joined') {
    await globalPresenceChannel.track({
      online: true,
      activity,
      updated_at: new Date().toISOString(),
    });
  }
};

export const clearActivity = async () => {
  if (globalPresenceChannel && globalPresenceChannel.state === 'joined') {
    await globalPresenceChannel.track({
      online: true,
      activity: 'Online',
      updated_at: new Date().toISOString(),
    });
  }
};

export function usePresenceActivity(activity: string) {
  const { user } = useAuth();
  
  useEffect(() => {
    if (user) {
      updateActivity(activity);
    }
    return () => {
      if (user) {
        clearActivity();
      }
    };
  }, [activity, user]);
}
