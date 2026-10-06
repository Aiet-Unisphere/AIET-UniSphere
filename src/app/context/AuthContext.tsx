import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile, UserRole } from '../../types/database.types';
import { authService } from '../../services/authService';
import type { SignUpData } from '../../services/authService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: typeof authService.signIn;
  signUp: typeof authService.signUp;
  signOut: () => Promise<void>;
  resetPassword: typeof authService.resetPassword;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAndSetProfile = async (uid: string) => {
    try {
      const userProfile = await authService.getCurrentProfile(uid);
      if (userProfile?.account_status === 'ACTIVE') {
        setProfile(userProfile);
        setRole(userProfile.role);
        return userProfile;
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
    setProfile(null);
    setRole(null);
    await authService.signOut();
    return null;
  };

  useEffect(() => {
    // Initial session check
    authService.getCurrentSession().then(async (currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        setUser(currentSession.user);
        await fetchAndSetProfile(currentSession.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      setIsLoading(false);
    });

    // Listen for auth state changes
    const subscription = authService.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        setUser(currentSession.user);
        await fetchAndSetProfile(currentSession.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await authService.signIn(identifier, password);
      if (result.session?.user) {
        setSession(result.session);
        setUser(result.session.user);
        setProfile(result.profile);
        setRole(result.profile?.role || null);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    await authService.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setIsLoading(false);
  };

  const refreshProfile = async () => {
    if (user) {
      return await fetchAndSetProfile(user.id);
    }
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isLoading,
        signIn: handleSignIn,
        signUp: authService.signUp.bind(authService),
        signOut,
        resetPassword: authService.resetPassword.bind(authService),
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
