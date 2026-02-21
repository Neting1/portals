import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UploadDocuments from './pages/UploadDocuments';
import ManageUsers from './pages/ManageUsers';
import AllDocuments from './pages/AllDocuments';
import Concerns from './pages/Concerns';
import Login from './pages/Login';
import { ViewState, User, UserRole } from './types';
import { auth, db } from './utils/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, LogOut, Clock, Menu } from 'lucide-react';

// Inactivity configuration
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 Minutes
const WARNING_THRESHOLD_MS = 60 * 1000;     // Show warning 1 minute before logout

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const [loginUserName, setLoginUserName] = useState('');
  const [isLoginLoadingComplete, setIsLoginLoadingComplete] = useState(true);
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply Theme
  useEffect(() => {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => {
      setIsDarkMode(prev => !prev);
  }, []);

  // Inactivity State
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Listen for Firebase Auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          // Attempt to read from Firestore
          let appUser: User;
          
          try {
             const userSnap = await getDoc(userRef);
             
             if (userSnap.exists()) {
                const data = userSnap.data();
                
                // SECURITY FIX: Do NOT auto-upgrade roles based on email
                // Just use the role stored in the database
                appUser = {
                  id: firebaseUser.uid,
                  name: data.name || firebaseUser.displayName || 'User',
                  email: data.email || firebaseUser.email || '',
                  role: data.role as UserRole,
                  joinedAt: data.joinedAt || new Date().toLocaleDateString(),
                  docCount: data.docCount || 0,
                  avatarUrl: data.avatarUrl || firebaseUser.photoURL || undefined
                };
             } else {
                 throw new Error("User document not found, creating new...");
             }
          } catch (dbError) {
             // If DB read fails (e.g. permission denied) or doc doesn't exist, fall back to Auth data
             // SECURITY FIX: Default to EMPLOYEE role, never ADMIN
             appUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                email: firebaseUser.email || '',
                role: UserRole.EMPLOYEE, // Always default to EMPLOYEE
                joinedAt: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                docCount: 0,
                avatarUrl: firebaseUser.photoURL || undefined
             };

             // Try to save to Firestore, but ignore if it fails due to permissions
             try {
                 await setDoc(userRef, {
                    name: appUser.name,
                    email: appUser.email,
                    role: appUser.role,
                    joinedAt: appUser.joinedAt,
                    docCount: 0,
                    createdAt: serverTimestamp()
                 });
             } catch (writeError) {
                 // Error silently - Firestore rules may prevent this
             }
          }

          setCurrentUser(appUser);
          // Reset activity timer on login
          lastActivityRef.current = Date.now();
        } catch (error: any) {
          console.error("Critical Auth Error:", error);
          setCurrentUser(null);
        }
      } else {
        // If user is not logged in OR email is not verified, clear current user
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auth Handlers
  const handleLogin = (user: User) => {
    // Store the user name for the loading screen
    setLoginUserName(user.name);
    // Show the success message without immediately switching views
    setShowLoginSuccess(true);
    // Mark that loading is in progress
    setIsLoginLoadingComplete(false);
    // After 2 seconds, hide loading and show dashboard
    setTimeout(() => {
      setShowLoginSuccess(false);
      setCurrentView(ViewState.DASHBOARD);
      setIsLoginLoadingComplete(true);
    }, 2000);
  };

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setCurrentView(ViewState.DASHBOARD);
      setShowTimeoutWarning(false);
      setShowLoginSuccess(false);
      setLoginUserName('');
      setIsLoginLoadingComplete(true);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, []);

  // Update local state without reload
  const handleProfileUpdate = (updates: Partial<User>) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, ...updates });
    }
  };

  // --- Inactivity Logic ---
  
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Only update state if the warning is currently shown to avoid unnecessary re-renders
    if (showTimeoutWarning) {
        setShowTimeoutWarning(false);
    }
  }, [showTimeoutWarning]);

  useEffect(() => {
    if (!currentUser) return;

    // 1. Event Listeners to track activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    // We throttle the reset slightly to avoid running it on every single pixel of mouse movement
    // But for simplicity in this context, direct assignment to ref is extremely cheap.
    const handleActivity = () => {
        lastActivityRef.current = Date.now();
    };

    events.forEach(event => window.addEventListener(event, handleActivity));

    // 2. Interval to check for timeout
    const checkInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastActivity = now - lastActivityRef.current;
        const timeRemaining = INACTIVITY_LIMIT_MS - timeSinceLastActivity;

        if (timeRemaining <= 0) {
            handleLogout();
        } else if (timeRemaining <= WARNING_THRESHOLD_MS) {
            // Only set true if not already true to avoid loop
            setShowTimeoutWarning(prev => !prev ? true : prev);
        }
    }, 1000); // Check every second

    return () => {
        events.forEach(event => window.removeEventListener(event, handleActivity));
        clearInterval(checkInterval);
    };
  }, [currentUser, handleLogout]);

  // --- Session Termination on Window Close ---
  useEffect(() => {
    if (!currentUser) return;

    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      // Sign out user when window/tab is being closed
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Error signing out on window close:", error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser]);

  // Handle navigation change (close mobile menu)
  const handleNavigate = (view: ViewState) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const renderContent = () => {
    if (!currentUser) return null;

    switch (currentView) {
      case ViewState.DASHBOARD:
        return <Dashboard onNavigate={handleNavigate} currentUser={currentUser} />;
      case ViewState.UPLOAD:
        // Protect Admin Route
        if (currentUser.role !== UserRole.ADMIN) {
           return <Dashboard onNavigate={handleNavigate} currentUser={currentUser} />;
        }
        return <UploadDocuments onBack={() => handleNavigate(ViewState.DASHBOARD)} onNavigate={handleNavigate} currentUser={currentUser} />;
      case ViewState.USERS:
        // Protect Admin Route
        if (currentUser.role !== UserRole.ADMIN) {
           return <Dashboard onNavigate={handleNavigate} currentUser={currentUser} />;
        }
        return <ManageUsers currentUser={currentUser} />;
      case ViewState.DOCUMENTS:
        return <AllDocuments onBack={() => handleNavigate(ViewState.DASHBOARD)} currentUser={currentUser} />;
      case ViewState.CONCERNS:
        return <Concerns currentUser={currentUser} />;
      default:
        return <Dashboard onNavigate={handleNavigate} currentUser={currentUser} />;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400">Loading...</div>;
  }

  // If not logged in or still loading after login, show Login page
  if (!currentUser || !isLoginLoadingComplete) {
    return (
      <>
        {/* Login Success Message - Shows over Login page */}
        {showLoginSuccess && (
          <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center animate-in fade-in duration-300">
            {/* Animated background blobs */}
            <div className="absolute top-20 right-20 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-emerald-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
            
            {/* Loading Content */}
            <div className="relative z-10 text-center flex flex-col items-center gap-8">
              {/* Logo/Icon */}
              <div className="flex items-center justify-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl">
                  <svg className="w-8 h-8 text-white animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              
              {/* Welcome Text */}
              <div className="space-y-3">
                <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
                  Welcome, <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">{loginUserName}!</span>
                </h1>
                <p className="text-xl text-slate-300">Preparing everything for <span className="font-semibold text-emerald-400">{loginUserName}</span>...</p>
              </div>
              
              {/* Loading Bar */}
              <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden mt-8">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full animate-pulse" style={{animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}} />
              </div>
              
              {/* Loading Dots */}
              <div className="flex justify-center gap-2 mt-6">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0s'}} />
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}} />
              </div>
            </div>
          </div>
        )}
        <Login onLogin={handleLogin} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
      </>
    );
  }

  // If logged in, show main app layout
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 relative transition-colors duration-200">
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-4">
        <div className="flex items-center gap-2 justify-center">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
             $
           </div>
           <span className="font-bold text-slate-900 dark:text-white hidden sm:block">Twin Hill Payroll Portal</span>
           <span className="font-bold text-sm text-slate-900 dark:text-white sm:hidden">Twin Hill</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="absolute right-4 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      <Sidebar 
        currentView={currentView} 
        onNavigate={handleNavigate} 
        currentUser={currentUser}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onProfileUpdate={handleProfileUpdate}
      />
      
      {/* Main Content - Adjust margin left on desktop, remove on mobile */}
      <main className="flex-1 md:ml-64 pt-20 md:pt-8 p-4 md:p-8 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Session Timeout Warning Modal */}
      {showTimeoutWarning && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 px-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 transform scale-100 animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-500 mb-4 animate-pulse">
                          <Clock size={32} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Session Timeout</h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-8">
                          You have been inactive for a while. For your security, you will be logged out in less than a minute.
                      </p>
                      
                      <div className="flex gap-4 w-full">
                          <button 
                              onClick={handleLogout}
                              className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                          >
                              <LogOut size={18} />
                              Log Out
                          </button>
                          <button 
                              onClick={resetInactivityTimer}
                              className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 dark:shadow-none"
                          >
                              Stay Logged In
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;