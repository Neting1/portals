import React, { useState, useEffect } from 'react';
import { Search, Users, Shield, User as UserIcon, Calendar, FileText, RefreshCw, AlertTriangle, Activity, Clock, Copy, Check } from 'lucide-react';
import StatsCard from '../components/StatsCard';
import { UserRole, User, AuditLogEntry } from '../types';
import { db } from '../utils/firebase';
import { collection, getDocs, getDoc, doc, updateDoc, query, addDoc, orderBy, limit } from 'firebase/firestore';

interface ManageUsersProps {
  currentUser?: User;
}

const ManageUsers: React.FC<ManageUsersProps> = ({ currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
  }, [currentUser]);

  const fetchUsers = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setPermissionError(false);
    
    try {
      const loadedUsers: User[] = [];

      if (currentUser.role === UserRole.ADMIN) {
        // Admin: Fetch all users
        const usersRef = collection(db, 'users');
        const q = query(usersRef); 
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedUsers.push({
            id: doc.id,
            name: data.name || 'Unknown',
            email: data.email || '',
            role: data.role as UserRole,
            joinedAt: data.joinedAt || '',
            docCount: data.docCount || 0,
            avatarUrl: data.avatarUrl
          });
        });

        // Sort alphabetically by name
        loadedUsers.sort((a, b) => a.name.localeCompare(b.name));

      } else {
        // Normal User: Fetch own profile only using getDoc
        const userRef = doc(db, 'users', currentUser.id);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          loadedUsers.push({
            id: userSnap.id,
            name: data.name || 'Unknown',
            email: data.email || '',
            role: data.role as UserRole,
            joinedAt: data.joinedAt || '',
            docCount: data.docCount || 0,
            avatarUrl: data.avatarUrl
          });
        }
      }
      
      setUsers(loadedUsers);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            setPermissionError(true);
            // Do not console.error permission denied as it is handled by UI
        } else {
            console.error("Error fetching users:", error);
        }
        
        // Fallback: show current user if fetch failed but we have prop
        if (currentUser && users.length === 0) {
            setUsers([currentUser]);
        }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) return;

    try {
      const logsRef = collection(db, 'audit_logs');
      // Fetch latest 20 logs
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      
      const loadedLogs: AuditLogEntry[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedLogs.push({
          id: doc.id,
          action: data.action,
          executorId: data.executorId,
          executorName: data.executorName,
          targetUserId: data.targetUserId,
          targetUserName: data.targetUserName,
          details: data.details,
          timestamp: data.timestamp
        });
      });
      setAuditLogs(loadedLogs);
    } catch (error) {
      // Quietly fail or log warning if needed, but for audit logs we can be lenient
      // console.warn("Error fetching audit logs", error);
    }
  };

  const logAction = async (action: string, targetUser: User, details: string) => {
    if (!currentUser) return;

    try {
      const newLog: Omit<AuditLogEntry, 'id'> = {
        action,
        executorId: currentUser.id,
        executorName: currentUser.name,
        targetUserId: targetUser.id,
        targetUserName: targetUser.name,
        details,
        timestamp: new Date().toLocaleString()
      };

      await addDoc(collection(db, 'audit_logs'), newLog);
      
      // Update local state to show immediately
      const logWithId = { ...newLog, id: Math.random().toString(36) };
      setAuditLogs(prev => [logWithId, ...prev]);

    } catch (error) {
      console.error("Failed to write audit log", error);
    }
  };

  const toggleUserRole = async (targetUser: User) => {
    // Prevent changing your own role if you are the only admin, 
    // but for now, we just prevent changing your own role to avoid lockout in this UI.
    if (currentUser && targetUser.id === currentUser.id) {
      alert("You cannot change your own permission level.");
      return;
    }

    setProcessingId(targetUser.id);
    const newRole = targetUser.role === UserRole.ADMIN ? UserRole.EMPLOYEE : UserRole.ADMIN;

    try {
      const userRef = doc(db, 'users', targetUser.id);
      await updateDoc(userRef, {
        role: newRole
      });
      
      // Log the action
      await logAction(
        'ROLE_CHANGE', 
        targetUser, 
        `Changed role from ${targetUser.role} to ${newRole}`
      );
      
      // Optimistic update locally
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update user role. Check database permissions.");
    } finally {
      setProcessingId(null);
    }
  };

  const copyRulesToClipboard = () => {
    const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && 
              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin') ||
             (request.auth.token.email != null && (
                request.auth.token.email == 'infotech.peadato@gmail.com' ||
                request.auth.token.email.matches('.*admin.*')
             ));
    }
    
    // Allow Admins to perform Collection Group queries on 'documents'
    match /{path=**}/documents/{docId} {
      allow read: if request.auth != null && isAdmin();
    }

    // User profiles
    match /users/{userId} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      allow write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      
      match /documents/{docId} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }
    }
    
    // Top-level concerns collection
    match /concerns/{concernId} {
      allow create: if request.auth != null;
      // Admins read all, Users read their own
      allow read: if request.auth != null && (resource.data.employeeId == request.auth.uid || isAdmin());
      // Admins can update (resolve/reply). Owners can update (reply).
      allow update: if request.auth != null && (isAdmin() || resource.data.employeeId == request.auth.uid);
    }
    
    // Audit logs
    match /audit_logs/{logId} {
      allow read: if request.auth != null && isAdmin();
      allow create: if request.auth != null;
    }
  }
}`;
    navigator.clipboard.writeText(rules);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalUsers = users.length;
  const totalEmployees = users.filter(u => u.role === UserRole.EMPLOYEE).length;
  const totalAdmins = users.filter(u => u.role === UserRole.ADMIN).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      {/* Search Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex justify-between items-center mb-4">
             <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Search size={20} />
                Search Users
            </h2>
            <div className="flex gap-2">
              <button 
                  onClick={() => { fetchUsers(); fetchAuditLogs(); }} 
                  disabled={isLoading}
                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Refresh List"
              >
                  <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
        </div>
       
        <div className="relative">
            <input 
                type="text" 
                placeholder="Search by name or email..." 
                className="w-full pl-4 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          label="Total Users" 
          value={isLoading ? '-' : totalUsers} 
          icon={Users} 
          colorClass="bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100" 
          iconBgClass="bg-blue-600 text-white dark:bg-blue-500"
        />
        <StatsCard 
          label="Employees" 
          value={isLoading ? '-' : totalEmployees} 
          icon={UserIcon} 
          colorClass="bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100" 
          iconBgClass="bg-green-600 text-white dark:bg-green-500"
        />
        <StatsCard 
          label="Admins" 
          value={isLoading ? '-' : totalAdmins} 
          icon={Shield} 
          colorClass="bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100" 
          iconBgClass="bg-purple-600 text-white dark:bg-purple-500"
        />
      </div>

      {/* Users List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 transition-colors">
        <h3 className="font-bold text-slate-900 dark:text-white mb-6">All Users</h3>
        
        {isLoading && users.length === 0 ? (
           <div className="text-center py-12 text-slate-400 dark:text-slate-500">Loading users...</div>
        ) : permissionError ? (
           <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6">
              <div className="text-center mb-4">
                  <AlertTriangle className="mx-auto text-orange-600 dark:text-orange-400 mb-2" size={32} />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Configuration Required</h3>
                  <p className="text-slate-600 dark:text-slate-300 mb-4 max-w-lg mx-auto">
                      Your Firestore Security Rules are blocking access. This is a security feature.
                      Please copy the rules below and paste them into your Firebase Console &gt; Firestore Database &gt; Rules.
                  </p>
              </div>
              
              <div className="bg-slate-900 rounded-lg p-4 relative group max-w-2xl mx-auto">
                <button 
                  onClick={copyRulesToClipboard}
                  className="absolute top-2 right-2 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-md transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
                <pre className="text-xs text-slate-300 overflow-x-auto font-mono p-2">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && 
              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin') ||
             (request.auth.token.email != null && (
                request.auth.token.email == 'infotech.peadato@gmail.com' ||
                request.auth.token.email.matches('.*admin.*')
             ));
    }
    
    // Allow Admins to perform Collection Group queries on 'documents'
    match /{path=**}/documents/{docId} {
      allow read: if request.auth != null && isAdmin();
    }

    // User profiles
    match /users/{userId} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      allow write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      
      match /documents/{docId} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }
    }
    
    // Top-level concerns collection
    match /concerns/{concernId} {
      allow create: if request.auth != null;
      // Admins read all, Users read their own
      allow read: if request.auth != null && (resource.data.employeeId == request.auth.uid || isAdmin());
      // Admins can update (resolve/reply). Owners can update (reply).
      allow update: if request.auth != null && (isAdmin() || resource.data.employeeId == request.auth.uid);
    }
    
    // Audit logs
    match /audit_logs/{logId} {
      allow read: if request.auth != null && isAdmin();
      allow create: if request.auth != null;
    }
  }
}`}
                </pre>
              </div>
          </div>
        ) : (
        <div className="space-y-4">
            {filteredUsers.map(user => (
                <div key={user.id} className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border border-slate-100 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-4">
                    <div className="flex items-center gap-4 w-full lg:w-auto">
                        <div className="w-12 h-12 rounded-lg bg-slate-500 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0 ring-1 ring-slate-200 dark:ring-slate-700">
                             {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                             ) : (
                                user.name.charAt(0)
                             )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h4 className="font-bold text-slate-900 dark:text-slate-200 truncate">{user.name}</h4>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide border ${
                                    user.role === UserRole.ADMIN 
                                    ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' 
                                    : 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                                }`}>
                                    {user.role}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                {user.email}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-4 lg:gap-6 text-sm text-slate-500 dark:text-slate-400 pl-16 lg:pl-0 w-full lg:w-auto">
                         <div className="flex items-center gap-4 sm:gap-6">
                             <div className="flex items-center gap-2" title="Date Joined">
                                 <Calendar size={16} />
                                 <span className="whitespace-nowrap">{user.joinedAt}</span>
                             </div>
                             <div className="flex items-center gap-2" title="Documents Count">
                                 <FileText size={16} />
                                 <span className="whitespace-nowrap">{user.docCount} docs</span>
                             </div>
                         </div>
                         
                         {currentUser?.role === UserRole.ADMIN && (
                             <button 
                                onClick={() => toggleUserRole(user)}
                                disabled={processingId === user.id}
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg font-bold text-xs transition-colors border shadow-sm flex items-center justify-center gap-2 ${
                                    user.role === UserRole.ADMIN
                                    ? 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-red-600 hover:border-red-200'
                                    : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                                }`}
                             >
                                {processingId === user.id ? (
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Shield size={14} />
                                )}
                                {user.role === UserRole.ADMIN ? 'Revoke Admin' : 'Make Admin'}
                             </button>
                         )}
                    </div>
                </div>
            ))}

            {filteredUsers.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    No users found matching "{searchTerm}"
                </div>
            )}
        </div>
        )}
      </div>

      {/* Audit Log Section */}
      {currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 transition-colors">
            <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                <Activity size={20} className="text-orange-500" />
                Recent System Activity
            </h3>

            {auditLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm italic">
                No recent administrative actions recorded.
            </div>
            ) : (
            <div className="space-y-4">
                {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        log.action === 'ROLE_CHANGE' 
                        ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                        {log.action === 'ROLE_CHANGE' ? <Shield size={14} /> : <Activity size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {log.executorName} <span className="text-slate-400 dark:text-slate-500 font-normal">modified</span> {log.targetUserName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {log.details}
                        </p>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex items-center gap-1">
                        <Clock size={12} />
                        {log.timestamp}
                    </div>
                </div>
                ))}
            </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ManageUsers;