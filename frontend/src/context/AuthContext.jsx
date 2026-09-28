import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export const ROLE_LABELS = {
  bd_manager: 'BD Manager (Desktop)',
  bd_executive: 'BD Executive (Mobile)',
  survey_manager: 'Survey Manager (Desktop)',
  survey_executive: 'Survey Executive (Mobile)',
};

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initUsers() {
      setLoading(true);
      try {
        const fetchedUsers = await api.getUsers();
        setUsers(fetchedUsers);

        const savedUserId = localStorage.getItem('sitescout_user_id');
        let matched = fetchedUsers.find((u) => u.id === savedUserId);

        if (!matched && fetchedUsers.length > 0) {
          // Default to first user (e.g. BD Manager)
          matched = fetchedUsers[0];
          localStorage.setItem('sitescout_user_id', matched.id);
        }

        setCurrentUser(matched || null);
        setError(null);
      } catch (err) {
        console.error('Failed to load users for persona switcher:', err);
        setError('Could not load seeded users. Please verify the backend is running.');
      } finally {
        setLoading(false);
      }
    }

    initUsers();
  }, []);

  const switchUser = (userId) => {
    const selected = users.find((u) => u.id === userId);
    if (selected) {
      localStorage.setItem('sitescout_user_id', selected.id);
      setCurrentUser(selected);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        users,
        currentUser,
        switchUser,
        loading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
