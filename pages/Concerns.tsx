import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Clock, Send, AlertCircle, AlertTriangle, User as UserIcon, CornerDownRight, Shield, Trash2 } from 'lucide-react';
import { User, UserRole, Concern, ConcernResponse } from '../types';
import { db } from '../utils/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, query, where, arrayUnion, onSnapshot, deleteDoc } from 'firebase/firestore';

interface ConcernsProps {
  currentUser: User;
}

const Concerns: React.FC<ConcernsProps> = ({ currentUser }) => {
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [permissionError, setPermissionError] = useState(false);
  
  // State for reply inputs keyed by concern ID
  const [replyTexts, setReplyTexts] = useState<{ [key: string]: string }>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  // Admin filter states
  const [filterStatus, setFilterStatus] = useState<'All' | 'Open' | 'Resolved'>('All');

  useEffect(() => {
    let unsubscribe: () => void;

    const loadConcerns = async () => {
        setPermissionError(false);
        try {
            let q;
            const concernsRef = collection(db, 'concerns');

            if (currentUser.role === UserRole.ADMIN) {
                 // Admin: Fetch ALL concerns
                 q = query(concernsRef);
            } else {
                 // Employee: Fetch ONLY their own concerns
                 q = query(concernsRef, where('employeeId', '==', currentUser.id));
            }

            // Real-time listener to see replies instantly
            unsubscribe = onSnapshot(q, (snapshot) => {
                const loadedConcerns: Concern[] = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    loadedConcerns.push({
                        id: doc.id,
                        employeeId: data.employeeId,
                        employeeName: data.employeeName,
                        subject: data.subject,
                        message: data.message,
                        status: data.status,
                        createdAt: data.createdAt,
                        responses: data.responses || []
                    });
                });
                
                // Client-side sort by date descending
                loadedConcerns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setConcerns(loadedConcerns);
            }, (error) => {
                console.error("Error loading concerns:", error);
                if (error.code === 'permission-denied') {
                    setPermissionError(true);
                }
            });

        } catch (error: any) {
            console.error("Error setting up listener:", error);
        }
    };

    loadConcerns();

    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!subject.trim() || !message.trim()) {
      setErrorMsg('Please fill in both the subject and the message.');
      return;
    }

    setIsSubmitting(true);

    try {
      const newConcern = {
        employeeId: currentUser.id,
        employeeName: 'Anonymous User',
        subject: subject,
        message: message,
        status: 'Open' as const,
        createdAt: new Date().toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        }),
        responses: []
      };

      await addDoc(collection(db, 'concerns'), newConcern);
      
      setSubject('');
      setMessage('');
      setIsSubmitting(false);
      setSuccessMsg('Your concern has been submitted successfully.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (error: any) {
        console.error("Error submitting concern:", error);
        if (error.code === 'permission-denied') {
            setErrorMsg("Permission denied. Please check Firestore rules.");
        } else {
            setErrorMsg("Failed to submit concern. Please try again.");
        }
        setIsSubmitting(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
        const concernRef = doc(db, 'concerns', id);
        await updateDoc(concernRef, { status: 'Resolved' });
    } catch (error) {
        console.error("Error resolving concern:", error);
        alert("Failed to update ticket status. You may not have permission.");
    }
  };

  const handleDeleteConcern = async (id: string, subject: string) => {
    if (!window.confirm(`Are you sure you want to delete the ticket "${subject}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const concernRef = doc(db, 'concerns', id);
        await deleteDoc(concernRef);
        // The real-time listener will automatically update the UI
    } catch (error) {
        console.error("Error deleting concern:", error);
        alert("Failed to delete ticket. You may not have permission.");
    }
  };

  const handleSendReply = async (concernId: string) => {
      const text = replyTexts[concernId];
      if (!text || !text.trim()) return;

      setSendingReplyId(concernId);

      try {
          const newResponse: ConcernResponse = {
              id: Math.random().toString(36).substr(2, 9),
              authorId: currentUser.id,
              authorName: currentUser.role === UserRole.ADMIN ? currentUser.name : 'Anonymous User',
              role: currentUser.role,
              message: text.trim(),
              createdAt: new Date().toLocaleString('en-US', { 
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
              })
          };

          const concernRef = doc(db, 'concerns', concernId);
          
          // Add response and ensure ticket is Open if a new message comes in
          await updateDoc(concernRef, {
              responses: arrayUnion(newResponse),
              status: 'Open' // Re-open ticket on new activity
          });

          // Clear input
          setReplyTexts(prev => ({ ...prev, [concernId]: '' }));

      } catch (error) {
          console.error("Error sending reply:", error);
          alert("Failed to send reply.");
      } finally {
          setSendingReplyId(null);
      }
  };

  const displayedConcerns = concerns.filter(c => {
    if (filterStatus === 'All') return true;
    return c.status === filterStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Support & Concerns</h2>
        <p className="text-slate-500 dark:text-slate-400">
          {currentUser.role === UserRole.ADMIN 
            ? 'Manage support tickets and respond to employees' 
            : 'Submit questions or report issues to the administrator'}
        </p>
      </div>

      {permissionError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={24} />
            <div>
                <h3 className="font-bold text-red-900 dark:text-red-200">Access Denied</h3>
                <p className="text-sm text-red-700 dark:text-red-300">
                    Your security rules need to be updated to support the concerns database.
                    <br />
                    Please go to <strong>Manage Users</strong> to copy the new configuration.
                </p>
            </div>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Submission Form */}
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 sticky top-6 transition-colors">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-600 dark:text-blue-400" />
                Start a New Ticket
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                  <input 
                    type="text"
                    placeholder="Brief summary of the issue"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Message</label>
                  <textarea 
                    placeholder="Describe your concern in detail..."
                    rows={6}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all text-sm resize-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm rounded-lg flex items-center gap-2 border border-red-100 dark:border-red-800">
                    <AlertCircle size={16} />
                    {errorMsg}
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 text-sm rounded-lg flex items-center gap-2 border border-green-100 dark:border-green-800">
                    <CheckCircle size={16} />
                    {successMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={18} />
                      Submit Concern
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

        {/* Concerns List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col h-full transition-colors">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {currentUser.role === UserRole.ADMIN ? 'Ticket Management' : 'My Ticket History'}
              </h3>
              
              <div className="flex gap-2">
                 {(['All', 'Open', 'Resolved'] as const).map(status => (
                   <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      filterStatus === status 
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' 
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                   >
                     {status}
                   </button>
                 ))}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {displayedConcerns.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No concerns found matching your filter.</p>
                </div>
              ) : (
                displayedConcerns.map(concern => (
                  <div key={concern.id} className={`rounded-xl border transition-all overflow-hidden ${
                    concern.status === 'Open' 
                      ? 'bg-white dark:bg-slate-800 border-orange-200 dark:border-orange-900/30 shadow-sm' 
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}>
                    {/* Ticket Header */}
                    <div className="p-5 border-b border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-start gap-4">
                            <div className="space-y-1 w-full">
                                <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                                    concern.status === 'Open' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                }`}>
                                    {concern.status}
                                </span>
                                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                    <Clock size={12} />
                                    {concern.createdAt}
                                </span>
                                </div>
                                
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
                                    <UserIcon size={12} />
                                    {concern.employeeName}
                                </div>

                                <h4 className="font-bold text-slate-900 dark:text-white text-lg mt-1">{concern.subject}</h4>
                                <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 leading-relaxed whitespace-pre-wrap">
                                {concern.message}
                                </p>
                            </div>

                            {currentUser.role === UserRole.ADMIN && (
                                <div className="shrink-0 flex items-center gap-2">
                                    {concern.status === 'Open' && (
                                        <button 
                                        onClick={() => handleResolve(concern.id)}
                                        className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-green-200 dark:border-green-800"
                                        title="Mark as Resolved"
                                        >
                                        <CheckCircle size={14} />
                                        <span className="hidden sm:inline">Resolve</span>
                                        </button>
                                    )}
                                    <button 
                                    onClick={() => handleDeleteConcern(concern.id, concern.subject)}
                                    className="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-200 dark:border-red-800"
                                    title="Delete ticket"
                                    >
                                    <Trash2 size={14} />
                                    <span className="hidden sm:inline">Delete</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Responses Thread */}
                    {concern.responses && concern.responses.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 space-y-4 border-b border-slate-100 dark:border-slate-800">
                             {concern.responses.map(response => {
                                 const isAdminResponse = response.role === UserRole.ADMIN;
                                 return (
                                     <div key={response.id} className={`flex gap-3 ${isAdminResponse ? 'flex-row-reverse' : 'flex-row'}`}>
                                         <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border ${
                                             isAdminResponse 
                                             ? 'bg-blue-600 text-white border-blue-600' 
                                             : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                                         }`}>
                                             {isAdminResponse ? <Shield size={14} /> : '?'}
                                         </div>
                                         
                                         <div className={`max-w-[85%] space-y-1`}>
                                             <div className={`flex items-center gap-2 text-xs ${isAdminResponse ? 'justify-end' : 'justify-start'}`}>
                                                 <span className="font-bold text-slate-700 dark:text-slate-300">
                                                     {response.authorName} {isAdminResponse && '(Support)'}
                                                 </span>
                                                 <span className="text-slate-400">{response.createdAt}</span>
                                             </div>
                                             
                                             <div className={`p-3 rounded-2xl text-sm ${
                                                 isAdminResponse
                                                 ? 'bg-blue-600 text-white rounded-tr-none'
                                                 : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-tl-none'
                                             }`}>
                                                 {response.message}
                                             </div>
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>
                    )}

                    {/* Reply Input */}
                    <div className="p-4 bg-white dark:bg-slate-900">
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Type a reply..."
                                className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all text-sm text-slate-900 dark:text-white"
                                value={replyTexts[concern.id] || ''}
                                onChange={(e) => setReplyTexts(prev => ({ ...prev, [concern.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendReply(concern.id);
                                    }
                                }}
                            />
                            <button 
                                onClick={() => handleSendReply(concern.id)}
                                disabled={sendingReplyId === concern.id || !replyTexts[concern.id]?.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sendingReplyId === concern.id ? (
                                    <div className="w-5 h-5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <CornerDownRight size={20} />
                                )}
                            </button>
                        </div>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Concerns;