import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';
import { tSync } from '../misc/LanguageContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export type PlayerState = 'PLAYING' | 'PAUSED' | 'SEEKING' | 'WAITING';

export interface WatchPartyState {
  playerState: PlayerState;
  currentTime: number;
  timestamp: number;
}

export interface WatchPartyParticipant {
  id: string;
  username: string;
  avatar_url: string;
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
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [syncRequestCount, setSyncRequestCount] = useState(0);

  const activeRoomId = useMemo(() => (roomId ? roomId.trim().toUpperCase() : null), [roomId]);

  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const metadataKey = useMemo(() => JSON.stringify(metadata || null), [metadata]);

  const selfDisplayName =
    profile?.display_name ||
    profile?.username ||
    user?.user_metadata?.username ||
    tSync('common.guest');
  const selfAvatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || '';

  useEffect(() => {
    if (!activeRoomId || !user) {
      setParticipants([]);
      setRemoteState(null);
      setMediaChangeLink(null);
      setChatMessages([]);
      setConnectionStatus('CONNECTING');
      setIsHostMissing(false);
      setIsRoomClosed(false);
      setSyncRequestCount(0);
      return;
    }

    setConnectionStatus('CONNECTING');
    setIsHostMissing(false);
    setIsRoomClosed(false);

    const knownUsersRef = new Map<string, string>();
    let hasBaseline = false;

    const roomChannel = supabase.channel(`room_${activeRoomId}`, {
      config: {
        broadcast: {
          self: false,
        },
        presence: {
          key: user.id,
        },
      },
    });

    roomChannel.on('broadcast', { event: 'player_state' }, (payload) => {
      if (!isHost && payload.payload) {
        setRemoteState(payload.payload as WatchPartyState);
      }
    });

    roomChannel.on('broadcast', { event: 'chat' }, (payload) => {
      if (payload.payload) {
        setChatMessages(prev => [...prev, payload.payload]);
      }
    });

    roomChannel.on('broadcast', { event: 'media_change' }, (payload) => {
      if (!isHost && payload.payload?.link) {
        setMediaChangeLink(payload.payload.link);
      }
    });

    roomChannel.on('broadcast', { event: 'request_sync' }, () => {
      if (isHost) {
        setSyncRequestCount(c => c + 1);
      }
    });

    roomChannel.on('broadcast', { event: 'room_closed' }, () => {
      if (!isHost) {
        setIsRoomClosed(true);
      }
    });

    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const currentParticipants: WatchPartyParticipant[] = [];
      const activeOtherUsers = new Map<string, string>();
      let selfPresent = false;

      Object.keys(state).forEach(key => {
        const presenceList = state[key] as any[];
        const activeEntry = presenceList.find(p => p?.status !== 'waiting_metadata');
        if (activeEntry) {
          const uname = activeEntry.username || tSync('common.anonymous');
          currentParticipants.push({
            id: key,
            username: uname,
            avatar_url: activeEntry.avatar_url || '',
            isHost: Boolean(activeEntry.isHost),
          });
          if (key === user.id) {
            selfPresent = true;
          } else {
            activeOtherUsers.set(key, uname);
          }
        }
      });

      setParticipants(currentParticipants);

      if (!hasBaseline) {
        if (selfPresent) {
          activeOtherUsers.forEach((name, id) => knownUsersRef.set(id, name));
          hasBaseline = true;
        }
        return;
      }

      activeOtherUsers.forEach((name, id) => {
        if (!knownUsersRef.has(id)) {
          setChatMessages(prev => [
            ...prev,
            {
              id: `sys-join-${Date.now()}-${Math.random()}`,
              sender: 'System',
              text: tSync('nobar.joinedRoom', { name }),
              isSystem: true,
            },
          ]);
        }
      });

      knownUsersRef.forEach((name, id) => {
        if (!activeOtherUsers.has(id)) {
          setChatMessages(prev => [
            ...prev,
            {
              id: `sys-leave-${Date.now()}-${Math.random()}`,
              sender: 'System',
              text: tSync('nobar.leftRoom', { name }),
              isSystem: true,
            },
          ]);
        }
      });

      knownUsersRef.clear();
      activeOtherUsers.forEach((name, id) => knownUsersRef.set(id, name));
    });

    let disconnectTimeout: ReturnType<typeof setTimeout>;

    roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(disconnectTimeout);
        setConnectionStatus('CONNECTED');
        await roomChannel.track({
          username: selfDisplayName,
          avatar_url: selfAvatarUrl,
          isHost,
          metadata: isHost ? metadataRef.current : undefined,
        });
        if (!isHost) {
          roomChannel.send({
            type: 'broadcast',
            event: 'request_sync',
            payload: { requesterId: user.id },
          });
        }
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
  }, [activeRoomId, user, profile, isHost, selfDisplayName, selfAvatarUrl]);

  // Keep Host presence metadata synced whenever episode/season/stream changes
  useEffect(() => {
    if (!channel || !activeRoomId || !isHost || connectionStatus !== 'CONNECTED') return;
    channel.track({
      username: selfDisplayName,
      avatar_url: selfAvatarUrl,
      isHost: true,
      metadata: metadataRef.current,
    });
  }, [channel, activeRoomId, isHost, connectionStatus, metadataKey, selfDisplayName, selfAvatarUrl]);

  useEffect(() => {
    if (!activeRoomId || isHost || participants.length === 0) return;
    const hostExists = participants.some(p => p.isHost);
    if (!hostExists) {
      const t = setTimeout(() => setIsHostMissing(true), 15000);
      return () => clearTimeout(t);
    } else {
      setIsHostMissing(false);
    }
  }, [participants, isHost, activeRoomId]);

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

  const broadcastChat = useCallback((message: any) => {
    if (!channel) return;

    setChatMessages(prev => [...prev, message]);

    channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: message,
    });
  }, [channel]);

  const broadcastMediaChange = useCallback((newLink: string) => {
    if (!channel || !isHost) return;

    channel.send({
      type: 'broadcast',
      event: 'media_change',
      payload: { link: newLink },
    });
  }, [channel, isHost]);

  const requestSync = useCallback(() => {
    if (!channel || isHost || !user) return;
    channel.send({
      type: 'broadcast',
      event: 'request_sync',
      payload: { requesterId: user.id },
    });
  }, [channel, isHost, user]);

  const closeRoom = useCallback(async () => {
    if (!channel) return;
    if (isHost) {
      try {
        await channel.send({
          type: 'broadcast',
          event: 'room_closed',
          payload: { closedAt: Date.now() },
        });
      } catch {}
    }
    try {
      await channel.unsubscribe();
    } catch {}
  }, [channel, isHost]);

  return {
    participants,
    remoteState,
    broadcastState,
    chatMessages,
    broadcastChat,
    broadcastMediaChange,
    mediaChangeLink,
    isActive: !!activeRoomId,
    connectionStatus,
    isHostMissing,
    isRoomClosed,
    syncRequestCount,
    requestSync,
    closeRoom,
  };
}
