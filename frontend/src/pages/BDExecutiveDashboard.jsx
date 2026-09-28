import React from 'react';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';
import { Plus, Navigation, MapPin, CheckCircle, Clock } from 'lucide-react';

export default function BDExecutiveDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Mobile-First Header */}
      <div className="bg-brand-purple text-white p-5 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold text-brand-yellow tracking-wider">
            BD Executive Mobile Field Desk
          </span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            Active Online
          </span>
        </div>
        <h1 className="text-xl font-bold mt-1">{currentUser?.name}</h1>
        <p className="text-xs text-purple-200 mt-0.5 flex items-center">
          <Navigation className="w-3.5 h-3.5 mr-1 text-brand-yellow" />
          Field Zone: Chennai South & IT Corridor
        </p>

        {/* Primary CTA */}
        <button className="mt-4 w-full py-3 bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple font-extrabold text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2">
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Onboard New Retail Property</span>
        </button>
      </div>

      {/* Map Snapshot */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 flex items-center space-x-1.5">
            <MapPin className="w-4 h-4 text-brand-purple" />
            <span>Chennai Field Navigator</span>
          </h2>
          <span className="text-[11px] text-gray-500">Live Stores</span>
        </div>
        <MapView height="240px" zoom={13} center={[12.9750, 80.2212]} />
      </div>

      {/* Assigned Scouting Hotspots */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Assigned Scouting Tasks</h2>
          <span className="text-xs font-semibold text-brand-purple">2 Pending</span>
        </div>

        <div className="space-y-2.5">
          <div className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/50 flex items-start justify-between">
            <div>
              <div className="font-bold text-xs text-gray-900">Velachery Bypass Cluster</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Target: 3,000 - 5,000 sq ft ground floor retail</div>
              <div className="mt-2 flex items-center space-x-2 text-[10px] text-brand-purple font-semibold">
                <Clock className="w-3 h-3" />
                <span>Due Today, 5:00 PM</span>
              </div>
            </div>
            <button className="px-2.5 py-1 text-xs font-bold bg-brand-purple text-brand-yellow rounded-lg">
              Start
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50 flex items-start justify-between">
            <div>
              <div className="font-bold text-xs text-gray-900">OMR Karapakkam Junction</div>
              <div className="text-[11px] text-gray-500 mt-0.5">High tech footfall corridor, frontage &gt; 40ft</div>
              <div className="mt-2 flex items-center space-x-2 text-[10px] text-gray-500 font-semibold">
                <Clock className="w-3 h-3" />
                <span>Scheduled Tomorrow</span>
              </div>
            </div>
            <button className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-700 rounded-lg">
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
