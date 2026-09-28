import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

export default function AnalysisProgressModal({ reportId, onComplete, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!reportId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const data = await api.getReport(reportId);
        if (!isMounted) return;
        setReport(data);

        if (data.status === 'done') {
          clearInterval(interval);
          setTimeout(() => {
            if (isMounted) onComplete(data);
          }, 800);
        } else if (data.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Failed to poll report status:', err);
        if (isMounted) setError('Unable to check report status.');
      }
    }, 1000); // Poll every 1s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [reportId, onComplete]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.retryReport(reportId);
      setError(null);
      setReport((prev) => ({ ...prev, status: 'queued', progress_message: 'Retry queued' }));
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetrying(false);
    }
  };

  const status = report?.status || 'queued';
  const progressMsg = report?.progress_message || 'Initializing spatial computation...';

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-200 text-center space-y-6">
        {/* Status Animation / Icon */}
        <div className="flex justify-center">
          {status === 'done' ? (
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>
          ) : status === 'failed' ? (
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-9 h-9" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-100 text-brand-purple flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
        </div>

        {/* Status Text */}
        <div className="space-y-1.5">
          <h3 className="text-xl font-extrabold text-gray-900">
            {status === 'done'
              ? 'Analysis Complete!'
              : status === 'failed'
              ? 'Analysis Failed'
              : 'Evaluating Area Fitness...'}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 font-medium">
            {status === 'failed' ? report?.error || 'An unexpected error occurred.' : progressMsg}
          </p>
        </div>

        {/* Progress Step Visualizer */}
        {status !== 'failed' && (
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                status === 'done'
                  ? 'w-full bg-emerald-500'
                  : progressMsg.includes('Writing')
                  ? 'w-4/5 bg-brand-purple'
                  : progressMsg.includes('hotspots')
                  ? 'w-3/5 bg-brand-purple'
                  : progressMsg.includes('Scoring')
                  ? 'w-2/5 bg-brand-purple'
                  : 'w-1/5 bg-brand-purple'
              }`}
            ></div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center pt-2">
          {status === 'failed' ? (
            <div className="flex space-x-3">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="px-4 py-2 bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-bold text-xs rounded-xl shadow-sm transition flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>Retry Analysis</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          ) : status === 'done' ? (
            <button
              onClick={() => onComplete(report)}
              className="px-5 py-2 bg-brand-purple text-brand-yellow font-extrabold text-xs rounded-xl shadow-sm transition"
            >
              View Report
            </button>
          ) : (
            <span className="text-[11px] text-gray-400">Processing PostGIS spatial joins and deterministic formulas...</span>
          )}
        </div>
      </div>
    </div>
  );
}
