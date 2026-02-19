import { User, PayrollDocument, Concern, UserRole } from '../types';

const USERS_KEY = 'twinhill_users';
const DOCS_KEY = 'twinhill_docs';
const CONCERNS_KEY = 'twinhill_concerns';
const SESSION_KEY = 'twinhill_session';

export const db = {
  getUsers: (): User[] => {
    try {
      const data = localStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading users from storage', e);
      return [];
    }
  },
  
  addUser: (user: User): void => {
    const users = db.getUsers();
    // Check if user exists to avoid duplicates in demo mode
    const exists = users.find(u => u.id === user.id);
    if (!exists) {
        users.push(user);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  },

  getDocuments: (): PayrollDocument[] => {
    try {
      const data = localStorage.getItem(DOCS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading documents from storage', e);
      return [];
    }
  },

  addDocument: (doc: PayrollDocument): void => {
    const docs = db.getDocuments();
    // Add simple ID if missing
    if (!doc.id) doc.id = Math.random().toString(36).substr(2, 9);
    docs.unshift(doc);
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  },

  getConcerns: (): Concern[] => {
    try {
      const data = localStorage.getItem(CONCERNS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  addConcern: (concern: Concern): void => {
    const concerns = db.getConcerns();
    if (!concern.id) concern.id = Math.random().toString(36).substr(2, 9);
    concerns.unshift(concern);
    localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns));
  },

  resolveConcern: (id: string): void => {
    const concerns = db.getConcerns();
    const index = concerns.findIndex(c => c.id === id);
    if (index !== -1) {
      concerns[index].status = 'Resolved';
      localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns));
    }
  },

  getSession: (): User | null => {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  setSession: (user: User | null): void => {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  },
  
  updateUserDocCount: (userId: string) => {
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].docCount = (users[userIndex].docCount || 0) + 1;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  },

  updateUserRole: (userId: string, newRole: UserRole) => {
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].role = newRole;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  }
};