import React, { useEffect, useState } from 'react';
import { PayrollDocument, DocStatus, ViewState, User, UserRole, DocType } from '../types';
import { CURRENCY_SYMBOL } from '../constants';
import StatsCard from '../components/StatsCard';
import { FileText, Users, DollarSign, Download, CheckCircle, AlertTriangle, Eye } from 'lucide-react';
import { db } from '../utils/firebase';
import { collection, getDocs, query, getCountFromServer, collectionGroup, doc, updateDoc } from 'firebase/firestore';

interface DashboardProps {
  onNavigate: (view: ViewState) => void;
  currentUser: User;
}

// --- Helpers ---

const parseDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    
    // Handle Firestore Timestamp (has toDate method)
    if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
        return dateInput.toDate();
    }
    
    // Handle Firestore Timestamp-like object (seconds)
    if (typeof dateInput === 'object' && 'seconds' in dateInput) {
        return new Date(dateInput.seconds * 1000);
    }

    // Handle String or Number
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) return d;
    
    return null;
};

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        // Remove currency symbols and commas, keep dots and numbers
        const clean = val.replace(/[^0-9.-]+/g, '');
        return parseFloat(clean) || 0;
    }
    return 0;
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, currentUser }) => {
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [employeesCount, setEmployeesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        setPermissionError(false);
        
        // 1. Fetch Documents
        try {
            let q;
            
            if (currentUser.role === UserRole.ADMIN) {
                q = query(collectionGroup(db, 'documents'));
            } else {
                q = query(collection(db, 'users', currentUser.id, 'documents'));
            }

            const querySnapshot = await getDocs(q);
            const loadedDocs: PayrollDocument[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                loadedDocs.push({
                    id: doc.id,
                    title: data.title || 'Untitled',
                    company: data.company || '',
                    employeeId: data.employeeId || '',
                    employeeName: data.employeeName || 'Unknown',
                    employeeEmail: data.employeeEmail || '',
                    uploadDate: data.uploadDate, 
                    payrollPeriod: data.payrollPeriod || '',
                    amount: parseAmount(data.amount),
                    status: (data.status as DocStatus) || DocStatus.PENDING,
                    type: (data.type as DocType) || DocType.PAY_STUB,
                    fileUrl: data.fileUrl,
                    storagePath: data.storagePath
                });
            });
            
            // Sort by uploadDate descending
            loadedDocs.sort((a, b) => {
                const dateA = parseDate(a.uploadDate) || new Date(0);
                const dateB = parseDate(b.uploadDate) || new Date(0);
                return dateB.getTime() - dateA.getTime();
            });
            
            setDocuments(loadedDocs);

        } catch (error: any) {
            console.error("Dashboard documents fetch failed:", error);
            if (error.code === 'permission-denied') {
                setPermissionError(true);
            }
        }

        // 2. Fetch Employees Count (Admin Only)
        if (currentUser.role === UserRole.ADMIN) {
            try {
                const usersRef = collection(db, 'users');
                const snapshot = await getCountFromServer(usersRef);
                setEmployeesCount(snapshot.data().count);
            } catch (error: any) {
                // Silently fail for stats
            }
        }

        setIsLoading(false);
    };

    fetchData();
  }, [currentUser]);

  const handleDownload = async (docItem: PayrollDocument) => {
      if (currentUser.role === UserRole.EMPLOYEE && docItem.status !== DocStatus.COMPLETE) {
          try {
              const docRef = doc(db, 'users', currentUser.id, 'documents', docItem.id);
              await updateDoc(docRef, { status: DocStatus.COMPLETE });

              setDocuments(prev => prev.map(d => 
                  d.id === docItem.id ? { ...d, status: DocStatus.COMPLETE } : d
              ));
          } catch (error) {
              console.error("Failed to update document status on download", error);
          }
      }
  };

  // --- Render ---

  const totalDocs = documents.length;
  const completeDocs = documents.filter(d => d.status === DocStatus.COMPLETE).length;
  const totalPayroll = documents.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {currentUser.role === UserRole.ADMIN ? 'Admin Dashboard' : 'My Payroll Dashboard'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {currentUser.role === UserRole.ADMIN ? 'Overview of all company payroll data' : 'Welcome back, view your latest payslips'}
          </p>
        </div>
        
        {currentUser.role === UserRole.ADMIN && (
            <button 
            onClick={() => onNavigate(ViewState.UPLOAD)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors w-full md:w-auto justify-center"
            >
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full hidden"></div>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Upload Documents
            </button>
        )}
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Database Access Denied</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              <strong>Action Required:</strong> Your account does not have permission to read documents. 
              If you are an Admin, please update the Firestore Security Rules.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          label={currentUser.role === UserRole.ADMIN ? "Total Documents" : "My Documents"} 
          value={isLoading ? '-' : totalDocs} 
          icon={FileText} 
          colorClass="bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100" 
          iconBgClass="bg-blue-600 text-white dark:bg-blue-500"
        />
        {currentUser.role === UserRole.ADMIN && (
             <StatsCard 
             label="Employees" 
             value={isLoading ? '-' : employeesCount} 
             icon={Users} 
             colorClass="bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100" 
             iconBgClass="bg-green-600 text-white dark:bg-green-500"
           />
        )}
       
        <StatsCard 
          label="Complete" 
          value={isLoading ? '-' : completeDocs} 
          icon={CheckCircle} 
          colorClass="bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100" 
          iconBgClass="bg-purple-600 text-white dark:bg-purple-500"
        />
        <StatsCard 
          label={currentUser.role === UserRole.ADMIN ? "Total Payout" : "Total Earned"}
          value={isLoading ? '-' : `${CURRENCY_SYMBOL}${totalPayroll.toLocaleString()}`} 
          icon={DollarSign} 
          colorClass="bg-indigo-50 text-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-100" 
          iconBgClass="bg-indigo-600 text-white dark:bg-indigo-500"
        />
      </div>

      {/* Recent Documents */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {currentUser.role === UserRole.ADMIN ? "All Recent Documents" : "Recent Documents"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Latest uploaded payroll documents</p>
          </div>
          <button 
             onClick={() => onNavigate(ViewState.DOCUMENTS)}
             className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full sm:w-auto">
            View All
          </button>
        </div>

        {isLoading ? (
            <div className="space-y-4">
                 {[1,2,3].map(i => (
                     <div key={i} className="h-20 bg-slate-50 dark:bg-slate-800 rounded-xl animate-pulse"></div>
                 ))}
            </div>
        ) : (
        <div className="space-y-4">
          {documents.slice(0, 5).map((doc) => (
            <div key={doc.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-transparent hover:border-blue-100 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-200 line-clamp-1">{doc.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {currentUser.role === UserRole.ADMIN && (
                        <>
                            <span className="font-medium text-blue-600 dark:text-blue-400">{doc.employeeName}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        </>
                    )}
                    <span>{doc.uploadDate}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{CURRENCY_SYMBOL}{doc.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-4 pl-14 sm:pl-0">
                <span className={`px-2.5 py-1 rounded text-xs font-semibold capitalize ${
                  doc.status === DocStatus.COMPLETE
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : doc.status === DocStatus.PROCESSED 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                    : doc.status === DocStatus.PENDING 
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                }`}>
                  {doc.status}
                </span>
                {doc.fileUrl ? (
                    <a 
                      href={doc.fileUrl} 
                      onClick={() => handleDownload(doc)}
                      download={`${doc.title}.pdf`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                      title="Download PDF"
                    >
                      <Download size={18} />
                    </a>
                ) : (
                    <button className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" disabled>
                      <Eye size={18} />
                    </button>
                )}
              </div>
            </div>
          ))}
          
          {documents.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  {isLoading ? 'Loading...' : (
                      <>
                        No documents found.
                        <br/>
                        {!permissionError && (
                            <span className="text-xs text-slate-400">
                                (If you see this and expect data, check console for errors)
                            </span>
                        )}
                      </>
                  )}
              </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;