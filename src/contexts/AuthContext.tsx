import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type UserRole = 'donor' | 'ngo';

export interface User {
  id: string;
  username: string; // Used as display ID or legacy handle
  role: UserRole;
  displayName: string;
  email: string;
  phoneNumber?: string;
  companyName?: string;
  securityQuestion?: {
    question: string;
    answer: string;
  };
  profilePic?: string;
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isEmailVerified: boolean;
  needsProfile: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; unverified?: boolean }>;
  loginWithGoogle: (role?: UserRole) => Promise<{ success: boolean; error?: string; needsProfile?: boolean }>;
  signUp: (email: string, password: string, role: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  createProfile: (profileData: Omit<User, 'id' | 'email' | 'username'>) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  // Helper to fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as User;
      }
      return null;
    } catch (error) {
      console.error('Firestore fetch error:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);

      // Check for manual hardcoded session first
      const manualUser = sessionStorage.getItem('manual_user');
      if (manualUser) {
        const profile = JSON.parse(manualUser) as User;
        setUser(profile);
        setIsEmailVerified(true);
        setNeedsProfile(false);
        setIsLoading(false);
        return;
      }

      if (firebaseUser) {
        setIsEmailVerified(firebaseUser.emailVerified);

        const profile = await fetchUserProfile(firebaseUser.uid);
        if (profile) {
          setUser({ ...profile, id: firebaseUser.uid });
          setNeedsProfile(false);
        } else {
          setUser(null);
          setNeedsProfile(true);
        }
      } else {
        setUser(null);
        setIsEmailVerified(false);
        setNeedsProfile(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const login = useCallback(async (email: string, password: string) => {
    // Hardcoded test logins - Truly manual bypass
    if ((email === 'donor1' || email === 'donor2') && password === 'donor123') {
      const mockUser: User = {
        id: `manual-donor-${email === 'donor1' ? '1' : '2'}`,
        email: `${email}@test.com`,
        username: email,
        role: 'donor',
        displayName: `Donor Test User ${email === 'donor1' ? '1' : '2'}`,
        companyName: 'Test Restaurant',
        phoneNumber: '+1234567890'
      };
      sessionStorage.setItem('manual_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsEmailVerified(true);
      setNeedsProfile(false);
      return { success: true };
    }

    if ((email === 'ngo1' || email === 'ngo2') && password === 'ngo123') {
      const mockUser: User = {
        id: `manual-ngo-${email === 'ngo1' ? '1' : '2'}`,
        email: `${email}@test.com`,
        username: email,
        role: 'ngo',
        displayName: `NGO Test User ${email === 'ngo1' ? '1' : '2'}`,
        companyName: 'Test NGO',
        phoneNumber: '+1234567890'
      };
      sessionStorage.setItem('manual_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsEmailVerified(true);
      setNeedsProfile(false);
      return { success: true };
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (!result.user.emailVerified) {
        return { success: false, unverified: true, error: 'Please verify your email before logging in.' };
      }
      return { success: true };
    } catch (error) {
      const authError = error as { code?: string };
      let message = 'Login failed';
      if (authError.code === 'auth/user-not-found') message = 'Account does not exist';
      if (authError.code === 'auth/wrong-password') message = 'Incorrect password';
      return { success: false, error: message };
    }
  }, []);

  const loginWithGoogle = useCallback(async (selectedRole?: UserRole) => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const profile = await fetchUserProfile(result.user.uid);

      if (!profile) {
        setNeedsProfile(true);
        // If a role was selected during the login attempt, we could potentially store it 
        // but for now, we'll let the user confirm it on the Complete Profile page 
        // OR we can pass it via state/URL if needed.
        return { success: true, needsProfile: true };
      }

      setNeedsProfile(false);
      return { success: true, needsProfile: false };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, [fetchUserProfile]);

  const signUp = useCallback(async (email: string, password: string, role: UserRole) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);

      // We can't set the profile yet because they aren't verified, 
      // but we need to know their role later. 
      // For now, let's just sign them out as planned.
      await signOut(auth);
      return { success: true };
    } catch (error) {
      const authError = error as { code?: string; message?: string };
      let message = authError.message;
      if (authError.code === 'auth/email-already-in-use') message = 'Email already in use';
      return { success: false, error: message };
    }
  }, []);

  const createProfile = useCallback(async (profileData: Omit<User, 'id' | 'email' | 'username'>) => {
    if (!auth.currentUser) return { success: false, error: 'User not authenticated' };
    try {
      const fullUser: User = {
        ...profileData,
        id: auth.currentUser.uid,
        email: auth.currentUser.email!,
        username: auth.currentUser.email!.split('@')[0]
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid), fullUser);
      setUser(fullUser);
      setNeedsProfile(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    sessionStorage.removeItem('manual_user');
    setUser(null);
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    try {
      const updatedUser = { ...user, ...updates };
      await setDoc(doc(db, 'users', user.id), updatedUser, { merge: true });
      setUser(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!auth.currentUser || !!user,
      isEmailVerified,
      needsProfile,
      isLoading,
      login,
      loginWithGoogle,
      signUp,
      logout,
      updateUser,
      createProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
