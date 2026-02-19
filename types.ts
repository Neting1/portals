export enum UserRole {
  ADMIN = 'Admin',
  EMPLOYEE = 'Employee'
}

export enum DocStatus {
  PENDING = 'Pending',
  PROCESSED = 'Processed',
  SENT = 'Sent',
  COMPLETE = 'Complete'
}

export enum DocType {
  PAY_STUB = 'Pay Stub',
  BONUS = 'Bonus',
  ALLOWANCE = 'Allowance'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  joinedAt: string;
  avatarUrl?: string;
  docCount: number;
}

export interface PayrollDocument {
  id: string;
  title: string;
  company: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  uploadDate: string;
  payrollPeriod: string;
  amount: number;
  status: DocStatus;
  type: DocType;
  fileUrl?: string;     // URL to download the file from Storage
  storagePath?: string; // Path in Storage (useful for deletion)
}

export interface ConcernResponse {
  id: string;
  authorId: string;
  authorName: string;
  role: UserRole;
  message: string;
  createdAt: string;
}

export interface Concern {
  id: string;
  employeeId: string;
  employeeName: string;
  subject: string;
  message: string;
  status: 'Open' | 'Resolved';
  createdAt: string;
  responses?: ConcernResponse[];
}

export interface AuditLogEntry {
  id: string;
  action: string; // e.g., 'ROLE_CHANGE'
  executorId: string;
  executorName: string;
  targetUserId: string;
  targetUserName: string;
  details: string;
  timestamp: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  UPLOAD = 'UPLOAD',
  USERS = 'USERS',
  DOCUMENTS = 'DOCUMENTS',
  CONCERNS = 'CONCERNS'
}