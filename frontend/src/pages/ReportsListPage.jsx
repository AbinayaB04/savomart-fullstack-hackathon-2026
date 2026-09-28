import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { LoadingSpinner, ErrorState, EmptyState } from '../components/UIState';
import CompareModal from '../components/CompareModal';
import { FileText, ArrowLeftRight, ChevronRight, PlusCircle, CheckSquare, Calendar, Award } from 'lucide-react';

const BAND_BADGES = {
  Excellent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Good: 'bg-blue-100 text-blue-800 border-blue-200',
  Fair: 'bg-amber-100 text-amber-800 border-amber-200',
  Poor: 'bg-red-100 text-red-800 border-red-200',
};

export default function ReportsListPage({ onSelectReport, onNewAnalysis }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [compareReportA, setCompareReportA] = useState(null);
  const [compareReportB, setCompareReportB] = useState(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReports();
      setReports(data || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setError('Could not load area fitness reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const toggleCompare = (reportId) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(reportId)) {
        return prev.filter((id) => id !== reportId);
      }
      if (prev.length >= 2) {
        return [prev[1], reportId];
      }
      return [...prev, reportId];
    });
  };

  const handleLaunchCompare = async () => {
    if (selectedForCompare.length !== 2) return;
    try {
      const [rA, rB] = await Promise.all([
        api.getReport(selectedForCompare[0]),
        api.getReport(selectedForCompare[1]),
      ]);
      setCompareReportA(rA);
      setCompareReportB(rB);
      setComparing(true);
    } catch (err) {
      console.error('Failed to load reports for compare:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-brand-purple">
              Intelligence Archive
            </span>
            <span className="text-xs text-gray-500">• Chennai Area Studies</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Area Fitness Reports</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Historical evaluations, explainable factor scores, and comparative analysis.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {selectedForCompare.length === 2 && (
            <button
              onClick={handleLaunchCompare}
              className="px-4 py-2 bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple font-extrabold text-xs sm:text-sm rounded-xl shadow-sm transition flex items-center space-x-2 animate-pulse"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Compare Selected (2)</span>
            </button>
          )}
          <button
            onClick={onNewAnalysis}
            className="px-4 py-2 bg-brand-purple hover:bg-brand-purple-dark text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition flex items-center space-x-2"
          >
            <PlusCircle className="w-4 h-4 text-brand-yellow" />
            <span>New Area Analysis</span>
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner message="Loading saved reports..." />}

      {error && <ErrorState message={error} onRetry={fetchReports} />}

      {!loading && !error && reports.length === 0 && (
        <EmptyState
          title="No Area Reports Yet"
          message="Select grid cells on the map and run an analysis to generate your first Area Fitness Report."
          icon={FileText}
        />
      )}

      {/* Reports List Table / Grid */}
      {!loading && !error && reports.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
          <div className="p-4 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between text-xs text-gray-500 font-semibold">
            <span>Select any 2 reports to compare side-by-side</span>
            <span>{selectedForCompare.length} of 2 selected</span>
          </div>

          {reports.map((rep) => {
            const isSelected = selectedForCompare.includes(rep.id);
            const bandClass = BAND_BADGES[rep.band] || 'bg-gray-100 text-gray-700';

            return (
              <div
                key={rep.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:bg-purple-50/30 ${
                  isSelected ? 'bg-purple-50/50' : ''
                }`}
              >
                {/* Left: Checkbox & Title */}
                <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCompare(rep.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-purple focus:ring-brand-purple cursor-pointer"
                  />
                  <div
                    onClick={() => onSelectReport(rep.id)}
                    className="cursor-pointer flex-1 min-w-0"
                  >
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-gray-900 hover:text-brand-purple transition truncate">
                        {rep.name}
                      </h3>
                      {rep.band && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${bandClass}`}>
                          {rep.band}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                        {rep.created_at ? new Date(rep.created_at).toLocaleDateString() : 'Recent'}
                      </span>
                      <span>•</span>
                      <span>{rep.cell_count || 1} cells ({( (rep.cell_count || 1) * 0.25).toFixed(2)} km²)</span>
                      <span>•</span>
                      <span>By {rep.created_by}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Score & Arrow */}
                <div className="flex items-center space-x-4 self-end sm:self-center">
                  <div className="text-right">
                    <div className="text-xl font-black text-brand-purple leading-none">
                      {rep.score !== null ? rep.score : '—'}
                      <span className="text-xs font-semibold text-gray-400">/100</span>
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                      Fitness Score
                    </span>
                  </div>
                  <button
                    onClick={() => onSelectReport(rep.id)}
                    className="p-2 bg-gray-100 hover:bg-brand-purple hover:text-brand-yellow rounded-xl transition text-gray-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare Modal */}
      {comparing && (
        <CompareModal
          reportA={compareReportA}
          reportB={compareReportB}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
