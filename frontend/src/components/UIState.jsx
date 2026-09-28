import React from 'react';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';

export function LoadingSpinner({ message = 'Loading intelligence data...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-3">
      <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
      <p className="text-sm font-medium text-gray-600">{message}</p>
    </div>
  );
}

export function ErrorState({ title = 'Error', message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5 my-4 max-w-lg mx-auto">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-red-800">{title}</h4>
          <p className="text-sm text-red-700 mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold rounded transition"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title = 'No Data Found', message = 'No records match your selection.', icon: Icon = Inbox }) {
  return (
    <div className="text-center py-10 px-4 bg-white border border-gray-200 rounded-xl my-4">
      <Icon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{message}</p>
    </div>
  );
}
