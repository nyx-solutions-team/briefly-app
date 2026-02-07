"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Role } from '@/hooks/use-auth';

export type DirectoryUser = {
  username: string;
  displayName?: string;
  email?: string;
  role: Role;
  password: string; // demo only; do NOT use in production
  expiresAt?: string; // for guests
  allowedFolders?: string[][];
  allowedDocIds?: string[];
  departments?: { id: string; name: string; color?: string | null }[];
};

type UsersContextValue = {
  users: DirectoryUser[];
  addUser: (u: DirectoryUser) => void;
  removeUser: (username: string) => void;
  updateUser: (username: string, updater: (prev: DirectoryUser) => DirectoryUser) => void;
  findUser: (username: string) => DirectoryUser | undefined;
};

const STORAGE_KEY = 'documind_users_v1';

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);

  // Removed localStorage bootstrap (directory is demo-only and not persisted)

  // Removed local persistence; rely on backend auth and membership

  const addUser = useCallback((u: DirectoryUser) => {
    setUsers(prev => {
      if (prev.some(x => x.username.toLowerCase() === u.username.toLowerCase())) return prev;
      return [u, ...prev];
    });
  }, []);

  const removeUser = useCallback((username: string) => {
    setUsers(prev => prev.filter(u => u.username.toLowerCase() !== username.toLowerCase()));
  }, []);

  const updateUser = useCallback((username: string, updater: (prev: DirectoryUser) => DirectoryUser) => {
    setUsers(prev => prev.map(u => u.username.toLowerCase() === username.toLowerCase() ? updater(u) : u));
  }, []);

  const findUser = useCallback((username: string) => users.find(u => u.username.toLowerCase() === username.toLowerCase()), [users]);

  const value = useMemo(() => ({ users, addUser, removeUser, updateUser, findUser }), [users, addUser, removeUser, updateUser, findUser]);

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within a UsersProvider');
  return ctx;
}
