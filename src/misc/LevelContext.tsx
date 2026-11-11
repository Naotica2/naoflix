import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabaseClient';
import { getLevelFromExp, MAX_LEVEL } from '../utils/LevelSystem';
import { DatabaseManager } from '../utils/DatabaseManager';

const REMOTE_EXP_DEBOUNCE_MS = 4000;

interface LevelData {
  level: number;
  currentExp: number;
  expNeeded: number;
  progress: number;
  totalExp: number;
}

interface LevelContextType {
  levelData: LevelData;
  addExp: (amount: number) => Promise<void>;
  isLoading: boolean;
}

const DEFAULT_LEVEL_DATA: LevelData = {
  level: 1,
  currentExp: 0,
  expNeeded: 120,
  progress: 0,
  totalExp: 0,
};

const LevelContext = createContext<LevelContextType>({
  levelData: DEFAULT_LEVEL_DATA,
  addExp: async () => {},
  isLoading: true,
});

export function LevelProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, profileStatus } = useAuth();
  const [levelData, setLevelData] = useState<LevelData>(DEFAULT_LEVEL_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const levelDataRef = useRef<LevelData>(DEFAULT_LEVEL_DATA);
  useEffect(() => {
    levelDataRef.current = levelData;
  }, [levelData]);

  // Prevent lower stale values from overwriting locally or remotely
  const highestExpRef = useRef<number>(0);
  const lastRemoteSyncedExpRef = useRef<number>(0);
  const userIdRef = useRef<string | null>(null);
  const remoteFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExpRef = useRef<{ totalExp: number; level: number } | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  const flushRemoteExp = useCallback(async () => {
    if (remoteFlushTimerRef.current) {
      clearTimeout(remoteFlushTimerRef.current);
      remoteFlushTimerRef.current = null;
    }

    const uid = userIdRef.current;
    const pending = pendingExpRef.current;
    if (!uid || !pending) return;
    if (pending.totalExp <= lastRemoteSyncedExpRef.current) {
      pendingExpRef.current = null;
      return;
    }

    pendingExpRef.current = null;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ total_exp: pending.totalExp, level: pending.level })
        .eq('id', uid);
      if (!error) {
        lastRemoteSyncedExpRef.current = Math.max(
          lastRemoteSyncedExpRef.current,
          pending.totalExp,
        );
      } else {
        // Retain pending payload if another sync isn't already newer
        if (!pendingExpRef.current) {
          pendingExpRef.current = pending;
        }
        console.warn('Failed to sync EXP to Supabase:', error.message);
      }
    } catch (err) {
      if (!pendingExpRef.current) {
        pendingExpRef.current = pending;
      }
      console.warn('flushRemoteExp exception:', err);
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        flushRemoteExp();
      }
    });
    return () => {
      subscription.remove();
      flushRemoteExp();
    };
  }, [flushRemoteExp]);

  useEffect(() => {
    let cancelled = false;
    const syncLevelFromState = async () => {
      let localTotalExp = 0;
      try {
        const localExpRaw = await DatabaseManager.get('local_exp');
        localTotalExp = localExpRaw ? parseInt(localExpRaw, 10) : 0;
        if (isNaN(localTotalExp)) localTotalExp = 0;
      } catch {}

      if (cancelled) return;

      highestExpRef.current = Math.max(highestExpRef.current, localTotalExp);

      if (!user) {
        if (remoteFlushTimerRef.current) {
          clearTimeout(remoteFlushTimerRef.current);
          remoteFlushTimerRef.current = null;
        }
        pendingExpRef.current = null;
        lastRemoteSyncedExpRef.current = 0;

        const computed = getLevelFromExp(localTotalExp);
        setLevelData({ ...computed, totalExp: localTotalExp });
        setIsLoading(false);
        return;
      }

      // Reuse profile already fetched by AuthContext instead of querying profiles redundantly
      if (profile) {
        const remoteTotalExp = profile.total_exp ?? 0;
        lastRemoteSyncedExpRef.current = Math.max(lastRemoteSyncedExpRef.current, remoteTotalExp);

        const bestTotalExp = Math.max(localTotalExp, remoteTotalExp, highestExpRef.current);
        highestExpRef.current = bestTotalExp;

        const computed = getLevelFromExp(bestTotalExp);
        setLevelData({ ...computed, totalExp: bestTotalExp });
        setIsLoading(false);

        if (bestTotalExp !== localTotalExp) {
          await DatabaseManager.set('local_exp', bestTotalExp.toString());
        }
        if (bestTotalExp > lastRemoteSyncedExpRef.current) {
          pendingExpRef.current = { totalExp: bestTotalExp, level: computed.level };
          if (remoteFlushTimerRef.current) clearTimeout(remoteFlushTimerRef.current);
          remoteFlushTimerRef.current = setTimeout(() => {
            flushRemoteExp();
          }, 1500);
        }
        return;
      }

      // While AuthContext is still fetching profile, show local EXP immediately without extra query
      if (profileStatus === 'loading' || profileStatus === 'idle') {
        const computed = getLevelFromExp(highestExpRef.current);
        setLevelData({ ...computed, totalExp: highestExpRef.current });
        return;
      }

      // Loaded with null profile or error: settle using local EXP
      const computed = getLevelFromExp(highestExpRef.current);
      setLevelData({ ...computed, totalExp: highestExpRef.current });
      setIsLoading(false);
    };

    syncLevelFromState();
    return () => {
      cancelled = true;
    };
  }, [user, profile, profileStatus, flushRemoteExp]);

  const syncingPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const addExp = useCallback(
    (amount: number) => {
      if (levelDataRef.current.level >= MAX_LEVEL) return Promise.resolve();

      syncingPromiseRef.current = syncingPromiseRef.current.then(async () => {
        try {
          const localExpRaw = await DatabaseManager.get('local_exp');
          const localExp = localExpRaw ? parseInt(localExpRaw, 10) : levelDataRef.current.totalExp;
          const safeLocal = Number.isFinite(localExp) ? localExp : levelDataRef.current.totalExp;

          const baseExp = Math.max(
            safeLocal,
            lastRemoteSyncedExpRef.current,
            highestExpRef.current,
          );
          const newTotalExp = baseExp + amount;
          highestExpRef.current = newTotalExp;

          const computed = getLevelFromExp(newTotalExp);
          setLevelData({ ...computed, totalExp: newTotalExp });

          await DatabaseManager.set('local_exp', newTotalExp.toString());

          if (user && newTotalExp > lastRemoteSyncedExpRef.current) {
            pendingExpRef.current = { totalExp: newTotalExp, level: computed.level };
            if (remoteFlushTimerRef.current) clearTimeout(remoteFlushTimerRef.current);
            remoteFlushTimerRef.current = setTimeout(() => {
              flushRemoteExp();
            }, REMOTE_EXP_DEBOUNCE_MS);
          }
        } catch (e) {
          console.warn('addExp error:', e);
        }
      });

      return syncingPromiseRef.current;
    },
    [user, flushRemoteExp],
  );

  const contextValue = useMemo<LevelContextType>(
    () => ({ levelData, addExp, isLoading }),
    [levelData, addExp, isLoading],
  );

  return <LevelContext value={contextValue}>{children}</LevelContext>;
}

export function useLevel(): LevelContextType {
  return useContext(LevelContext);
}

export default LevelContext;
