import React from 'react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { Store, UserCheck, MapPin } from 'lucide-react';

export default function Header() {
  const { users, currentUser, switchUser, loading } = useAuth();

  return (
    <header className="bg-brand-purple text-white shadow-md sticky top-0 z-50 w-full overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo & Platform Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-yellow flex items-center justify-center text-brand-purple shadow-sm shrink-0">
              <Store className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base sm:text-xl tracking-tight text-white whitespace-nowrap">
                  SAVO <span className="text-brand-yellow">SiteScout</span>
                </span>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-purple-dark text-brand-yellow border border-brand-yellow/30">
                  <MapPin className="w-3 h-3 mr-1 text-brand-yellow" />
                  Chennai Region
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-purple-200 hidden md:block">
                Retail Expansion Intelligence Platform
              </p>
            </div>
          </div>

          {/* Persona Switcher Dropdown */}
          <div className="flex items-center space-x-2 shrink min-w-0">
            <span className="text-xs text-purple-200 hidden md:inline">Active Persona:</span>
            <div className="relative max-w-[160px] sm:max-w-[260px] md:max-w-none">
              <select
                id="persona-switcher"
                value={currentUser ? currentUser.id : ''}
                onChange={(e) => switchUser(e.target.value)}
                disabled={loading || users.length === 0}
                className="w-full bg-brand-purple-dark text-white text-[11px] sm:text-sm font-medium rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 pr-7 border border-purple-400/30 focus:outline-none focus:ring-2 focus:ring-brand-yellow appearance-none cursor-pointer hover:bg-brand-purple-light transition shadow-inner truncate"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id} className="bg-white text-gray-900">
                    {user.name} ({ROLE_LABELS[user.role] || user.role})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-brand-yellow">
                <UserCheck className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Current Role Tag */}
            {currentUser && (
              <span className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-brand-yellow text-brand-purple uppercase tracking-wider shadow-sm shrink-0">
                {currentUser.role.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
