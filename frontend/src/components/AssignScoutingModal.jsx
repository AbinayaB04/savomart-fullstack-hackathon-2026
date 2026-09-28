import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { X, Send, UserCheck, MapPin, Sparkles, AlertCircle } from 'lucide-react';

export default function AssignScoutingModal({ hotspot, reportId, reportName, onClose, onSuccess }) {
  const [executives, setExecutives] = useState([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadExecutives() {
      try {
        setFetchingUsers(true);
        const users = await api.getUsers();
        const bdes = users.filter((u) => u.role === 'bd_executive');
        setExecutives(bdes);
        if (bdes.length > 0) {
          setSelectedExecutiveId(bdes[0].id);
        }
      } catch (err) {
        console.error('Failed to load executives:', err);
        setError('Could not load available BD Executives.');
      } finally {
        setFetchingUsers(false);
      }
    }
    loadExecutives();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedExecutiveId) {
      setError('Please select a BD Executive to assign.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.createScoutAssignment({
        report_id: reportId,
        hotspot: hotspot,
        cell_id: hotspot.cell_id,
        assigned_to: selectedExecutiveId,
        note: note.trim() || `Scout retail candidate properties near Hotspot #${hotspot.cell_id} in ${reportName || 'Chennai Area'}.`,
      });

      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (err) {
      console.error('Failed to dispatch assignment:', err);
      setError(err.message || 'Failed to dispatch scouting assignment.');
    } finally {
      setLoading(false);
    }
  };

  const centroid = hotspot?.centroid || [80.20, 13.00];

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-brand-purple to-brand-purple-dark text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-yellow/20 flex items-center justify-center text-brand-yellow border border-brand-yellow/40">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Dispatch Scouting Target</h2>
              <p className="text-xs text-purple-200">Assign a field executive to verify and onboard properties</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Hotspot Target Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-purple" />
                <span>Target Hotspot #{hotspot.cell_id}</span>
              </span>
              <span className="px-2 py-0.5 rounded-full font-black text-brand-purple bg-purple-100">
                Score: {hotspot.score}/100
              </span>
            </div>
            <p className="text-gray-600 italic">"{hotspot.reason}"</p>
            <div className="text-[11px] text-gray-500 font-mono">
              Coordinates: [{centroid[1].toFixed(5)}°N, {centroid[0].toFixed(5)}°E]
            </div>
          </div>

          {/* Assignee Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              Select BD Executive <span className="text-red-500">*</span>
            </label>
            {fetchingUsers ? (
              <div className="text-xs text-gray-500 italic py-2">Loading executives...</div>
            ) : (
              <select
                value={selectedExecutiveId}
                onChange={(e) => setSelectedExecutiveId(e.target.value)}
                required
                className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple"
              >
                {executives.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.name} ({exec.id}) - Mobile Field Executive
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Instructions / Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              Scouting Instructions & Priority Notes
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Target ground-floor spaces between 800-1500 sqft with >= 20 ft frontage along the main arterial avenue..."
              className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || fetchingUsers}
              className="px-5 py-2.5 text-xs font-extrabold text-brand-purple bg-brand-yellow hover:bg-yellow-400 rounded-xl shadow-md transition flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Dispatching...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
