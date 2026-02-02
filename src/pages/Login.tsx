import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Eye, EyeOff, AlertCircle, Store, HandHeart, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { auth } from '@/lib/firebase';

const Login = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, loginWithGoogle, signUp, isLoggedIn, user, needsProfile, isLoading: authLoading } = useAuth();

  const modeParam = searchParams.get('mode') as 'login' | 'signup' || 'login';
  const roleParam = searchParams.get('role') as UserRole || 'donor';

  const [mode, setMode] = useState<'login' | 'signup'>(modeParam);
  const [role, setRole] = useState<UserRole>(roleParam);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Redirect if already logged in and profile is complete
  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      if (needsProfile) {
        navigate(`/complete-profile?role=${role}`);
      } else if (user) {
        navigate(user.role === 'donor' ? '/donor/dashboard' : '/ngo/dashboard');
      }
    }
  }, [isLoggedIn, user, needsProfile, authLoading, navigate, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowSignupPrompt(false);
    setIsLoading(true);

    if (mode === 'login') {
      const result = await login(email, password);
      if (result.success) {
        // Auth state listener handles redirect
      } else {
        if (result.unverified) {
          setError('Please verify your email. Check your inbox for the link.');
        } else {
          setError(result.error || 'Login failed');
          if (result.error === 'Account does not exist') {
            setShowSignupPrompt(true);
          }
        }
      }
    } else {
      const result = await signUp(email, password, role);
      if (result.success) {
        setVerificationSent(true);
        setMode('login');
        setError('');
      } else {
        setError(result.error || 'Signup failed');
      }
    }

    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    const result = await loginWithGoogle(role);

    if (result.success) {
      if (result.needsProfile) {
        navigate(`/complete-profile?role=${role}`);
      }
    } else {
      setError(result.error || 'Google login failed');
    }
    setIsLoading(false);
  };

  const switchMode = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError('');
    setShowSignupPrompt(false);
    navigate(`/login?mode=${newMode}&role=${role}`, { replace: true });
  };

  const switchRole = (newRole: UserRole) => {
    setRole(newRole);
    setError('');
    navigate(`/login?mode=${mode}&role=${newRole}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%] w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 right-[10%] w-64 h-64 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass rounded-3xl p-8 shadow-xl">
          <div className="flex justify-center mb-6">
            <button onClick={() => navigate('/')} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Leaf className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl text-foreground">FoodBridge</span>
            </button>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === 'login' ? 'Sign in to your account' : 'Join our community to help bridge the gap'}
            </p>
          </div>

          <div className="flex rounded-2xl bg-muted p-1 mb-8">
            <button
              onClick={() => switchRole('donor')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${role === 'donor' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <Store className="w-4 h-4" />
              <span>Donor</span>
            </button>
            <button
              onClick={() => switchRole('ngo')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${role === 'ngo' ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <HandHeart className="w-4 h-4" />
              <span>NGO</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {verificationSent && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-green-600 dark:text-green-400 text-sm flex items-center gap-2 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                  <Mail className="w-4 h-4" />
                  <span>A verification link has been sent to {email}. Please verify your email before signing in.</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </Button>

            {showSignupPrompt && (
              <Button variant="outline" className="w-full" onClick={() => switchMode('signup')}>
                Don't have an account? Create one
              </Button>
            )}
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or continue with</span></div>
          </div>

          <Button variant="outline" className="w-full space-x-2" onClick={handleGoogleLogin} disabled={isLoading}>
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>Continue with Google</span>
          </Button>

          <div className="mt-6 text-center text-sm">
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-primary hover:underline"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
