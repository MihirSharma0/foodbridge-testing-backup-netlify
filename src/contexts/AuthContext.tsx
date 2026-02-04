import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
  customPassword?: string; // Used for password recovery via security questions
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  needsProfile: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; unverified?: boolean }>;
  loginWithGoogle: (role?: UserRole) => Promise<{ success: boolean; error?: string; needsProfile?: boolean }>;
  signUp: (email: string, password: string, role: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  createProfile: (profileData: Omit<User, 'id' | 'email' | 'username'>) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getSecurityQuestion: (emailOrUsername: string) => Promise<{ success: boolean; question?: string; error?: string }>;
  verifySecurityAnswer: (emailOrUsername: string, answer: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordWithSecurityQuestion: (emailOrUsername: string, answer: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
        setNeedsProfile(false);
        setIsLoading(false);
        return;
      }

      if (firebaseUser) {
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
        setNeedsProfile(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    let email = emailOrUsername;

    // Check if it's a username (no '@' symbol)
    if (!emailOrUsername.includes('@')) {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', emailOrUsername));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data() as User;
          email = userData.email;
        } else {
          // Allow hardcoded demo accounts to pass through even if not in Firestore
          const isDemoAccount = ['donor1', 'donor2', 'ngo1', 'ngo2'].includes(emailOrUsername);
          if (!isDemoAccount) {
            return { success: false, error: 'Account does not exist. Please create an account.' };
          }
        }
      } catch (error) {
        console.error('Error looking up username:', error);
        return { success: false, error: 'Login failed during user lookup' };
      }
    }

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
      setNeedsProfile(false);
      return { success: true };
    }

    // Check Firestore for custom password (from security question reset)
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data() as User;
        if (userData.customPassword && userData.customPassword === password) {
          console.log('Login successful via custom password');
          const mockUser = { ...userData, id: querySnapshot.docs[0].id };
          sessionStorage.setItem('manual_user', JSON.stringify(mockUser));
          setUser(mockUser);
          setNeedsProfile(false);
          return { success: true };
        }
      }
    } catch (error) {
      console.error('Custom password check error:', error);
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      const authError = error as { code?: string };
      let message = 'Login failed';

      if (authError.code === 'auth/invalid-credential' ||
        authError.code === 'auth/user-not-found' ||
        authError.code === 'auth/wrong-password') {

        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            message = 'Incorrect password';
          } else {
            message = 'Account does not exist. Please create an account.';
          }
        } catch (dbError) {
          console.error('Error checking user existence:', dbError);
          message = 'Invalid email or password';
        }
      } else if (authError.code === 'auth/too-many-requests') {
        message = 'Too many failed attempts. Please try again later or reset your password.';
      }

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
        return { success: true, needsProfile: true };
      }

      setNeedsProfile(false);
      return { success: true, needsProfile: false };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, [fetchUserProfile]);

  const signUp = useCallback(async (email: string, password: string, _role: UserRole) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
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

  const deleteAccount = useCallback(async () => {
    if (!auth.currentUser) return { success: false, error: 'User not authenticated' };
    const uid = auth.currentUser.uid;
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(userRef);
      }

      const { deleteUser } = await import('firebase/auth');
      await deleteUser(auth.currentUser);

      sessionStorage.removeItem('manual_user');
      setUser(null);

      return { success: true };
    } catch (error) {
      console.error('Error deleting account:', error);
      const authError = error as { code?: string };
      if (authError.code === 'auth/requires-recent-login') {
        return { success: false, error: 'Please log out and log back in to delete your account for security reasons.' };
      }
      return { success: false, error: (error as Error).message || 'Failed to delete account' };
    }
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!auth.currentUser || !auth.currentUser.email) return { success: false, error: 'User not authenticated' };

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      const authError = error as { code?: string };
      let message = (error as Error).message;
      if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password') {
        message = 'Incorrect current password';
      }
      return { success: false, error: message };
    }
  }, []);

  const getSecurityQuestion = useCallback(async (emailOrUsername: string) => {
    try {
      // Find user by email or username
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('email', '==', emailOrUsername));
      let querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        q = query(usersRef, where('username', '==', emailOrUsername));
        querySnapshot = await getDocs(q);
      }

      if (querySnapshot.empty) {
        return { success: false, error: 'User not found' };
      }

      const userData = querySnapshot.docs[0].data() as User;
      if (!userData.securityQuestion?.question) {
        return { success: false, error: 'No security question set for this account' };
      }

      return { success: true, question: userData.securityQuestion.question };
    } catch (error) {
      console.error('Get security question error:', error);
      return { success: false, error: 'Failed to fetch security question' };
    }
  }, []);

  const verifySecurityAnswer = useCallback(async (emailOrUsername: string, answer: string) => {
    try {
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('email', '==', emailOrUsername));
      let querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        q = query(usersRef, where('username', '==', emailOrUsername));
        querySnapshot = await getDocs(q);
      }

      if (querySnapshot.empty) {
        return { success: false, error: 'User not found' };
      }

      const userData = querySnapshot.docs[0].data() as User;

      if (!userData.securityQuestion) {
        return { success: false, error: 'No security question set for this account' };
      }

      if (userData.securityQuestion.answer.toLowerCase().trim() !== answer.toLowerCase().trim()) {
        return { success: false, error: 'Incorrect answer' };
      }

      return { success: true };
    } catch (error) {
      console.error('Verify security answer error:', error);
      return { success: false, error: 'Verification failed' };
    }
  }, []);

  const resetPasswordWithSecurityQuestion = useCallback(async (emailOrUsername: string, answer: string, newPassword: string) => {
    try {
      // Find user by email or username
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('email', '==', emailOrUsername));
      let querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        q = query(usersRef, where('username', '==', emailOrUsername));
        querySnapshot = await getDocs(q);
      }

      if (querySnapshot.empty) {
        return { success: false, error: 'User not found' };
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;

      if (!userData.securityQuestion) {
        return { success: false, error: 'No security question set for this account' };
      }

      // Case-insensitive answer check
      if (userData.securityQuestion.answer.toLowerCase().trim() !== answer.toLowerCase().trim()) {
        return { success: false, error: 'Incorrect answer' };
      }

      // Update the custom password in Firestore for demo purposes
      const userRef = doc(db, 'users', userDoc.id);
      await updateDoc(userRef, {
        customPassword: newPassword
      });

      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!auth.currentUser || !!user,
      needsProfile,
      isLoading,
      login,
      loginWithGoogle,
      signUp,
      logout,
      updateUser,
      createProfile,
      deleteAccount,
      changePassword,
      getSecurityQuestion,
      verifySecurityAnswer,
      resetPasswordWithSecurityQuestion
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

