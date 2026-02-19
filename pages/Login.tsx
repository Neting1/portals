import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, ArrowLeft, CheckCircle, Mail, AlertCircle, Sun, Moon } from 'lucide-react';
import { auth, googleProvider, db } from '../utils/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithPopup,
  signOut
} from 'firebase/auth';

interface LoginProps {
  onLogin: (user: User) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

// Reusable Input Component for consistent styling and validation
const InputField = ({ 
  label, 
  icon: Icon, 
  type, 
  placeholder, 
  value, 
  onChange, 
  onBlur, 
  error, 
  disabled 
}: any) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
      {label}
    </label>
    <div className="relative group">
      <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${error ? 'text-red-500' : 'text-slate-400 dark:text-slate-500 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400'}`}>
        <Icon size={20} fill="currentColor" strokeWidth={0} />
      </div>
      <input
        type={type}
        placeholder={placeholder}
        className={`w-full pl-12 pr-10 py-3.5 border rounded-xl outline-none transition-all duration-200 font-medium
          ${error 
            ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 placeholder:text-red-300 dark:placeholder:text-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-4 focus:ring-red-500/10' 
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300 dark:hover:border-slate-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
      />
      {error && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none animate-in fade-in zoom-in duration-200">
           <AlertCircle size={18} className="text-red-500" />
        </div>
      )}
    </div>
    {error && (
      <p className="text-red-600 dark:text-red-400 text-xs font-semibold ml-1 animate-in slide-in-from-top-1 duration-200 flex items-center gap-1">
        {error}
      </p>
    )}
  </div>
);

