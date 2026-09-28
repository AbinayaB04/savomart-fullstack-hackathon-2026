import React from 'react';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';
import { ClipboardList, Users, SplitSquareVertical, CheckCircle2, ArrowRight } from 'lucide-react';

export default function SurveyManagerDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
              Survey Operations Lead
            </span>
            <span className="text-xs text-gray-500">• Field Catchment Hub</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">
            Catchment Survey Management
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Coordinator: <span className="font-semibold text-brand-purple">{currentUser?.name}</span>. Review incoming BD study requests, break into micro-tasks, and dispatch field survey teams.
          </p>
        </div>

        <button className="px-4 py-2 bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple font-bold text-sm rounded-xl shadow-sm transition flex items-center space-x-2">
          <SplitSquareVertical className="w-4 h-4" />
          <span>Split & Assign Catchment Study</span>
        </button>
      </div>

      {/* Main Grid: Inbox + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study Requests Inbox */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
              <ClipboardList className="w-4 h-4 text-brand-purple" />
              <span>Catchment Study Inbox</span>
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-brand-purple">
              2 Pending
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-brand-purple/20 bg-purple-50/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-purple">#REQ-CHN-104</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Ready to Split</span>
              </div>
              <h3 className="text-sm font-bold text-gray-900">Adyar West Commercial Strip</h3>
              <p className="text-xs text-gray-600">Requested by BD Manager for 1.5km catchment pedestrian footfall & competitive grocery pricing study.</p>
              <button className="w-full mt-2 py-1.5 bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1">
                <span>Split into Lane Tasks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">#REQ-CHN-102</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">In Progress</span>
              </div>
              <h3 className="text-sm font-bold text-gray-900">Porur Junction Core Catchment</h3>
              <p className="text-xs text-gray-600">Assigned to Saravanan B. (6/8 lanes surveyed).</p>
            </div>
          </div>
        </div>

        {/* Chennai Operational Map */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Active Field Survey Coverage</h2>
            <span className="text-xs text-gray-500">Live PostGIS Spatial Layer</span>
          </div>
          <MapView height="440px" />
        </div>
      </div>
    </div>
  );
}
