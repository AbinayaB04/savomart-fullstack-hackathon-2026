import React from 'react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { Store, UserCheck, MapPin } from 'lucide-react';

export default function Header() {
  const { users, currentUser, switchUser, loading } = useAuth();

  return (
    <header className="bg-brand-purple text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-yellow flex items-center justify-center text-brand-purple shadow-sm">
              <Store className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">
                  SAVO <span className="text-brand-yellow">SiteScout</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-purple-dark text-brand-yellow border border-brand-yellow/30">
                  <MapPin className="w-3 h-3 mr-1 text-brand-yellow" />
                  Chennai Region
                </span>
              </div>
              <p className="text-[11px] text-purple-200 hidden md:block">
                Retail Expansion Intelligence Platform
              </p>
            </div>
          </div>

          {/* Persona Switcher Dropdown */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-purple-200 hidden sm:inline">Active Persona:</span>
              <div className="relative">
                <select
                  id="persona-switcher"
                  value={currentUser ? currentUser.id : ''}
                  onChange={(e) => switchUser(e.target.value)}
                  disabled={loading || users.length === 0}
                  className="bg-brand-purple-dark text-white text-xs sm:text-sm font-medium rounded-lg px-3 py-2 pr-8 border border-purple-400/30 focus:outline-none focus:ring-2 focus:ring-brand-yellow appearance-none cursor-pointer hover:bg-brand-purple-light transition shadow-inner"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id} className="bg-white text-gray-900">
                      {user.name} ({ROLE_LABELS[user.role] || user.role})
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-brand-yellow">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Current Role Tag */}
            {currentUser && (
              <span className="hidden lg:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-brand-yellow text-brand-purple uppercase tracking-wider shadow-sm">
                {currentUser.role.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
