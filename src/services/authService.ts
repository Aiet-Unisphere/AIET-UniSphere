import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database.types';
import type { Session, User as SupabaseUser, AuthChangeEvent } from '@supabase/supabase-js';

export interface SignUpData {
  fullName: string;
  usn: string;
  email: string;
  password: string;
}

export const authService = {
  /**
   * Sign in with email/USN/employee ID and password
   */
  async signIn(identifier: string, password: string): Promise<{ session: Session | null; profile: Profile | null }> {
    const normalizedIdentifier = identifier.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let session: Session | null = null;

    if (emailRegex.test(normalizedIdentifier)) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedIdentifier,
        password,
      });
      if (error) throw new Error(error.message || 'Invalid credentials.');
      session = data.session;
    } else {
      const { data, error } = await supabase.functions.invoke('identifier-login', {
        body: { identifier: normalizedIdentifier, password },
      });
      if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
        throw new Error(data?.error || error?.message || 'Invalid credentials or account unavailable.');
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw new Error('Authentication failed.');
      session = sessionData.session;
    }

    if (!session?.user) throw new Error('Authentication failed.');

    // Fetch user profile STRICTLY using the authenticated Supabase user's UUID (data.user.id)
    const profile = await this.getCurrentProfile(session.user.id);

    if (!profile || profile.account_status !== 'ACTIVE') {
      await this.signOut();
      throw new Error('Your account is unavailable. Please contact the administrator.');
    }

    return { session, profile };
  },

  /**
   * Public Student Sign Up (Safely defaults to STUDENT role)
   */
  async signUp(data: SignUpData): Promise<{ user: SupabaseUser | null; session: Session | null }> {
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          usn_or_employee_id: data.usn,
          role: 'STUDENT', // Public signup strictly restricted to STUDENT
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Sign up failed.');
    }

    return { user: authData.user, session: authData.session };
  },

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  /**
   * Get active Supabase session
   */
  async getCurrentSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<SupabaseUser | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user;
  },

  /**
   * Fetch current user's profile strictly by user UUID from public.profiles
   */
  async getCurrentProfile(userId?: string): Promise<Profile | null> {
    let targetUid = userId;
    if (!targetUid) {
      const user = await this.getCurrentUser();
      if (!user) return null;
      targetUid = user.id;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .eq('id', targetUid)
      .single();

    if (error || !data) {
      // Fallback query if FK relationship cache is refreshing
      const { data: rawProfile, error: rawError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUid)
        .single();
      
      if (rawError || !rawProfile) return null;
      return rawProfile as Profile;
    }

    return data as unknown as Profile;
  },

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/student`,
    });
    if (error) {
      throw new Error(error.message || 'Password reset request failed.');
    }
  },

  /**
   * Listen to auth state changes (SIGNED_IN, SIGNED_OUT, etc.)
   */
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return data.subscription;
  },
};
