import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabaseClient';
import { getLevelFromExp, EXP_REWARDS, MAX_LEVEL } from '../utils/LevelSystem';
import { DatabaseManager } from '../utils/DatabaseManager';

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
  const { user, profile } = useAuth();
  const [levelData, setLevelData] = useState<LevelData>(DEFAULT_LEVEL_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const levelDataRef = useRef<LevelData>(DEFAULT_LEVEL_DATA);
  levelDataRef.current = levelData;

  // from overwriting with a lower value
  const highestExpRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const fetchLevel = async () => {
      let localTotalExp = 0;
      try {
        const localExpRaw = await DatabaseManager.get('local_exp');
        localTotalExp = localExpRaw ? parseInt(localExpRaw, 10) : 0;
        if (isNaN(localTotalExp)) localTotalExp = 0;
      } catch {
      }

      highestExpRef.current = Math.max(highestExpRef.current, localTotalExp);

      if (!user) {
        const computed = getLevelFromExp(localTotalExp);
        if (!cancelled) {
          setLevelData({ ...computed, totalExp: localTotalExp });
          setIsLoading(false);
        }
        return;
      }

      try {
        let data: any = null;
        let error: any = null;
        let retries = 3;
        while (retries > 0) {
          const result = await supabase
            .from('profiles')
            .select('total_exp')
            .eq('id', user.id)
            .single();
          data = result.data;
          error = result.error;
          if (!error && data) break;
          retries--;
          if (retries > 0) await new Promise(r => setTimeout(r, 500));
        }

        if (cancelled) return;

        if (error || !data) {
          const computed = getLevelFromExp(localTotalExp);
          setLevelData({ ...computed, totalExp: localTotalExp });
          setIsLoading(false);
          return;
        }

        const remoteTotalExp = data.total_exp ?? 0;

        const bestTotalExp = Math.max(localTotalExp, remoteTotalExp, highestExpRef.current);
        highestExpRef.current = bestTotalExp;

        const computed = getLevelFromExp(bestTotalExp);
        setLevelData({ ...computed, totalExp: bestTotalExp });

        await DatabaseManager.set('local_exp', bestTotalExp.toString());
        if (bestTotalExp > remoteTotalExp) {
          let syncRetries = 3;
          while (syncRetries > 0) {
            const { error: syncErr } = await supabase
              .from('profiles')
              .update({ total_exp: bestTotalExp, level: computed.level })
              .eq('id', user.id);
            if (!syncErr) break;
            syncRetries--;
            if (syncRetries > 0) await new Promise(r => setTimeout(r, 500));
          }
        }
      } catch {
        if (!cancelled) {
          const computed = getLevelFromExp(localTotalExp);
          setLevelData({ ...computed, totalExp: localTotalExp });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchLevel();
    return () => { cancelled = true; };
  }, [user, profile]);

  const syncingPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const addExp = useCallback((amount: number) => {
    if (levelDataRef.current.level >= MAX_LEVEL) return Promise.resolve();

    syncingPromiseRef.current = syncingPromiseRef.current.then(async () => {
      try {
        const localExpRaw = await DatabaseManager.get('local_exp');
        const localExp = localExpRaw ? parseInt(localExpRaw, 10) : levelDataRef.current.totalExp;

        let currentExp = localExp;

        if (user) {
          const { data: profile, error: fetchErr } = await supabase
            .from('profiles')
            .select('total_exp')
            .eq('id', user.id)
            .single();

          if (!fetchErr && profile) {
            currentExp = Math.max(localExp, profile.total_exp ?? 0);
          }
        }

        const newTotalExp = Math.max(currentExp + amount, highestExpRef.current);
        highestExpRef.current = newTotalExp;
        const computed = getLevelFromExp(newTotalExp);

        setLevelData({ ...computed, totalExp: newTotalExp });

        await DatabaseManager.set('local_exp', newTotalExp.toString());

        if (user) {
          const updatePayload = { id: user.id, total_exp: newTotalExp, level: computed.level } as any;
          let retries = 3;
          while (retries > 0) {
            const { error: updateErr } = await supabase
              .from('profiles')
              .update({ total_exp: newTotalExp, level: computed.level })
              .eq('id', user.id);
            if (!updateErr) break;
            retries--;
            if (retries > 0) {
              await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
            } else {
              console.warn('Failed to sync EXP to Supabase after 3 attempts:', updateErr.message);
            }
          }
        }
      } catch (e) {
        console.warn('addExp error:', e);
      }
    });

    return syncingPromiseRef.current;
  }, [user]);

  return (
    <LevelContext value={{ levelData, addExp, isLoading }}>
      {children}
    </LevelContext>
  );
}

export function useLevel(): LevelContextType {
  return useContext(LevelContext);
}

export default LevelContext;
