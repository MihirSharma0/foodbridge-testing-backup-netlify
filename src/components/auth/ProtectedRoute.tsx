import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: UserRole;
  profileRequired?: boolean;
}

export const ProtectedRoute = ({ children, requiredRole, profileRequired }: ProtectedRouteProps) => {
  const { isLoggedIn, isEmailVerified, needsProfile, user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // If manual signup, must be verified
  if (!isEmailVerified && !user) {
    // NOTE: Google users are usually auto-verified. 
    // For manual, we check if they have a profile yet.
  }

  if (profileRequired && needsProfile) {
    return <Navigate to="/complete-profile" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
