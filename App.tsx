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
                const emailLower = data.email?.toLowerCase() || firebaseUser.email?.toLowerCase() || '';
                
                // Security Fix: Auto-correct or upgrade admin roles
                // Auto-upgrade if: lowercase role, specific admin email, or any email containing 'admin'
                const isSpecificAdmin = emailLower === 'infotech.peadato@gmail.com';
                const isAdminByEmail = emailLower.includes('admin');
                const hasLowerCaseAdminRole = data.role && data.role !== UserRole.ADMIN && (data.role.toLowerCase() === 'admin');
                
                if (data.role !== UserRole.ADMIN && (hasLowerCaseAdminRole || isSpecificAdmin || isAdminByEmail)) {
                    try {
                        // Use setDoc with merge to be robust against missing fields
                        await setDoc(userRef, { role: UserRole.ADMIN }, { merge: true });
                        data.role = UserRole.ADMIN;
                        console.log(`Auto-upgraded role to Admin for ${emailLower}`);
                    } catch (e) {
                        console.error("Auto-fix role failed, possibly due to strict rules blocking update", e);
                    }
                }

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
             // and attempt to create/overwrite
             const emailLower = firebaseUser.email?.toLowerCase() || '';
             const isSpecificAdmin = emailLower === 'infotech.peadato@gmail.com';
             const initialRole = (emailLower.includes('admin') || isSpecificAdmin)
              ? UserRole.ADMIN 
              : UserRole.EMPLOYEE;

             appUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                email: firebaseUser.email || '',
                role: initialRole,
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
                 console.warn("Could not save user to Firestore (Permissions or Network)", writeError);
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
    // onAuthStateChanged handles the state update
    // We can force a view reset here
    setCurrentView(ViewState.DASHBOARD);
  };

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setCurrentView(ViewState.DASHBOARD);
      setShowTimeoutWarning(false);
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

  // If not logged in, show Login page
  if (!currentUser) {
    return <Login onLogin={handleLogin} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />;
  }

  // If logged in, show main app layout
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 relative transition-colors duration-200">
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
             $
           </div>
           <span className="font-bold text-lg text-slate-900 dark:text-white">Twinhill</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
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