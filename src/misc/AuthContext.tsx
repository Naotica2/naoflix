import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { initPresence, clearActivity } from '../utils/presenceSystem';
import { clearDmInboxCache } from '../utils/dmCache';
import { invalidateFollowCountsCache } from '../utils/followSystem';
import { invalidateWatchHistoryGridCache } from '../utils/watchHistorySync';

export interface UserProfile {
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  bio: string;
  banner_url: string | null;
  total_exp: number;
  level: number;
}

type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  hasProfile: boolean;
  confirmedNoProfile: boolean;
  profileStatus: ProfileStatus;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  hasProfile: false,
  confirmedNoProfile: false,
  profileStatus: 'idle',
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<'loaded' | 'error'> => {
    setProfileStatus('loading');
    try {
      const fetchPromise = supabase
        .from('profiles')
        .select('username, avatar_url, display_name, bio, banner_url, total_exp, level')
        .eq('id', userId)
        .single();
        
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000);
      });

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) {
        if (error.code === 'PGRST116') {
          setProfile(null);
          setProfileStatus('loaded');
          return 'loaded';
        }
        console.warn('Profile fetch error:', error.message);
        setProfileStatus('error');
        return 'error';
      }

      if (!data) {
        setProfile(null);
        setProfileStatus('loaded');
        return 'loaded';
      }

      setProfile(data);
      setProfileStatus('loaded');
      retryCountRef.current = 0;
      return 'loaded';
    } catch (e) {
      console.warn('Profile fetch exception:', e);
      setProfileStatus('error');
      return 'error';
    }
  }, []);

  const scheduleRetry = useCallback((userId: string) => {
    if (retryCountRef.current >= 5) {
      console.warn('Max profile fetch retries reached');
      return;
    }
    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30_000);
    retryCountRef.current += 1;
    retryTimerRef.current = setTimeout(async () => {
      const result = await fetchProfile(userId);
      if (result === 'error') {
        scheduleRetry(userId);
      }
    }, delay);
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const result = await fetchProfile(user.id);
      if (result === 'error') {
        scheduleRetry(user.id);
      }
    }
  }, [user, fetchProfile, scheduleRetry]);

  useEffect(() => {
    let isMounted = true;

    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('Supabase Auth Initialization Timeout - Forcing app unlock');
        setIsLoading(false);
      }
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const result = await fetchProfile(session.user.id);
        initPresence(session.user.id);
        if (isMounted) {
          clearTimeout(safetyTimeout);
          setIsLoading(false);
          if (result === 'error') {
            scheduleRetry(session.user.id);
          }
        }
      } else {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    }).catch(err => {
      console.warn('Session get error:', err);
      if (isMounted) {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        const result = await fetchProfile(newSession.user.id);
        initPresence(newSession.user.id);
        if (result === 'error') {
          scheduleRetry(newSession.user.id);
        }
      } else {
        setProfile(null);
        setProfileStatus('idle');
      }
    });

    return () => {
      isMounted = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      subscription.unsubscribe();
    };
  }, [fetchProfile, scheduleRetry]);

  const signOut = useCallback(async () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    await clearActivity();
    await supabase.auth.signOut();
    clearDmInboxCache();
    invalidateFollowCountsCache();
    invalidateWatchHistoryGridCache();
    setProfile(null);
    setProfileStatus('idle');
  }, []);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      profile,
      isLoading,
      hasProfile: profileStatus === 'loaded' && profile !== null,
      confirmedNoProfile: profileStatus === 'loaded' && profile === null,
      profileStatus,
      signOut,
      refreshProfile,
    }),
    [user, session, profile, isLoading, profileStatus, signOut, refreshProfile],
  );

  return <AuthContext value={contextValue}>{children}</AuthContext>;
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export default AuthContext;
