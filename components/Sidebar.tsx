import React, { useState } from 'react';
import { ViewState, User, UserRole } from '../types';
import { NAV_ITEMS } from '../constants';
import { LogOut, Sun, Moon, X, Camera, Loader2 } from 'lucide-react';
import { db } from '../utils/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  currentUser: User;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isOpen: boolean;       // For mobile visibility
  onClose: () => void;   // For closing mobile sidebar
  onProfileUpdate?: (updates: Partial<User>) => void; // Callback to update App state
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate, 
  currentUser, 
  onLogout,
  isDarkMode,
  toggleTheme,
  isOpen,
  onClose,
  onProfileUpdate
}) => {
  const [isUploading, setIsUploading] = useState(false);

  // Filter navigation items based on user role
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (currentUser.role === UserRole.EMPLOYEE) {
      // Employees see Dashboard, Documents, and Concerns
      return item.view === ViewState.DASHBOARD || 
             item.view === ViewState.DOCUMENTS || 
             item.view === ViewState.CONCERNS;
    }
    // Admins see everything
    return true;
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert("Please select an image file.");
        return;
    }

    // Validate size (Limit to 500KB for Firestore storage efficiency)
    if (file.size > 500 * 1024) {
        alert("Image size must be less than 500KB when storing in database.");
        return;
    }

    setIsUploading(true);

    try {
        // Convert file to Base64 string
        const base64String = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });

        // Update Firestore user document with Base64 string
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, {
            avatarUrl: base64String
        });

        // Update local state in App.tsx to reflect changes immediately
        if (onProfileUpdate) {
            onProfileUpdate({ avatarUrl: base64String });
        }

    } catch (error) {
        console.error("Error updating avatar:", error);
        alert("Failed to update profile picture. Please try again.");
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 
        flex flex-col transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        {/* Brand Header */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md dark:shadow-none">
              $
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">Twin Hill</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Payroll Management</p>
            </div>
          </div>
          {/* Close button - Mobile only */}
          <button 
            onClick={onClose}
            className="md:hidden text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 p-1 rounded-md transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Nav Items */}
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-2">Menu</p>
          </div>
          <nav className="space-y-1 px-3">
            {visibleNavItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.label}
                  onClick={() => onNavigate(item.view as ViewState)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Account Section */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between px-2 mb-3">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account</p>
              <button
                  onClick={toggleTheme}
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                  {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
          </div>
          
          <div className="flex items-center gap-3 px-2 mb-4">
              <div className="relative group shrink-0">
                  <div className="w-10 h-10 rounded-full bg-slate-500 text-white flex items-center justify-center font-bold overflow-hidden ring-2 ring-transparent group-hover:ring-blue-400 transition-all cursor-pointer relative">
                      {isUploading && (
                          <div className="bg-black/50 absolute inset-0 flex items-center justify-center z-20">
                              <Loader2 size={16} className="animate-spin text-white" />
                          </div>
                      )}
                      
                      {currentUser.avatarUrl ? (
                          <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                          currentUser.name.charAt(0)
                      )}
                      
                      {/* Hover Overlay - hidden while uploading to avoid double clicks */}
                      {!isUploading && (
                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10">
                            <Camera size={16} className="text-white" />
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                        </label>
                      )}
                  </div>
              </div>

              <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
              </div>
          </div>

          <div className="flex items-center justify-between px-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${
                  currentUser.role === UserRole.ADMIN 
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800' 
                  : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'
              }`}>
                  {currentUser.role}
              </span>
              <button 
                  onClick={onLogout}
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Sign out"
              >
                  <LogOut size={18} />
              </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;