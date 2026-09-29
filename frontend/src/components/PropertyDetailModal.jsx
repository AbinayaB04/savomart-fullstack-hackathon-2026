import React, { useState } from 'react';
import { api } from '../services/api';
import {
  X,
  MapPin,
  Building,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  Shield,
  Layers,
  Sparkles,
  RefreshCw,
  User,
  Car,
  Eye,
  Maximize2,
  AlertCircle,
} from 'lucide-react';

const STAGE_LABELS = {
  scouted: 'Scouted',
  under_review: 'Under Review',
  proceed: 'Proceed',
  catchment_study: 'Catchment Study',
  approved: 'Approved',
  rejected: 'Rejected',
  on_hold: 'On Hold',
};

const STAGE_COLORS = {
  scouted: 'bg-blue-100 text-blue-800 border-blue-200',
  under_review: 'bg-purple-100 text-purple-800 border-purple-200',
  proceed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  catchment_study: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-green-100 text-green-900 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  on_hold: 'bg-gray-100 text-gray-800 border-gray-200',
};

const RECOMMENDATION_COLORS = {
  proceed: 'bg-emerald-500 text-white',
  review: 'bg-amber-500 text-white',
  reject: 'bg-red-500 text-white',
};

const ALLOWED_TRANSITIONS = {
  scouted: ['under_review', 'rejected', 'on_hold'],
  under_review: ['proceed', 'rejected', 'on_hold'],
  proceed: ['catchment_study', 'approved', 'rejected', 'on_hold'],
  catchment_study: ['approved', 'rejected', 'on_hold'],
  on_hold: ['under_review', 'proceed', 'rejected'],
  approved: ['rejected', 'on_hold'],
  rejected: ['under_review'],
};

