import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Camera, MapPin, CheckCircle, Navigation2, FilePlus, ChevronRight } from 'lucide-react';

export default function SurveyExecutiveDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Mobile Header */}
      <div className="bg-brand-purple text-white p-5 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold text-brand-yellow tracking-wider">
            Survey Executive Mobile Terminal
          </span>
          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
            GPS Active
          </span>
        </div>
        <h1 className="text-xl font-bold mt-1">{currentUser?.name}</h1>
        <p className="text-xs text-purple-200 mt-0.5 flex items-center">
          <MapPin className="w-3.5 h-3.5 mr-1 text-brand-yellow" />
          Assigned Area: Velachery & Adyar Micro-catchments
        </p>

        {/* Capture Action */}
        <button className="mt-4 w-full py-3 bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple font-black text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2">
          <Camera className="w-5 h-5 stroke-[2.5]" />
          <span>Capture Lane-Level Survey Data</span>
        </button>
      </div>

      {/* Today's Tasks */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Assigned Lane Surveys</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-brand-purple">
            1 of 3 Complete
          </span>
        </div>

        <div className="space-y-3">
          {/* Active Lane */}
          <div className="p-4 rounded-xl border-2 border-brand-purple bg-purple-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-purple uppercase tracking-wider">Active Task</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-yellow text-brand-purple">In Progress</span>
            </div>
            <h3 className="text-sm font-bold text-gray-900">Lane 2: Sardar Patel Road South Service Lane</h3>
            <p className="text-xs text-gray-600">Walk 400m stretch. Log competitor storefronts, pedestrian count sample, and parking feasibility.</p>
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 flex items-center">
                <Navigation2 className="w-3.5 h-3.5 mr-1 text-brand-purple" />
                Est. 25 mins
              </span>
              <button className="px-3 py-1.5 bg-brand-purple text-brand-yellow font-bold text-xs rounded-lg shadow-sm">
                Open Form
              </button>
            </div>
          </div>

          {/* Pending Lane */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2 opacity-80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Up</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-700">Queued</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Lane 3: Gandhi Nagar 4th Main Road</h3>
            <p className="text-xs text-gray-500">Residential grocery shopping footfall and local kirana density check.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
