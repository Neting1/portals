import { LayoutDashboard, UploadCloud, Users, FileText, MessageSquare } from 'lucide-react';
import { ViewState } from './types';

export const CURRENCY_SYMBOL = 'GH₵';

export const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, view: ViewState.DASHBOARD },
  { label: 'Upload Documents', icon: UploadCloud, view: ViewState.UPLOAD },
  { label: 'Manage Users', icon: Users, view: ViewState.USERS },
  { label: 'All Documents', icon: FileText, view: ViewState.DOCUMENTS },
  { label: 'Support & Concerns', icon: MessageSquare, view: ViewState.CONCERNS },
];