export default function PropertyDetailModal({ property, onClose, onPropertyUpdated }) {
  const [activeProperty, setActiveProperty] = useState(property);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0);
  const [isMovingStage, setIsMovingStage] = useState(false);
  const [targetStage, setTargetStage] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [reevaluating, setReevaluating] = useState(false);
  const [error, setError] = useState(null);
  const [activePhoto, setActivePhoto] = useState(null);
  const [requestingStudy, setRequestingStudy] = useState(false);
  const [reuseBanner, setReuseBanner] = useState(null);

  const evaluations = activeProperty.evaluations || [];
  const currentEval = evaluations[selectedVersionIdx] || activeProperty.latest_evaluation;
  const photos = activeProperty.photos || [];
  const history = activeProperty.stage_history || [];
  const duplicates = activeProperty.nearby_duplicates || [];
  const catchmentStudy = activeProperty.catchment_study;

  const allowedNextStages = ALLOWED_TRANSITIONS[activeProperty.stage] || [];

  const handleRequestCatchmentStudy = async () => {
    try {
      setRequestingStudy(true);
      setError(null);
      setReuseBanner(null);

      const res = await api.createStudy({
        target_type: 'property',
        property_id: activeProperty.id,
        radius_m: 1000.0,
      });

      // Re-fetch fresh property data to get updated evaluations and catchment study
      const freshProp = await api.getProperty(activeProperty.id);
      setActiveProperty(freshProp);
      setSelectedVersionIdx(0);
      if (onPropertyUpdated) onPropertyUpdated(freshProp);

      if (res.reused) {
        setReuseBanner({
          isReused: true,
          message: res.reuse_message || `Reused study #${res.id}`,
          details: '6-Month Spatial Reuse rule applied (DECISIONS.md #15). Existing completed catchment study covered this location within 300m and was completed within 180 days. Insights copied and evaluation updated automatically without creating new tasks.',
        });
      } else {
        setReuseBanner({
          isReused: false,
          message: `Catchment study #${res.id} requested successfully.`,
          details: 'Study request has been dispatched to Survey Operations inbox for 500m grid cell splitting and balanced executive assignment.',
        });
      }
    } catch (err) {
      console.error('Failed to request catchment study:', err);
      setError(err.message || 'Failed to request catchment study.');
    } finally {
      setRequestingStudy(false);
    }
  };

  const handleMoveStage = async (e) => {
    e.preventDefault();
    if (!targetStage) {
      setError('Please select a target stage.');
      return;
    }
    if (!stageReason.trim()) {
      setError('A justification reason is required to move pipeline stage.');
      return;
    }

    try {
      setSubmittingStage(true);
      setError(null);
      const updated = await api.movePropertyStage(activeProperty.id, targetStage, stageReason);
      setActiveProperty(updated);
      setIsMovingStage(false);
      setTargetStage('');
      setStageReason('');
      if (onPropertyUpdated) onPropertyUpdated(updated);
    } catch (err) {
      console.error('Failed to move stage:', err);
      setError(err.message || 'Stage transition failed.');
    } finally {
      setSubmittingStage(false);
    }
  };

  const handleReevaluate = async () => {
    try {
      setReevaluating(true);
      setError(null);
      const updated = await api.reevaluateProperty(activeProperty.id);
      setActiveProperty(updated);
      setSelectedVersionIdx(0);
      if (onPropertyUpdated) onPropertyUpdated(updated);
    } catch (err) {
      console.error('Failed to reevaluate:', err);
      setError(err.message || 'Re-evaluation failed.');
    } finally {
      setReevaluating(false);
    }
  };


  return (
    <div className="fixed inset-0 z-[2400] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-purple to-brand-purple-dark text-white p-5 sm:p-6 flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${STAGE_COLORS[activeProperty.stage] || 'bg-white/20 text-white'}`}>
                {STAGE_LABELS[activeProperty.stage] || activeProperty.stage}
              </span>
              <span className="text-xs text-purple-200">
                Onboarded by <span className="font-semibold text-white">{activeProperty.created_by_name}</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">{activeProperty.title}</h1>
            <p className="text-xs text-purple-200 flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand-yellow" />
              <span>{activeProperty.address}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-8 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Duplicate Warning Banner */}
          {duplicates.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-xs text-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Nearby Property Notice:</span> {duplicates.length} other property submission(s) detected within 50 meters.
                <div className="mt-1 font-medium text-amber-700">
                  {duplicates.map((d) => `• ${d.title} (${d.distance_meters}m away, ${d.area_sqft} sqft)`).join(' ')}
                </div>
              </div>
            </div>
          )}

          {/* Top Grid: Key Specs & Score */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Score & Recommendation Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center space-y-3">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-brand-purple" />
                <span>SiteScout Fitness</span>
              </div>
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#782B90"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - (currentEval?.score || 0) / 100)}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-black text-brand-purple">
                    {currentEval ? currentEval.score : 'N/A'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold">/ 100</span>
                </div>
              </div>
              <div className="flex flex-col items-center space-y-1">
                {currentEval && (
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm ${RECOMMENDATION_COLORS[currentEval.recommendation] || 'bg-gray-600 text-white'}`}>
                    Recommendation: {currentEval.recommendation}
                  </span>
                )}
                <span className="text-[11px] text-gray-500 font-medium">
                  Confidence: <span className="font-bold text-gray-700 capitalize">{currentEval?.confidence || 'High'}</span>
                </span>
              </div>
            </div>

            {/* Property Physical Specs Card */}
            <div className="md:col-span-2 bg-white border border-gray-200 rounded-3xl p-5 grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs shadow-sm">
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Carpet Area</span>
                <div className="text-base font-black text-gray-900">{activeProperty.area_sqft} sqft</div>
                <span className="text-[10px] text-gray-400">Ground/Total</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Monthly Rent</span>
                <div className="text-base font-black text-brand-purple">
                  {activeProperty.rent_monthly ? `₹${activeProperty.rent_monthly.toLocaleString()}` : 'Not Specified'}
                </div>
                <span className="text-[10px] text-gray-500">
                  {activeProperty.rent_per_sqft ? `₹${activeProperty.rent_per_sqft}/sqft` : 'Low confidence'}
                </span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Frontage Width</span>
                <div className="text-base font-black text-gray-900">{activeProperty.frontage_ft} ft</div>
                <span className="text-[10px] text-gray-500">&gt;= 20 ft optimal</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Road Width</span>
                <div className="text-base font-black text-gray-900">{activeProperty.road_width_ft} ft</div>
                <span className="text-[10px] text-gray-500">Two-way access</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Parking Facilities</span>
                <div className="text-base font-black text-gray-900">
                  {activeProperty.parking_slots ? `${activeProperty.parking_slots} Slots` : activeProperty.parking ? 'Yes' : 'None'}
                </div>
                <span className="text-[10px] text-gray-500">On-premise</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <span className="text-gray-500 font-semibold">Road Visibility</span>
                <div className="text-base font-black text-yellow-600 flex items-center space-x-1">
                  <span>{'★'.repeat(activeProperty.visibility || 3)}</span>
                  <span className="text-gray-400 font-normal">({activeProperty.visibility}/5)</span>
                </div>
                <span className="text-[10px] text-gray-500">Approaching angle</span>
              </div>
            </div>
          </div>

          {/* Photos Carousel / Grid */}
          {photos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Storefront Photos ({photos.length})</h3>
              <div className="flex space-x-3 overflow-x-auto pb-2">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setActivePhoto(photo.photo_url)}
                    className="w-36 h-24 rounded-2xl overflow-hidden border border-gray-200 shrink-0 cursor-pointer hover:opacity-90 transition relative group"
                  >
                    <img src={photo.photo_url} alt={photo.caption || 'Storefront'} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Maximize2 className="w-4 h-4 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photo Lightbox */}
          {activePhoto && (
            <div
              onClick={() => setActivePhoto(null)}
              className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
            >
              <img src={activePhoto} alt="Storefront Highres" className="max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl object-contain" />
            </div>
          )}

          {/* 6-Month Spatial Reuse or Study Request Notice Banner */}
          {reuseBanner && (
            <div className={`p-4 rounded-2xl border text-xs space-y-1.5 animate-fade-in ${
              reuseBanner.isReused
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-purple-50 border-purple-200 text-purple-900'
            }`}>
              <div className="flex items-center space-x-2 font-black text-sm">
                <Sparkles className="w-4 h-4 text-brand-purple" />
                <span>{reuseBanner.message}</span>
              </div>
              <p className="text-xs opacity-90">{reuseBanner.details}</p>
            </div>
          )}

          {/* Catchment Study Operations & Survey Ground Truth Card */}
          {catchmentStudy && (
            <div className="bg-gradient-to-br from-purple-50/70 to-amber-50/40 border-2 border-brand-purple/20 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-brand-purple text-brand-yellow">
                      Catchment Study Operations
                    </span>
                    <span className="text-xs font-bold text-gray-500">#{catchmentStudy.id}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-gray-900">
                    Field Survey Ground-Truth Intelligence
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  {catchmentStudy.reused_from_request_id && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                      <span>⚡ 6-Mo Spatial Reuse</span>
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    catchmentStudy.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {catchmentStudy.status}
                  </span>
                </div>
              </div>

              {catchmentStudy.reuse_reason && (
                <div className="p-3 bg-white/80 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center space-x-2">
                  <span className="text-amber-600 font-black">⚡ Reuse Audit:</span>
                  <span>{catchmentStudy.reuse_reason}</span>
                </div>
              )}

              {/* Rolled-up Survey Insights */}
              {catchmentStudy.insights && Object.keys(catchmentStudy.insights).length > 0 ? (
                <div className="space-y-3.5">
                  <p className="text-xs sm:text-sm text-gray-800 font-medium leading-relaxed bg-white/70 p-3 rounded-xl border border-purple-100">
                    {catchmentStudy.insights.summary}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xl/5">
                      <span className="text-gray-500 font-bold block">10-Min Footfall</span>
                      <div className="text-base font-black text-brand-purple mt-0.5">
                        {catchmentStudy.insights.avg_footfall_10min || 0} avg
                      </div>
                      <span className="text-[10px] text-gray-400">Total: {catchmentStudy.insights.total_footfall_10min || 0}</span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xl/5">
                      <span className="text-gray-500 font-bold block">Peak-Hour Footfall</span>
                      <div className="text-base font-black text-emerald-600 mt-0.5">
                        ~{catchmentStudy.insights.avg_peak_hour_estimate || 0} /hr
                      </div>
                      <span className="text-[10px] text-gray-400">Ground verified</span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xl/5">
                      <span className="text-gray-500 font-bold block">Competitors Seen</span>
                      <div className="text-base font-black text-rose-600 mt-0.5">
                        {catchmentStudy.insights.competitor_count || 0} Outlets
                      </div>
                      <span className="text-[10px] text-gray-400">In immediate lanes</span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xl/5">
                      <span className="text-gray-500 font-bold block">Dominant Housing</span>
                      <div className="text-base font-black text-gray-900 mt-0.5 capitalize">
                        {catchmentStudy.insights.dominant_household_type || 'Mixed'}
                      </div>
                      <span className="text-[10px] text-gray-400">Catchment demographic</span>
                    </div>
                  </div>

                  {/* Lane Suitability & Shop Mix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1.5">
                      <span className="font-bold text-gray-700">Lane Suitability</span>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-800 font-semibold">
                          Avg Lane Width: {catchmentStudy.insights.avg_lane_width_ft || 0} ft
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-800 font-semibold">
                          Street Lighting: {catchmentStudy.insights.street_lighting_pct || 0}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1.5">
                      <span className="font-bold text-gray-700">Retail & Shop Mix</span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        {catchmentStudy.insights.shop_mix && Object.entries(catchmentStudy.insights.shop_mix).map(([type, count]) => (
                          <span key={type} className="px-2 py-0.5 bg-purple-50 text-brand-purple rounded-md font-bold border border-purple-100 capitalize">
                            {type}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Competitor Stores List */}
                  {catchmentStudy.insights.competitors && catchmentStudy.insights.competitors.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Ground-Surveyed Competitor Outlets ({catchmentStudy.insights.competitors.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {catchmentStudy.insights.competitors.map((comp, idx) => (
                          <div key={idx} className="p-2 bg-white rounded-lg border border-gray-200 text-xs flex items-center space-x-2 shadow-sm">
                            <span className="font-bold text-gray-900">{comp.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 capitalize">{comp.type || 'grocery'}</span>
                            {comp.approx_size && <span className="text-[10px] text-gray-400">({comp.approx_size})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 font-semibold">Field Survey Progress:</span>
                    <span className="font-extrabold text-brand-purple">
                      {catchmentStudy.submitted_tasks} of {catchmentStudy.total_tasks} tasks submitted ({catchmentStudy.progress_percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-purple transition-all duration-500 rounded-full"
                      style={{ width: `${catchmentStudy.progress_percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evaluation Narrative & Version Control */}
          {currentEval && (
            <div className="bg-purple-50/40 border border-brand-purple/20 rounded-3xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-brand-purple uppercase tracking-wider flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Executive Evaluation Summary</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-yellow text-brand-purple border border-brand-yellow">
                    {currentEval.summary_source === 'llm' ? 'AI Synthesized' : 'Deterministic Template'}
                  </span>
                  {(currentEval.version > 1 || currentEval.breakdown?.catchment?.survey_validated || catchmentStudy?.status === 'completed') && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1 shadow-sm">
                      <span>Updated after catchment study</span>
                    </span>
                  )}
                </div>

                {/* Version Selector */}
                {evaluations.length > 1 && (
                  <div className="flex items-center space-x-1 text-xs">
                    <span className="text-gray-500 font-semibold">Version:</span>
                    <select
                      value={selectedVersionIdx}
                      onChange={(e) => setSelectedVersionIdx(Number(e.target.value))}
                      className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold text-brand-purple focus:outline-none"
                    >
                      {evaluations.map((ev, i) => (
                        <option key={ev.id} value={i}>
                          v{ev.version} ({new Date(ev.created_at).toLocaleDateString()}) - {ev.score} pts {i === 0 && ev.version > 1 ? '(Post-Survey)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="text-xs sm:text-sm text-gray-800 leading-relaxed font-medium">
                {currentEval.summary}
              </p>

              {/* Insights & Risks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Positive Insights */}
                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-emerald-800 flex items-center space-x-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Commercial Strengths</span>
                  </span>
                  <ul className="space-y-1.5 text-xs text-emerald-950">
                    {currentEval.insights?.map((ins, i) => (
                      <li key={i} className="flex items-start space-x-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Identified Risks */}
                <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-rose-800 flex items-center space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Identified Risks</span>
                  </span>
                  <ul className="space-y-1.5 text-xs text-rose-950">
                    {currentEval.risks?.map((risk, i) => (
                      <li key={i} className="flex items-start space-x-1.5">
                        <span className="text-rose-500 font-bold">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}


          {/* Audit Stage History Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-purple" />
              <span>Pipeline Stage Progression Audit Trail</span>
            </h3>

            <div className="space-y-2.5">
              {history.map((hist, i) => (
                <div key={hist.id} className="p-3 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2 font-bold text-gray-900">
                      <span className="capitalize">{hist.from_stage || 'Created'}</span>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className="text-brand-purple font-extrabold capitalize">{hist.to_stage}</span>
                      <span className="text-gray-400 font-normal">by {hist.changed_by_name}</span>
                    </div>
                    <p className="text-gray-600 italic">"{hist.reason}"</p>
                  </div>
                  <div className="text-[11px] text-gray-400 sm:text-right shrink-0">
                    {new Date(hist.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleReevaluate}
              disabled={reevaluating}
              className="px-3.5 py-2 text-xs font-bold text-gray-700 hover:text-brand-purple hover:bg-purple-50 rounded-xl border border-gray-300 transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reevaluating ? 'animate-spin' : ''}`} />
              <span>{reevaluating ? 'Re-scoring...' : 'Re-evaluate Site'}</span>
            </button>

            <button
              id="btn-request-catchment-study"
              onClick={handleRequestCatchmentStudy}
              disabled={requestingStudy}
              className="px-4 py-2 text-xs font-black text-brand-purple bg-brand-yellow hover:bg-yellow-400 border border-brand-yellow rounded-xl shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${requestingStudy ? 'animate-spin' : ''}`} />
              <span>{requestingStudy ? 'Checking 6-Mo Reuse...' : 'Request Catchment Study'}</span>
            </button>
          </div>


          <div className="flex items-center space-x-3">
            {allowedNextStages.length > 0 && (
              <button
                onClick={() => setIsMovingStage(true)}
                className="px-5 py-2.5 bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-extrabold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5"
              >
                <span>Move Pipeline Stage</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Move Stage Modal Prompt */}
        {isMovingStage && (
          <div className="fixed inset-0 z-[2600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-gray-900">Progress Pipeline Stage</h3>
                <button onClick={() => setIsMovingStage(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleMoveStage} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Target Stage</label>
                  <select
                    value={targetStage}
                    onChange={(e) => setTargetStage(e.target.value)}
                    required
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 font-bold text-brand-purple focus:outline-none focus:ring-2 focus:ring-brand-purple"
                  >
                    <option value="">Select next stage...</option>
                    {allowedNextStages.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Decision Reason & Justification <span className="text-red-500">* (Mandatory)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={stageReason}
                    onChange={(e) => setStageReason(e.target.value)}
                    required
                    placeholder="Provide commercial justification (e.g. Favorable lease rate, excellent road frontage, and minimal competition justify moving to Proceed for catchment survey)..."
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-purple"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsMovingStage(false)}
                    className="px-4 py-2 font-bold text-gray-600 hover:text-gray-900 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingStage}
                    className="px-5 py-2 font-black text-brand-purple bg-brand-yellow hover:bg-yellow-400 rounded-xl shadow transition disabled:opacity-50"
                  >
                    {submittingStage ? 'Recording...' : 'Confirm Stage Move'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
