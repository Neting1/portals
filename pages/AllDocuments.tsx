import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, FileText, Search, Eye, RefreshCw, CheckSquare, Square, CheckCircle2, X, Trash2 } from 'lucide-react';
import { CURRENCY_SYMBOL } from '../constants';
import { DocStatus, DocType, User, UserRole, PayrollDocument } from '../types';
import { db } from '../utils/firebase';
import { collection, getDocs, query, writeBatch, doc, updateDoc, collectionGroup, deleteDoc } from 'firebase/firestore';
import { storage } from '../utils/firebase';
import { ref, deleteObject } from 'firebase/storage';

interface AllDocumentsProps {
    onBack: () => void;
    currentUser: User;
}

const AllDocuments: React.FC<AllDocumentsProps> = ({ onBack, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All Types');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [currentUser]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    // Clear selection on refresh
    setSelectedIds(new Set());
    
    try {
        let q;
        if (currentUser.role === UserRole.ADMIN) {
            // Admin: Fetch ALL documents across the system
            q = query(collectionGroup(db, 'documents'));
        } else {
            // Employee: Fetch only their own documents
            const docsRef = collection(db, 'users', currentUser.id, 'documents');
            q = query(docsRef); 
        }

        const querySnapshot = await getDocs(q);
        const loadedDocs: PayrollDocument[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            loadedDocs.push({
                id: doc.id,
                title: data.title,
                company: data.company,
                employeeId: data.employeeId,
                employeeName: data.employeeName,
                employeeEmail: data.employeeEmail,
                uploadDate: data.uploadDate,
                payrollPeriod: data.payrollPeriod,
                amount: data.amount,
                status: data.status as DocStatus,
                type: data.type,
                fileUrl: data.fileUrl,
                storagePath: data.storagePath
            });
        });
        loadedDocs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        setDocuments(loadedDocs);
    } catch (error: any) {
        if (error.code !== 'permission-denied') {
             console.warn("Error loading documents:", error);
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleDownload = async (docItem: PayrollDocument) => {
      // Logic: If an Employee downloads a processed/sent file, mark it as Complete
      if (currentUser.role === UserRole.EMPLOYEE && docItem.status !== DocStatus.COMPLETE) {
          try {
              // 1. Update Firestore
              const docRef = doc(db, 'users', currentUser.id, 'documents', docItem.id);
              await updateDoc(docRef, { status: DocStatus.COMPLETE });

              // 2. Optimistic UI Update
              setDocuments(prev => prev.map(d => 
                  d.id === docItem.id ? { ...d, status: DocStatus.COMPLETE } : d
              ));
          } catch (error) {
              console.error("Failed to update document status on download", error);
          }
      }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.employeeEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'All Types' || doc.type === typeFilter;
    const matchesStatus = statusFilter === 'All Status' || doc.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // --- Bulk Action Logic ---

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length && filteredDocs.length > 0) {
        setSelectedIds(new Set());
    } else {
        const newSet = new Set(filteredDocs.map(d => d.id));
        setSelectedIds(newSet);
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkExport = () => {
    const selectedDocs = documents.filter(d => selectedIds.has(d.id));
    if (selectedDocs.length === 0) return;

    // CSV Headers
    const headers = ['ID', 'Title', 'Type', 'Amount', 'Date', 'Period', 'Status', 'Employee Name', 'Employee Email'];
    
    // CSV Rows
    const rows = selectedDocs.map(doc => [
        doc.id,
        `"${doc.title}"`, // Quote strings to handle commas
        doc.type,
        doc.amount,
        doc.uploadDate,
        `"${doc.payrollPeriod}"`,
        doc.status,
        `"${doc.employeeName}"`,
        doc.employeeEmail
    ]);

    const csvContent = [
        headers.join(','), 
        ...rows.map(row => row.join(','))
    ].join('\n');

    // Create Download Link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `payroll_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkMarkProcessed = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);

    try {
        const batch = writeBatch(db);
        
        selectedIds.forEach(id => {
            // Note: For admins, we need to know the userId of the document owner to update it.
            // Since the existing structure stores `employeeId`, we can reconstruct the path:
            // users/{employeeId}/documents/{docId}
            
            const docItem = documents.find(d => d.id === id);
            if (docItem) {
                 const docRef = doc(db, 'users', docItem.employeeId, 'documents', id);
                 batch.update(docRef, { status: DocStatus.PROCESSED });
            }
        });

        await batch.commit();

        // Optimistic UI Update
        setDocuments(prev => prev.map(d => 
            selectedIds.has(d.id) ? { ...d, status: DocStatus.PROCESSED } : d
        ));
        
        // Clear selection
        setSelectedIds(new Set());

    } catch (error) {
        console.error("Bulk update failed:", error);
        alert("Failed to update documents. Please check your connection.");
    } finally {
        setIsBulkProcessing(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const docItem = documents.find(d => d.id === docId);
    if (!docItem) return;

    if (!window.confirm(`Are you sure you want to delete "${docItem.title}"? This action cannot be undone.`)) {
        return;
    }

    try {
        // 1. Delete file from Storage if path exists
        if (docItem.storagePath) {
            try {
                const fileRef = ref(storage, docItem.storagePath);
                await deleteObject(fileRef);
            } catch (storageError: any) {
                // If storage file doesn't exist, continue with Firestore deletion
                if (storageError.code !== 'storage/object-not-found') {
                    console.warn('Storage deletion warning:', storageError);
                }
            }
        }

        // 2. Delete Firestore document
        const docRef = doc(db, 'users', docItem.employeeId, 'documents', docId);
        await deleteDoc(docRef);

        // 3. Optimistic UI Update
        setDocuments(prev => prev.filter(d => d.id !== docId));
        
        // Remove from selection if selected
        const newSet = new Set(selectedIds);
        newSet.delete(docId);
        setSelectedIds(newSet);

    } catch (error) {
        console.error("Delete failed:", error);
        alert("Failed to delete document. Please check your connection.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} document(s)? This action cannot be undone.`)) {
        return;
    }

    setIsBulkProcessing(true);

    try {
        const deletePromises = Array.from(selectedIds).map(id => handleDeleteDocument(id));
        await Promise.all(deletePromises);
        
        // Clear selection
        setSelectedIds(new Set());

    } catch (error) {
        console.error("Bulk delete failed:", error);
        alert("Failed to delete some documents. Please try again.");
    } finally {
        setIsBulkProcessing(false);
    }
  };

  const total = documents.length;
  const pending = documents.filter(d => d.status === DocStatus.PENDING).length;
  const processed = documents.filter(d => d.status === DocStatus.PROCESSED).length;
  const sent = documents.filter(d => d.status === DocStatus.SENT).length;
  const isAllSelected = filteredDocs.length > 0 && selectedIds.size === filteredDocs.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative pb-20">
       {/* Header */}
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <button 
                onClick={onBack}
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
                <ArrowLeft size={20} />
            </button>
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {currentUser.role === UserRole.ADMIN ? 'All Company Documents' : 'My Documents'}
                </h2>
                <p className="text-slate-500 dark:text-slate-400">
                    {currentUser.role === UserRole.ADMIN ? 'Manage all employee payroll documents' : 'View and manage your payslips'}
                </p>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={fetchDocuments}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2.5 rounded-lg transition-colors"
                title="Refresh"
            >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            {currentUser.role === UserRole.ADMIN && (
                <button 
                    onClick={() => {
                        const docsToExport = selectedIds.size > 0 
                            ? documents.filter(d => selectedIds.has(d.id)) 
                            : filteredDocs;
                        
                        if (docsToExport.length > 0) handleBulkExport();
                        else alert("No documents to export.");
                    }}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
                >
                    <Download size={16} />
                    <span className="hidden sm:inline">Export CSV</span>
                </button>
            )}
        </div>
      </div>

       {/* Stats Overview */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center border border-blue-100 dark:border-blue-800">
                <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">{total}</h3>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-center border border-orange-100 dark:border-orange-800">
                <h3 className="text-2xl font-bold text-orange-700 dark:text-orange-300">{pending}</h3>
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Pending</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-800/20 rounded-xl p-4 text-center border border-blue-200 dark:border-blue-700">
                <h3 className="text-2xl font-bold text-blue-800 dark:text-blue-200">{processed}</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Processed</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center border border-green-100 dark:border-green-800">
                <h3 className="text-2xl font-bold text-green-700 dark:text-green-300">{sent}</h3>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Sent</p>
            </div>
       </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 space-y-4 transition-colors">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold mb-2">
            <Search size={18} />
            <h3>Search & Filter Documents</h3>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
            {/* Select All Checkbox Wrapper */}
            <div className="flex items-center">
                <button 
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    {isAllSelected ? (
                        <CheckSquare size={20} className="text-blue-600 dark:text-blue-400" />
                    ) : (
                        <Square size={20} className="text-slate-400" />
                    )}
                    Select All
                </button>
            </div>

            <input 
                type="text" 
                placeholder={currentUser.role === UserRole.ADMIN ? "Search by title, employee name or email..." : "Search by title..."}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
                {['All Types', DocType.PAY_STUB, DocType.BONUS].map(t => (
                    <button 
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
                            typeFilter === t 
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100' 
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
                {['All Status', DocStatus.PENDING, DocStatus.SENT, DocStatus.COMPLETE].map(s => (
                    <button 
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
                            statusFilter === s 
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100' 
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 transition-colors">
        <h3 className="font-bold text-slate-900 dark:text-white mb-6">Documents ({filteredDocs.length})</h3>
        
        {isLoading && documents.length === 0 ? (
            <div className="space-y-4">
                 {[1,2,3,4].map(i => (
                     <div key={i} className="h-24 bg-slate-50 dark:bg-slate-800 rounded-xl animate-pulse"></div>
                 ))}
            </div>
        ) : (
        <div className="space-y-4">
        {filteredDocs.map((doc) => {
            const isSelected = selectedIds.has(doc.id);
            return (
                <div 
                    key={doc.id} 
                    className={`flex flex-col lg:flex-row lg:items-center justify-between p-5 rounded-xl border transition-all gap-4 ${
                        isSelected 
                        ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' 
                        : 'bg-slate-50 dark:bg-slate-800/50 border-transparent hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/20'
                    }`}
                >
                <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button 
                        onClick={() => toggleSelectOne(doc.id)}
                        className="mt-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {isSelected ? (
                            <CheckSquare size={24} className="text-blue-600 dark:text-blue-400" />
                        ) : (
                            <Square size={24} />
                        )}
                    </button>

                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
                    <FileText size={24} />
                    </div>
                    <div>
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                        <h4 className="font-bold text-slate-900 dark:text-slate-200 text-lg line-clamp-1">{doc.title}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
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
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        {currentUser.role === UserRole.ADMIN && (
                            <>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{doc.employeeName}</span>
                                <span className="hidden sm:inline">•</span>
                            </>
                        )}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{doc.company}</span>
                        <span className="hidden sm:inline">•</span>
                        <span>{doc.employeeEmail}</span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500">📅</span> {doc.uploadDate}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded font-medium">{doc.type}</span>
                        <span className="text-slate-400 dark:text-slate-500">{doc.payrollPeriod}</span>
                    </div>
                    </div>
                </div>
                
                <div className="flex items-center justify-between lg:justify-end gap-3 pl-16 lg:pl-0 mt-2 lg:mt-0 flex-wrap">
                    <div className="font-bold text-green-700 dark:text-green-400 text-lg">{CURRENCY_SYMBOL}{doc.amount.toLocaleString()}</div>
                    
                    {doc.fileUrl ? (
                        <a 
                            href={doc.fileUrl} 
                            onClick={() => handleDownload(doc)}
                            download={`${doc.title}.pdf`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
                        >
                            <Download size={16} />
                            Download
                        </a>
                    ) : (
                        <button disabled className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed">
                            <Eye size={16} />
                            Preview
                        </button>
                    )}

                    {currentUser.role === UserRole.ADMIN && (
                        <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-sm font-medium transition-colors"
                            title="Delete document"
                        >
                            <Trash2 size={16} />
                            <span className="hidden sm:inline">Delete</span>
                        </button>
                    )}
                </div>
                </div>
            );
        })}

            {filteredDocs.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    No documents found matching filters.
                </div>
            )}
        </div>
        )}
      </div>

      {/* Floating Action Bar for Bulk Selection */}
      {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 dark:bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 z-50 animate-in slide-in-from-bottom-6 border border-slate-700">
              <div className="flex items-center gap-3 font-medium border-r border-slate-700 pr-6">
                  <div className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {selectedIds.size}
                  </div>
                  <span>Selected</span>
              </div>
              
              <div className="flex items-center gap-4 flex-wrap">
                  <button 
                    onClick={handleBulkExport}
                    className="flex items-center gap-2 hover:text-blue-400 transition-colors"
                  >
                      <Download size={18} />
                      Export CSV
                  </button>
                  {currentUser.role === UserRole.ADMIN && (
                    <>
                      <button 
                          onClick={handleBulkMarkProcessed}
                          disabled={isBulkProcessing}
                          className="flex items-center gap-2 hover:text-green-400 transition-colors disabled:opacity-50"
                      >
                          {isBulkProcessing ? (
                              <RefreshCw size={18} className="animate-spin" />
                          ) : (
                              <CheckCircle2 size={18} />
                          )}
                          Mark Processed
                      </button>
                      <button 
                          onClick={handleBulkDelete}
                          disabled={isBulkProcessing}
                          className="flex items-center gap-2 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                          {isBulkProcessing ? (
                              <RefreshCw size={18} className="animate-spin" />
                          ) : (
                              <Trash2 size={18} />
                          )}
                          Delete
                      </button>
                    </>
                  )}
              </div>

              <button 
                onClick={() => setSelectedIds(new Set())}
                className="ml-4 p-1 rounded-full hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 transition-colors"
              >
                  <X size={20} />
              </button>
          </div>
      )}
    </div>
  );
};

export default AllDocuments;