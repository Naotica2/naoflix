import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export type PlayerState = 'PLAYING' | 'PAUSED' | 'SEEKING' | 'WAITING';

interface WatchPartyState {
  playerState: PlayerState;
  currentTime: number;
  timestamp: number;
}

export interface WatchPartyParticipant {
  id: string;
  username: string;
  avatar_url: string;
  is_vip?: boolean;
  isHost?: boolean;
}

export function useWatchParty(roomId: string | null, isHost: boolean, metadata?: any) {
  const { user, profile } = useAuth();
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([]);
  const [remoteState, setRemoteState] = useState<WatchPartyState | null>(null);
  const [mediaChangeLink, setMediaChangeLink] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [isHostMissing, setIsHostMissing] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;

    // Create unique channel for this room
    const roomChannel = supabase.channel(`room_${roomId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // Handle incoming state from host
    roomChannel.on('broadcast', { event: 'player_state' }, (payload) => {
      if (!isHost && payload.payload) {
        setRemoteState(payload.payload as WatchPartyState);
      }
    });

    // Handle incoming chat messages
    roomChannel.on('broadcast', { event: 'chat' }, (payload) => {
      if (payload.payload) {
        setChatMessages(prev => [...prev, payload.payload]);
      }
    });

    // Handle incoming media changes (for next/prev episode sync)
    roomChannel.on('broadcast', { event: 'media_change' }, (payload) => {
      if (!isHost && payload.payload?.link) {
        setMediaChangeLink(payload.payload.link);
      }
    });

    // Handle Presence (Users joining/leaving)
    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const currentParticipants: WatchPartyParticipant[] = [];
      Object.keys(state).forEach(key => {
        const presenceList = state[key] as any[];
        if (presenceList.length > 0) {
          currentParticipants.push({
            id: key,
            username: presenceList[0].username || 'Anonim',
            avatar_url: presenceList[0].avatar_url || '',
            is_vip: presenceList[0].is_vip || false,
            isHost: presenceList[0].isHost || false,
          });
        }
      });
      setParticipants(currentParticipants);
    });

    roomChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      newPresences.forEach((presence: any) => {
        const name = presence.username || 'Seseorang';
        setChatMessages(prev => [...prev, { id: `sys-join-${Date.now()}-${Math.random()}`, sender: 'System', text: `👋 ${name} telah bergabung ke room`, isSystem: true }]);
      });
    });

    roomChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      leftPresences.forEach((presence: any) => {
        const name = presence.username || 'Seseorang';
        setChatMessages(prev => [...prev, { id: `sys-leave-${Date.now()}-${Math.random()}`, sender: 'System', text: `🚪 ${name} telah meninggalkan room`, isSystem: true }]);
      });
    });

    let disconnectTimeout: ReturnType<typeof setTimeout>;

    roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(disconnectTimeout);
        setConnectionStatus('CONNECTED');
        await roomChannel.track({
          username: profile?.display_name || profile?.username || user.user_metadata?.username || 'Guest',
          avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
          is_vip: profile?.is_vip || false,
          isHost,
          metadata: isHost ? metadata : undefined,
        });
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        disconnectTimeout = setTimeout(() => {
          setConnectionStatus('DISCONNECTED');
        }, 15000);
      }
    });

    setChannel(roomChannel);

    return () => {
      clearTimeout(disconnectTimeout);
      roomChannel.unsubscribe();
      setChannel(null);
    };
  }, [roomId, user, profile, isHost]);

  // Check for Host missing tolerance
  useEffect(() => {
    if (!roomId || isHost || participants.length === 0) return;
    const hostExists = participants.some(p => p.isHost);
    if (!hostExists) {
      const t = setTimeout(() => setIsHostMissing(true), 15000);
      return () => clearTimeout(t);
    } else {
      setIsHostMissing(false);
    }
  }, [participants, isHost, roomId]);

  // Method for Host to broadcast their player state
  const broadcastState = useCallback((state: PlayerState, time: number) => {
    if (!channel || !isHost) return;
    
    channel.send({
      type: 'broadcast',
      event: 'player_state',
      payload: {
        playerState: state,
        currentTime: time,
        timestamp: Date.now(),
      },
    });
  }, [channel, isHost]);

  // Method for sending chat messages
  const broadcastChat = useCallback((message: any) => {
    if (!channel) return;
    
    // Optimistic UI (add to own state immediately)
    setChatMessages(prev => [...prev, message]);
    
    channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: message,
    });
  }, [channel]);

  // Method for changing media
  const broadcastMediaChange = useCallback((newLink: string) => {
    if (!channel || !isHost) return;
    
    channel.send({
      type: 'broadcast',
      event: 'media_change',
      payload: { link: newLink },
    });
  }, [channel, isHost]);

  return {
    participants,
    remoteState,
    broadcastState,
    chatMessages,
    broadcastChat,
    broadcastMediaChange,
    mediaChangeLink,
    isActive: !!roomId,
    connectionStatus,
    isHostMissing,
  };
}