const Login: React.FC<LoginProps> = ({ onLogin, isDarkMode, toggleTheme }) => {
  const [view, setView] = useState<'login' | 'forgot_password' | 'signup' | 'verify_email'>('login');
  
  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  
  // Validation State
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // Global UI States
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Validators
  const validateEmail = (val: string) => {
    if (!val) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Please enter a valid email address';
    return '';
  };

  const validatePassword = (val: string) => {
    if (!val) return 'Password is required';
    if (view === 'signup' && val.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const validateName = (val: string) => {
    if (!val.trim()) return 'Full name is required';
    return '';
  };

  const resetForm = (newView: 'login' | 'forgot_password' | 'signup') => {
      setView(newView);
      setFormError('');
      setSuccessMessage('');
      setNameError('');
      setEmailError('');
      setPasswordError('');
  };

  const handleGoogleLogin = async () => {
    setFormError('');
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      const emailLower = result.user.email?.toLowerCase() || '';
      const isSpecificAdmin = emailLower === 'infotech.peadato@gmail.com';
      const role = (emailLower.includes('admin') || isSpecificAdmin) ? UserRole.ADMIN : UserRole.EMPLOYEE;
      
      const appUser: User = {
        id: result.user.uid,
        name: result.user.displayName || 'Google User',
        email: result.user.email || '',
        role: role,
        joinedAt: new Date().toLocaleDateString(),
        docCount: 0,
        avatarUrl: result.user.photoURL || undefined
      };
      
      onLogin(appUser);
    } catch (error: any) {
      console.error("Google Login Error:", error);
      
      if (error.code === 'auth/unauthorized-domain') {
        setFormError('Domain unauthorized. Add this domain to Firebase Console > Auth > Settings.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setFormError('Sign-in cancelled.');
      } else if (error.code === 'auth/popup-blocked') {
        setFormError('Sign-in popup was blocked by the browser.');
      } else {
        setFormError('Failed to sign in with Google. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanEmail = email.trim();
    const emailErr = validateEmail(cleanEmail);
    const passErr = validatePassword(password);

    setEmailError(emailErr);
    setPasswordError(passErr);

    if (emailErr || passErr) return;

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      
      // Check for email verification
      if (!userCredential.user.emailVerified) {
        await signOut(auth); // Prevent auto-login in App.tsx
        setPendingEmail(cleanEmail);
        setView('verify_email');
        setIsLoading(false);
        return;
      }

      const emailLower = userCredential.user.email?.toLowerCase() || '';
      const isSpecificAdmin = emailLower === 'infotech.peadato@gmail.com';
      const role = (emailLower.includes('admin') || isSpecificAdmin) ? UserRole.ADMIN : UserRole.EMPLOYEE;
      
      const appUser: User = {
        id: userCredential.user.uid,
        name: userCredential.user.displayName || cleanEmail.split('@')[0],
        email: userCredential.user.email || '',
        role: role,
        joinedAt: new Date().toLocaleDateString(),
        docCount: 0
      };
      onLogin(appUser);
    } catch (error: any) {
      // Don't log expected validation errors to console
      if (error.code !== 'auth/invalid-email' && error.code !== 'auth/invalid-credential') {
        console.error("Login Error:", error.code);
      }
      
      if (
        error.code === 'auth/invalid-credential' || 
        error.code === 'auth/user-not-found' || 
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-email'
      ) {
        setFormError('Email or password is incorrect');
      } else {
        setFormError('An error occurred. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    const nameErr = validateName(cleanName);
    const emailErr = validateEmail(cleanEmail);
    const passErr = validatePassword(password);

    setNameError(nameErr);
    setEmailError(emailErr);
    setPasswordError(passErr);

    if (nameErr || emailErr || passErr) return;

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      
      // Update profile with name
      await updateProfile(userCredential.user, {
        displayName: cleanName
      });

      // Create Firestore Document immediately with correct role
      const emailLower = cleanEmail.toLowerCase();
      const isSpecificAdmin = emailLower === 'infotech.peadato@gmail.com';
      const initialRole = (emailLower.includes('admin') || isSpecificAdmin) ? UserRole.ADMIN : UserRole.EMPLOYEE;
      
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            name: cleanName,
            email: cleanEmail,
            role: initialRole,
            joinedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            docCount: 0,
            createdAt: serverTimestamp()
        });
      } catch (docError) {
          console.error("Error creating user document:", docError);
          // Non-blocking error, App.tsx will attempt to recover if this fails
      }

      // Send Verification Email
      await sendEmailVerification(userCredential.user);
      
      // Sign out immediately to prevent auto-login
      await signOut(auth);

      setPendingEmail(cleanEmail);
      setView('verify_email');
      
    } catch (error: any) {
      console.error("Signup Error:", error.code);
      if (error.code === 'auth/email-already-in-use') {
        setFormError('User already exists. Please sign in');
      } else if (error.code === 'auth/invalid-email') {
        setFormError('Invalid email address format.');
      } else {
        setFormError(error.message || 'Failed to create account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    const emailErr = validateEmail(cleanEmail);
    setEmailError(emailErr);

    if (emailErr) return;

    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMessage(`Reset link sent to ${cleanEmail}`);
      setIsLoading(false);
    } catch (error: any) {
      if (error.code === 'auth/invalid-email') {
        setFormError('Please enter a valid email address.');
      } else {
        setFormError(error.message || 'Failed to send reset email.');
      }
      setIsLoading(false);
    }
  };

  const getHeading = () => {
      switch(view) {
          case 'login': return 'Good to see you again';
          case 'signup': return 'Create your account';
          case 'forgot_password': return 'Password Recovery';
          case 'verify_email': return 'Verify your email';
      }
  };

  return (
    <div className="min-h-screen bg-[#fffcf5] dark:bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden font-sans text-slate-800 dark:text-slate-100 p-4 transition-colors duration-200">
      
      {/* Decorative Blobs */}
      <div className="absolute top-[15%] right-[10%] w-72 h-72 bg-gradient-to-br from-orange-400 to-red-400 rounded-[3rem] blur-2xl opacity-90 -z-10 transform translate-x-1/4 rotate-12 dark:opacity-20" />
      <div className="absolute bottom-[15%] left-[10%] w-48 h-48 bg-gradient-to-tr from-orange-300 to-yellow-400 rounded-full blur-2xl opacity-80 -z-10 transform -translate-x-1/4 dark:opacity-20" />
      
      {/* Top Controls */}
      <div className="absolute top-6 right-6 z-20">
         <button
            onClick={toggleTheme}
            className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-lg dark:shadow-none text-slate-600 dark:text-slate-300 hover:scale-105 transition-transform"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
         >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
         </button>
      </div>

      {/* Header Logo */}
      <div className="mb-6 flex items-center gap-2 animate-fade-in-down">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-400 flex items-center justify-center text-white font-bold shadow-sm">
          <div className="w-3 h-3 bg-white rounded-full opacity-90" />
        </div>
        <span className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Twinhill</span>
      </div>

      {/* Main Heading */}
      <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100 mb-10 text-center tracking-tight animate-fade-in-down delay-75">
        {getHeading()}
      </h1>

      {/* Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-none p-8 md:p-10 w-full max-w-[480px] relative z-10 animate-fade-in-up delay-100 border border-slate-50 dark:border-slate-800">
        
        {view === 'login' && (
            <div className="space-y-6">
                <form onSubmit={handleLoginSubmit} className="space-y-6" noValidate>
                    <InputField
                        label="Your email"
                        icon={Mail}
                        type="email"
                        placeholder="e.g. name@company.com"
                        value={email}
                        onChange={(e: any) => setEmail(e.target.value)}
                        onBlur={() => setEmailError(validateEmail(email))}
                        error={emailError}
                        disabled={isLoading}
                    />

                    <InputField
                        label="Your password"
                        icon={Lock}
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e: any) => setPassword(e.target.value)}
                        onBlur={() => setPasswordError(validatePassword(password))}
                        error={passwordError}
                        disabled={isLoading}
                    />

                    {formError && (
                        <div className="text-red-500 dark:text-red-400 text-sm font-medium text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-lg border border-red-100 dark:border-red-800 flex items-center justify-center gap-2 animate-in fade-in">
                            <AlertCircle size={16} />
                            {formError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-3.5 rounded-full shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)] dark:shadow-none transition-all transform active:scale-[0.98] text-lg mt-2"
                    >
                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Signing in...
                            </div>
                        ) : 'Sign in'}
                    </button>
                </form>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-medium">OR</span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3.5 rounded-full shadow-sm transition-all transform active:scale-[0.98] flex items-center justify-center gap-3"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>
                    Sign in with Google
                </button>

                <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => resetForm('signup')} className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 text-sm font-bold hover:underline transition-colors">
                        Don't have an account?
                    </button>
                    <button type="button" onClick={() => resetForm('forgot_password')} className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 text-sm font-bold hover:underline transition-colors">
                        Forgot password?
                    </button>
                </div>
            </div>
        )}

        {view === 'signup' && (
             <form onSubmit={handleSignupSubmit} className="space-y-6" noValidate>
                <InputField
                    label="Full Name"
                    icon={UserIcon}
                    type="text"
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e: any) => setName(e.target.value)}
                    onBlur={() => setNameError(validateName(name))}
                    error={nameError}
                    disabled={isLoading}
                />

                <InputField
                    label="Email Address"
                    icon={Mail}
                    type="email"
                    placeholder="e.g. john@company.com"
                    value={email}
                    onChange={(e: any) => setEmail(e.target.value)}
                    onBlur={() => setEmailError(validateEmail(email))}
                    error={emailError}
                    disabled={isLoading}
                />

                <InputField
                    label="Create Password"
                    icon={Lock}
                    type="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e: any) => setPassword(e.target.value)}
                    onBlur={() => setPasswordError(validatePassword(password))}
                    error={passwordError}
                    disabled={isLoading}
                />

                {formError && (
                    <div className="text-red-500 dark:text-red-400 text-sm font-medium text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-lg border border-red-100 dark:border-red-800 flex items-center justify-center gap-2 animate-in fade-in">
                         <AlertCircle size={16} />
                        {formError}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-3.5 rounded-full shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)] dark:shadow-none transition-all transform active:scale-[0.98] text-lg mt-2"
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Creating...
                        </div>
                    ) : 'Create Account'}
                </button>

                <div className="text-center pt-4">
                    <button type="button" onClick={() => resetForm('login')} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm font-bold flex items-center justify-center gap-1 mx-auto transition-colors">
                        Already have an account? Sign in
                    </button>
                </div>
            </form>
        )}

        {view === 'forgot_password' && (
             <form onSubmit={handleResetSubmit} className="space-y-6" noValidate>
                 {successMessage ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mx-auto mb-4 animate-in zoom-in">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Check your email</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">{successMessage}</p>
                        <button 
                            type="button"
                            onClick={() => resetForm('login')}
                            className="text-blue-700 dark:text-blue-400 font-bold hover:underline"
                        >
                            Return to Sign in
                        </button>
                    </div>
                 ) : (
                    <>
                        <div className="text-center mb-4">
                            <p className="text-slate-500 dark:text-slate-400">Enter your email address and we'll send you a link to reset your password.</p>
                        </div>
                        
                        <InputField
                            label="Your email"
                            icon={Mail}
                            type="email"
                            placeholder="e.g. name@company.com"
                            value={email}
                            onChange={(e: any) => setEmail(e.target.value)}
                            onBlur={() => setEmailError(validateEmail(email))}
                            error={emailError}
                            disabled={isLoading}
                        />
                        
                         {formError && (
                            <div className="text-red-500 dark:text-red-400 text-sm font-medium text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-lg border border-red-100 dark:border-red-800 flex items-center justify-center gap-2 animate-in fade-in">
                                <AlertCircle size={16} />
                                {formError}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-3.5 rounded-full shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)] dark:shadow-none transition-all transform active:scale-[0.98] text-lg"
                        >
                             {isLoading ? 'Sending...' : 'Reset Password'}
                        </button>

                         <div className="text-center pt-4">
                            <button 
                                type="button" 
                                onClick={() => resetForm('login')} 
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm font-bold flex items-center justify-center gap-1 mx-auto transition-colors"
                            >
                                <ArrowLeft size={16} /> Back to Sign in
                            </button>
                        </div>
                    </>
                 )}
             </form>
        )}

        {view === 'verify_email' && (
            <div className="text-center py-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 mx-auto mb-6">
                    <Mail size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Verify your email</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                    We have sent you a verification email to <span className="font-bold text-slate-900 dark:text-white">{pendingEmail}</span>. <br/>
                    Please verify it and log in.
                </p>
                <button
                    onClick={() => resetForm('login')}
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-3.5 rounded-full shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)] dark:shadow-none transition-all transform active:scale-[0.98] text-lg"
                >
                    Back to Login
                </button>
            </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-400/60 dark:text-slate-600 font-medium">
         &copy; 2025 Twinhill. All rights reserved.
      </div>
    </div>
  );
};

export default Login;