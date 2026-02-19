import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Upload, Calendar, User as UserIcon, DollarSign, Tag, X, CheckCircle2, Sparkles, Loader2, Edit2, Search, ChevronDown, Check, Trash2, Plus, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { ViewState, DocStatus, DocType, UserRole, User } from '../types';
import { db } from '../utils/firebase';
import { collection, addDoc, doc, updateDoc, increment, query, onSnapshot } from 'firebase/firestore';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

interface UploadDocumentsProps {
  onBack: () => void;
  onNavigate: (view: ViewState) => void;
  currentUser: User;
}

interface QueuedDocument {
  id: string;
  file: File;
  status: 'pending' | 'analyzing' | 'success' | 'error';
  
  // Form Data
  title: string;
  selectedUserId: string;
  isManualEntry: boolean;
  manualName: string;
  manualEmail: string;
  docType: DocType;
  period: string;
  amount: string;
  
  // UI Helpers
  extractedFields: string[];
  errorMsg?: string;
}

// --- Sub-Component: User Selection Dropdown ---
const UserSelect: React.FC<{
    users: User[];
    selectedUserId: string;
    onSelect: (id: string) => void;
    isManual: boolean;
    onToggleManual: () => void;
    manualName: string;
    manualEmail: string;
    onManualChange: (field: 'name' | 'email', value: string) => void;
    autoFilled: boolean;
    isLoading: boolean;
}> = ({ users, selectedUserId, onSelect, isManual, onToggleManual, manualName, manualEmail, onManualChange, autoFilled, isLoading }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getSelectedUserName = () => {
        if (isLoading && users.length === 0) return "Loading employees...";
        const user = users.find(u => u.id === selectedUserId);
        return user ? user.name : "Select an employee";
    };

    return (
        <div className="space-y-2 relative" ref={dropdownRef}>
            <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                    Employee
                    {autoFilled && <Sparkles size={12} className="text-purple-500 animate-pulse" title="System matched" />}
                </label>
                {(users.length > 0 || isLoading) && (
                    <button 
                        onClick={onToggleManual}
                        className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 uppercase"
                    >
                        <Edit2 size={10} />
                        {isManual ? "Select from list" : "Enter manually"}
                    </button>
                )}
            </div>
            
            {isManual ? (
                <div className="space-y-2">
                    <input 
                        type="text" 
                        placeholder="Employee Name" 
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 text-sm text-slate-800 dark:text-white"
                        value={manualName}
                        onChange={(e) => onManualChange('name', e.target.value)}
                    />
                    <input 
                        type="email" 
                        placeholder="Employee Email" 
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 text-sm text-slate-800 dark:text-white"
                        value={manualEmail}
                        onChange={(e) => onManualChange('email', e.target.value)}
                    />
                </div>
            ) : (
                <div className="relative">
                    <button 
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        disabled={isLoading && users.length === 0}
                        className={`w-full text-left pl-9 pr-8 py-2.5 bg-white dark:bg-slate-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-medium flex items-center relative ${
                            autoFilled
                            ? 'border-purple-300 dark:border-purple-700/50 focus:border-purple-500' 
                            : 'border-slate-200 dark:border-slate-700 focus:border-blue-500'
                        } ${isLoading && users.length === 0 ? 'opacity-70 cursor-wait' : 'text-slate-800 dark:text-white'}`}
                    >
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                            {isLoading && users.length === 0 ? <Loader2 size={16} className="animate-spin" /> : <UserIcon size={16} />}
                        </div>
                        <span className={`truncate ${selectedUserId ? '' : 'text-slate-400'}`}>
                            {getSelectedUserName()}
                        </span>
                        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                            <ChevronDown size={14} />
                        </div>
                    </button>

                    {isOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="relative">
                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Search..." 
                                        className="w-full pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-transparent focus:border-blue-500 rounded text-xs outline-none text-slate-900 dark:text-white"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {filteredUsers.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                        No employees found
                                    </div>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => {
                                                onSelect(user.id);
                                                setIsOpen(false);
                                                setSearchTerm('');
                                            }}
                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group ${
                                                selectedUserId === user.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${
                                                    selectedUserId === user.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {user.name}
                                                </p>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                    {user.email}
                                                </p>
                                            </div>
                                            {selectedUserId === user.id && (
                                                <Check size={14} className="text-blue-600 dark:text-blue-400" />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Sub-Component: Document Card ---
const DocumentCard: React.FC<{
    docItem: QueuedDocument;
    users: User[];
    areUsersLoading: boolean;
    onUpdate: (id: string, updates: Partial<QueuedDocument>) => void;
    onRemove: (id: string) => void;
}> = ({ docItem, users, areUsersLoading, onUpdate, onRemove }) => {
    
    const isAuto = (field: string) => docItem.extractedFields.includes(field);

    if (docItem.status === 'analyzing') {
        return (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                </div>
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3"></div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/4"></div>
                </div>
            </div>
        );
    }
    
    if (docItem.status === 'pending') {
        return (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-4">
                 <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400">
                    <Clock size={24} />
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 truncate pr-2">{docItem.file.name}</h4>
                    <p className="text-xs text-slate-500">Queued for analysis...</p>
                </div>
                <button 
                    onClick={() => onRemove(docItem.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-2"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        )
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-colors group relative">
            <button 
                onClick={() => onRemove(docItem.id)}
                className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors p-1"
                title="Remove document"
            >
                <Trash2 size={18} />
            </button>

            <div className="flex items-start gap-4 mb-6 pr-8">
                <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg flex items-center justify-center shrink-0 border border-red-100 dark:border-red-800/50">
                    <FileText size={20} />
                </div>
                <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white truncate pr-2">{docItem.file.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{(docItem.file.size / 1024).toFixed(0)} KB</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Title */}
                <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 uppercase tracking-wider">
                        Title {isAuto('title') && <Sparkles size={12} className="text-purple-500" />}
                    </label>
                    <input 
                        type="text"
                        value={docItem.title}
                        onChange={(e) => onUpdate(docItem.id, { title: e.target.value })}
                        className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${
                            isAuto('title') ? 'border-purple-200 dark:border-purple-800' : 'border-slate-200 dark:border-slate-700'
                        }`}
                        placeholder="Document Title"
                    />
                </div>

                {/* User Select */}
                <UserSelect 
                    users={users}
                    isLoading={areUsersLoading}
                    selectedUserId={docItem.selectedUserId}
                    onSelect={(id) => onUpdate(docItem.id, { selectedUserId: id })}
                    isManual={docItem.isManualEntry}
                    onToggleManual={() => onUpdate(docItem.id, { isManualEntry: !docItem.isManualEntry })}
                    manualName={docItem.manualName}
                    manualEmail={docItem.manualEmail}
                    onManualChange={(field, val) => onUpdate(docItem.id, field === 'name' ? { manualName: val } : { manualEmail: val })}
                    autoFilled={isAuto('employee')}
                />

                {/* Doc Type */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Type</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Tag size={14} />
                        </div>
                        <select 
                            value={docItem.docType}
                            onChange={(e) => onUpdate(docItem.id, { docType: e.target.value as DocType })}
                            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none text-slate-800 dark:text-white"
                        >
                            <option value={DocType.PAY_STUB}>Pay Stub</option>
                            <option value={DocType.BONUS}>Bonus</option>
                            <option value={DocType.ALLOWANCE}>Allowance</option>
                        </select>
                    </div>
                </div>

                {/* Period */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 uppercase tracking-wider">
                        Period {isAuto('period') && <Sparkles size={12} className="text-purple-500" />}
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Calendar size={14} />
                        </div>
                        <input 
                            type="text"
                            value={docItem.period}
                            onChange={(e) => onUpdate(docItem.id, { period: e.target.value })}
                            className={`w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                isAuto('period') ? 'border-purple-200 dark:border-purple-800' : 'border-slate-200 dark:border-slate-700'
                            }`}
                            placeholder="e.g. Dec 2025"
                        />
                    </div>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 uppercase tracking-wider">
                        Amount {isAuto('amount') && <Sparkles size={12} className="text-purple-500" />}
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <DollarSign size={14} />
                        </div>
                        <input 
                            type="number"
                            value={docItem.amount}
                            onChange={(e) => onUpdate(docItem.id, { amount: e.target.value })}
                            className={`w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                isAuto('amount') ? 'border-purple-200 dark:border-purple-800' : 'border-slate-200 dark:border-slate-700'
                            }`}
                            placeholder="0.00"
                        />
                    </div>
                </div>
            </div>
            {docItem.errorMsg && (
                 <p className="mt-3 text-xs text-red-500 font-medium flex items-center gap-1">
                    <AlertCircle size={12} />
                    {docItem.errorMsg}
                 </p>
            )}
        </div>
    );
};

// --- Main Component ---
const UploadDocuments: React.FC<UploadDocumentsProps> = ({ onBack, onNavigate, currentUser }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<QueuedDocument[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [areUsersLoading, setAreUsersLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  
  // Success state
  const [uploadComplete, setUploadComplete] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  
  // Load Users
  useEffect(() => {
    let unsubscribe: () => void;

    const fetchUsers = async () => {
        setAreUsersLoading(true);
        
        // Robust check for Admin role
        const isAdmin = currentUser.role === UserRole.ADMIN || (currentUser.role as string).toLowerCase() === 'admin';

        if (isAdmin) {
            try {
                const q = query(collection(db, 'users'));
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const loadedUsers: User[] = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        loadedUsers.push({
                            id: doc.id,
                            name: data.name || 'Unknown User',
                            email: data.email || '',
                            role: data.role as UserRole,
                            joinedAt: data.joinedAt,
                            docCount: data.docCount
                        });
                    });
                    
                    if (loadedUsers.length > 0) {
                        loadedUsers.sort((a, b) => a.name.localeCompare(b.name));
                        setUsersList(loadedUsers);
                    } else {
                        setUsersList([currentUser]);
                    }
                    setAreUsersLoading(false);
                }, (error) => {
                    if (error.code !== 'permission-denied') {
                        console.error("Error listening to users collection:", error);
                    }
                    setUsersList([currentUser]);
                    setAreUsersLoading(false);
                });
            } catch (error: any) {
                console.error("Error setting up user listener", error);
                setUsersList([currentUser]);
                setAreUsersLoading(false);
            }
        } else {
            setUsersList([currentUser]);
            setAreUsersLoading(false);
        }
    };

    fetchUsers();

    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  // Helper to convert file to Base64 for Firestore storage
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper: Convert payroll period (e.g. "Feb 2026") to a date string
  const getPeriodDateString = (payload: any): string => {
      try {
          const { payrollPeriod } = payload;
          if (!payrollPeriod || payrollPeriod === 'N/A') {
              return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
          // Parse period like "Feb 2026" -> first day of that month
          const [monthStr, yearStr] = payrollPeriod.trim().split(/\s+/);
          if (monthStr && yearStr) {
              const monthDate = new Date(`${monthStr} 1, ${yearStr}`);
              if (!isNaN(monthDate.getTime())) {
                  return monthDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
          }
      } catch (e) {
          console.warn("Period parsing failed, using current date", e);
      }
      return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const analyzeFile = async (docId: string, file: File) => {
      try {
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        
        // 1. Initial Metadata from Filename
        let title = fileNameWithoutExt.toUpperCase();
        let period = '';
        let amount = '';
        let matchedUserId = '';
        const fieldsFound: string[] = ['title'];

        // --- PDF Text Extraction ---
        let fullText = '';
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // Limit to first 2 pages for performance
            const maxPages = Math.min(pdf.numPages, 2);
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                const items: any[] = textContent.items.map((item: any) => ({
                    str: item.str,
                    x: item.transform[4],
                    y: item.transform[5], 
                    hasEOL: item.hasEOL
                }));

                // Sort by Y descending (top to bottom), then X ascending
                items.sort((a, b) => {
                    const yDiff = Math.abs(a.y - b.y);
                    if (yDiff < 8) { 
                        return a.x - b.x;
                    }
                    return b.y - a.y; 
                });

                const pageText = items.map(item => item.str).join(' ');
                fullText += pageText + ' ';
            }
        } catch (pdfError) {
            console.error("PDF Parsing Error:", pdfError);
        }

        const upperText = fullText.toUpperCase();
        const upperName = fileNameWithoutExt.toUpperCase();

        // --- 1. Amount Extraction (Net Pay) ---
        const netPayPatterns = [
            /(?:Net\s*Pay|Net\s*Amount|Take\s*Home|Net\s*Payable)(?![a-z]*\s*YTD)[^0-9]*?((?:GHC|GHS|GH₵|\$)?\s*[\d,]+\.\d{2})/i,
            /((?:GHC|GHS|GH₵|\$)?\s*[\d,]+\.\d{2})\s*(?:Net\s*Pay|Net\s*Amount|Take\s*Home)/i,
        ];

        for (const pattern of netPayPatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                let rawAmount = match[1];
                const cleanAmount = rawAmount.replace(/[^\d.]/g, '');
                
                if (cleanAmount) {
                    amount = cleanAmount;
                    fieldsFound.push('amount');
                    break;
                }
            }
        }

        // --- 2. Period Detection ---
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const fullMonths = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        
        const yearMatch = upperName.match(/20[2-3][0-9]/) || upperText.match(/20[2-3][0-9]/);
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

        let month = '';
        for (const m of fullMonths) {
            if (upperName.includes(m) || upperText.includes(m)) {
                month = m.substring(0, 3);
                break;
            }
        }
        if (!month) {
            for (const m of months) {
                if (upperName.includes(m) || (upperText.includes(` ${m} `) || upperText.includes(`${m} `) || upperText.includes(` ${m}`))) { 
                    month = m;
                    break;
                }
            }
        }
        
        if (month) {
            period = `${month.charAt(0) + month.slice(1).toLowerCase()} ${year}`;
            fieldsFound.push('period');
        }

        // --- 3. User Detection ---
        const sortedUsers = [...usersList].sort((a, b) => b.name.length - a.name.length);
        
        for (const user of sortedUsers) {
            if (upperName.includes(user.name.toUpperCase()) || upperText.includes(user.name.toUpperCase())) {
                matchedUserId = user.id;
                break;
            }
        }

        if (matchedUserId) fieldsFound.push('employee');

        if (!matchedUserId && usersList.length === 1) {
            matchedUserId = usersList[0].id;
        }

        setQueue(prev => prev.map(d => {
            if (d.id !== docId) return d;

            return {
                ...d,
                status: 'success',
                extractedFields: fieldsFound,
                amount: amount,
                period: period,
                title: title,
                selectedUserId: matchedUserId,
                manualName: '',
                isManualEntry: false
            };
        }));

      } catch (error) {
          console.error("System Analysis Failed", error);
          setQueue(prev => prev.map(d => d.id === docId ? { 
            ...d, 
            status: 'error', 
            errorMsg: "Automatic processing failed."
          } : d));
      }
  };

  useEffect(() => {
    const processQueue = async () => {
        if (analyzingDocId) return;
        const nextDoc = queue.find(d => d.status === 'pending');
        if (!nextDoc) return;

        setAnalyzingDocId(nextDoc.id);
        setQueue(prev => prev.map(d => d.id === nextDoc.id ? { ...d, status: 'analyzing' } : d));

        try {
            await analyzeFile(nextDoc.id, nextDoc.file);
        } finally {
            setTimeout(() => {
                setAnalyzingDocId(null);
            }, 500);
        }
    };

    processQueue();
  }, [queue, analyzingDocId, usersList]);

  const handleFiles = (files: FileList | null) => {
      if (!files) return;
      const newDocs: QueuedDocument[] = Array.from(files)
        .filter(f => f.type === 'application/pdf')
        .map(f => ({
            id: Math.random().toString(36).substr(2, 9),
            file: f,
            status: 'pending', 
            title: '',
            selectedUserId: usersList.length === 1 ? usersList[0].id : '',
            isManualEntry: false,
            manualName: '',
            manualEmail: '',
            docType: DocType.PAY_STUB,
            period: '',
            amount: '',
            extractedFields: []
        }));

      if (newDocs.length === 0) {
          alert("Only PDF files are supported.");
          return;
      }

      setQueue(prev => [...prev, ...newDocs]);
  };

  const handleUpdate = (id: string, updates: Partial<QueuedDocument>) => {
      setQueue(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const handleRemove = (id: string) => {
      setQueue(prev => prev.filter(d => d.id !== id));
  };

  const handleBulkUpload = async () => {
      const invalidDocs = queue.filter(d => 
          (!d.isManualEntry && !d.selectedUserId) || 
          (d.isManualEntry && (!d.manualName || !d.manualEmail))
      );

      if (invalidDocs.length > 0) {
          alert(`Please select an employee for all ${queue.length} documents.`);
          return;
      }

      setIsSubmitting(true);
      let localSuccessCount = 0;

      // Helper to wait
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      try {
          // Process sequentially
          for (const docItem of queue) {
                let selectedUser = usersList.find(u => u.id === docItem.selectedUserId);
                
                // Firestore limit check (approx 1MB limit for document)
                // We leave some buffer for metadata, so check if file is > 950KB
                if (docItem.file.size > 950 * 1024) {
                    alert(`Skipping ${docItem.file.name}: File size (${(docItem.file.size/1024).toFixed(0)}KB) exceeds Firestore limit of 950KB.`);
                    continue;
                }

                let fileDataUrl = '';
                
                try {
                    // Convert file to Base64 Data URI
                    fileDataUrl = await convertFileToBase64(docItem.file);
                } catch (conversionError) {
                    console.error("File conversion failed for " + docItem.file.name, conversionError);
                    alert(`Failed to process ${docItem.file.name}.`);
                    continue;
                }

                // Construct payload
                const newDoc = {
                    title: docItem.title || docItem.file.name,
                    company: 'Twinhill HQ',
                    employeeId: docItem.isManualEntry ? 'unknown' : (selectedUser?.id || 'unknown'), 
                    employeeName: docItem.isManualEntry ? docItem.manualName : (selectedUser?.name || 'Unknown'),
                    employeeEmail: docItem.isManualEntry ? docItem.manualEmail : (selectedUser?.email || ''),
                    uploadDate: getPeriodDateString({ payrollPeriod: docItem.period || 'N/A' }),
                    payrollPeriod: docItem.period || 'N/A',
                    amount: parseFloat(docItem.amount) || 0,
                    status: DocStatus.PROCESSED,
                    type: docItem.docType,
                    fileUrl: fileDataUrl, // Store Base64 directly in Firestore
                    storagePath: 'firestore_inline' // Flag to indicate inline storage
                };

                // Determine target collection
                if (!docItem.isManualEntry && selectedUser) {
                    try {
                        await addDoc(collection(db, 'users', selectedUser.id, 'documents'), newDoc);
                        try {
                            await updateDoc(doc(db, 'users', selectedUser.id), { docCount: increment(1) });
                        } catch (e) { /* ignore count error */ }
                        localSuccessCount++;
                    } catch (dbError: any) {
                         console.error("Database save failed", dbError);
                         if (dbError.code === 'resource-exhausted') {
                             alert(`Failed to save ${docItem.file.name}. The file might be too large for the database.`);
                         }
                    }
                } else {
                     console.warn("Manual entry skipping DB save as per structure requirements");
                }
          }
          
          if (localSuccessCount > 0) {
            setSuccessCount(localSuccessCount);
            setUploadComplete(true);
            setQueue([]); // Clear queue
          } else {
             alert("No documents were uploaded successfully.");
          }

      } catch (error: any) {
          console.error("Bulk upload error", error);
          alert("An unexpected error occurred during upload.");
      } finally {
          setIsSubmitting(false);
      }
  };

  if (uploadComplete) {
      return (
          <div className="max-w-xl mx-auto pt-16 text-center animate-in fade-in zoom-in duration-300">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 md:p-12">
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Upload Complete!</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">
                      Successfully processed and assigned <strong className="text-slate-900 dark:text-white">{successCount}</strong> documents to employees.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button 
                          onClick={() => {
                              setUploadComplete(false);
                              setSuccessCount(0);
                          }}
                          className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                      >
                          <Plus size={18} />
                          Upload More
                      </button>
                      <button 
                          onClick={() => onNavigate(ViewState.DOCUMENTS)}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200 dark:shadow-none"
                      >
                          <FileText size={18} />
                          View Documents
                      </button>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
        >
            <ArrowLeft size={20} />
        </button>
        <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Upload Documents</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Upload multiple PDFs and review extracted data</p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200">Database Storage Mode</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Files are now stored directly in the database. 
              <strong> Maximum file size is 950KB per document.</strong> Larger files will be skipped.
            </p>
          </div>
      </div>

      {queue.length === 0 ? (
          /* Empty State Dropzone */
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-10">
            <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                className={`border-2 border-dashed rounded-2xl p-12 md:p-20 flex flex-col items-center justify-center text-center transition-all duration-200 group ${
                    isDragging 
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 scale-[0.99]' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
            >
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-colors ${
                    isDragging ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-500'
                }`}>
                    <Upload size={32} strokeWidth={1.5} />
                </div>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Drag & drop PDFs here</h4>
                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto">
                    You can drop multiple files at once. The system will analyze each document automatically.
                </p>
                
                <label className="cursor-pointer">
                    <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                    <span className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-slate-200 dark:shadow-none transition-all transform active:scale-95 inline-flex items-center gap-2">
                        <Plus size={18} />
                        Select Files
                    </span>
                </label>
            </div>
        </div>
      ) : (
          <div className="space-y-6">
              {/* Toolbar */}
              <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm sticky top-4 z-20">
                  <div className="flex items-center gap-3">
                      <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-bold">
                          {queue.length} Files
                      </div>
                      <label className="cursor-pointer text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors">
                          <Plus size={16} />
                          Add more
                          <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                      </label>
                  </div>
                  <button 
                    onClick={handleBulkUpload}
                    disabled={isSubmitting}
                    className={`px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-green-200 dark:shadow-none transition-all transform active:scale-95 flex items-center gap-2 ${
                        isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#10b981] hover:bg-[#059669] text-white'
                    }`}
                  >
                     {isSubmitting ? (
                         <>
                            <Loader2 size={16} className="animate-spin" />
                            Uploading...
                         </>
                     ) : (
                         <>
                            <CheckCircle2 size={18} />
                            Upload All
                         </>
                     )}
                  </button>
              </div>

              {/* Grid of Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {queue.map((docItem) => (
                      <DocumentCard 
                        key={docItem.id} 
                        docItem={docItem} 
                        users={usersList}
                        areUsersLoading={areUsersLoading}
                        onUpdate={handleUpdate}
                        onRemove={handleRemove}
                      />
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default UploadDocuments;