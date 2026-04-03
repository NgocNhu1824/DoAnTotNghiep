import React, { useState, useEffect } from 'react';
import { Building2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { authService } from '../services/auth.service';
import { Campus } from '../types/auth.types';
import Loading from '../components/common/Loading';
import { useAuth } from '../context/AuthContext';
import { getDefaultDashboard } from '../constants/roles';
import { toast } from 'react-toastify';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  useEffect(() => {
    fetchCampuses();
  }, []);

  const fetchCampuses = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await authService.getAllCampuses();

      if (Array.isArray(data)) {
        setCampuses(data);
        if (data.length > 0) {
          setSelectedCampus(data[0]._id);
        }
      } else {
        console.error('Invalid campuses data:', data);
        setCampuses([]);
        setError('Invalid campus data. Please check the backend.');
      }
    } catch (err: any) {
      console.error('Error fetching campuses:', err);
      setCampuses([]);
      setError(err?.message || 'Unable to load campus list. Please check whether the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!selectedCampus) {
      setError('Please select a campus before signing in');
      return;
    }
    authService.loginWithGoogle(selectedCampus);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setIsPasswordSubmitting(true);
      setError('');

      const result = await authService.loginWithEmailPassword({
        email: email.trim(),
        password,
      });

      login(
        result.accessToken,
        result.user,
        result.roleDetails,
        result.permissions || [],
        Boolean(result.hasPassword ?? true),
      );

      const defaultRoute = getDefaultDashboard(
        result.roleDetails?.roleName || 'unknown',
        result.roleDetails?.scope,
        result.roleDetails?.roleCode,
      );
      navigate(defaultRoute, { replace: true });
    } catch (err: any) {
      const rawMessage = err?.message;
      const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
      const resolvedMessage = String(message || 'Unable to sign in with email and password.');
      const normalizedMessage = resolvedMessage.trim().toLowerCase();
      const isInvalidCredential =
        normalizedMessage.includes('invalid email or password') ||
        normalizedMessage.includes('invalid credential') ||
        normalizedMessage.includes('incorrect email or password');
      const isUserNotRegisPassword = normalizedMessage.includes('this account has not set a password yet. please sign in with google first.');

      if (isInvalidCredential) {
        toast.error('Wrong email or password. Please try again.');
        setError('');
      } else if (isUserNotRegisPassword) {
        toast.error('This account has not set a password yet. Please sign in with Google first.');
        setError('');
      } else {
        setError(resolvedMessage);
      }
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    try {
      setIsResetSubmitting(true);
      setError('');
      await authService.forgotPassword(resetEmail.trim());
      setResetSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to process password reset request.');
    } finally {
      setIsResetSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0066cc] to-[#ff6b00] flex items-center justify-center p-4">
        <Loading />
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0066cc] to-[#ff6b00] flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-[#ff6b00] p-4 rounded-2xl">
                <Building2 className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
            <p className="text-gray-600">Enter your email to receive password reset instructions</p>
          </div>

          {resetSuccess && (
            <Alert className="mb-6 bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Password reset instructions have been sent to your email.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleForgotPassword} className="space-y-6">
            <div>
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="your.email@fpt.edu.vn"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="mt-2 border-gray-300"
              />
            </div>

            <Button
              type="submit"
              disabled={isResetSubmitting}
              className="w-full bg-[#ff6b00] hover:bg-[#e56000]"
            >
              {isResetSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowForgotPassword(false);
                setError('');
                setResetEmail('');
                setResetSuccess(false);
              }}
            >
              Back to sign in
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0066cc] to-[#ff6b00] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-[#ff6b00] p-4 rounded-2xl">
              <Building2 className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">IoT Classroom Management</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="space-y-6" onSubmit={handlePasswordLogin}>
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="your.email@fpt.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 border-gray-300"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 border-gray-300"
            />
          </div>

          <Button
            type="submit"
            disabled={isPasswordSubmitting}
            className="w-full bg-[#0066cc] hover:bg-[#005bb8]"
          >
            {isPasswordSubmitting ? 'Signing in...' : 'Sign in with Email'}
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">or continue with Google</span>
            </div>
          </div>

          <div>
            <Label htmlFor="campus">Select Campus</Label>
            <div className="relative mt-2">
              <select
                id="campus"
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="block w-full px-4 py-3 pr-10 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff6b00] focus:border-transparent bg-white shadow-sm transition-all appearance-none"
              >
                <option value="">-- Select campus --</option>
                {Array.isArray(campuses) &&
                  campuses.map((campus) => (
                    <option key={campus._id} value={campus._id}>
                      {campus.campusName} ({campus.campusCode})
                    </option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Please select a campus before signing in
            </p>
          </div>

          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={!selectedCampus}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-300 shadow-md hover:shadow-lg transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-[#0066cc]"
            onClick={() => {
              setShowForgotPassword(true);
              setError('');
              setResetSuccess(false);
            }}
          >
            Forgot password?
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Need help?</span>
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              Contact the <span className="font-medium">Training Department</span> for account support
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-[#0066cc]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a href="mailto:training@fpt.edu.vn" className="hover:underline">
                training@fpt.edu.vn
              </a>
            </div>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>© 2024 FPT University</p>
          <p className="mt-1">Powered by IoT & Smart Technologies</p>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
