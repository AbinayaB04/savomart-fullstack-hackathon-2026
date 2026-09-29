const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Low-level API client that automatically includes X-User-Id header from localStorage
 */
export async function apiRequest(endpoint, options = {}) {
  const currentUserId = localStorage.getItem('sitescout_user_id');
  
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(currentUserId ? { 'X-User-Id': currentUserId } : {}),
    ...(options.headers || {}),
  };

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMessage = `HTTP error ${res.status}`;
      let errData = null;
      try {
        errData = await res.json();
        errorMessage = errData.detail || errorMessage;
      } catch (e) {
        // keep status text
      }
      const error = new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      error.status = res.status;
      error.data = errData;
      throw error;
    }

    return await res.json();
  } catch (error) {
    console.error(`API request to ${endpoint} failed:`, error);
    throw error;
  }
}

export const api = {
  getHealth: () => apiRequest('/health'),
  getUsers: () => apiRequest('/users'),
  getMe: () => apiRequest('/me'),
  getGrid: (bbox) => apiRequest(`/grid${bbox ? `?bbox=${bbox}` : ''}`),
  getStores: () => apiRequest('/stores'),
  getPois: (bbox, category) => {
    const params = new URLSearchParams();
    if (bbox) params.append('bbox', bbox);
    if (category) params.append('category', category);
    const qs = params.toString();
    return apiRequest(`/pois${qs ? `?${qs}` : ''}`);
  },
  geocode: (query) => apiRequest(`/geocode?q=${encodeURIComponent(query)}`),
  createReport: (cellIds, name) =>
    apiRequest('/reports', {
      method: 'POST',
      body: JSON.stringify({ cell_ids: cellIds, name }),
    }),
  getReports: () => apiRequest('/reports'),
  getReport: (id) => apiRequest(`/reports/${id}`),
  retryReport: (id) =>
    apiRequest(`/reports/${id}/retry`, {
      method: 'POST',
    }),

  // Phase 3: Scout Assignments
  createScoutAssignment: (data) =>
    apiRequest('/scout-assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getScoutAssignments: (status) =>
    apiRequest(`/scout-assignments${status ? `?status=${status}` : ''}`),
  getMyScoutAssignments: () => apiRequest('/scout-assignments/mine'),
  updateScoutAssignmentStatus: (id, status) =>
    apiRequest(`/scout-assignments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Phase 3: Properties & Pipeline
  createProperty: (formData) =>
    apiRequest('/properties', {
      method: 'POST',
      body: formData,
    }),
  getProperties: (stage) =>
    apiRequest(`/properties${stage ? `?stage=${stage}` : ''}`),
  getProperty: (id) => apiRequest(`/properties/${id}`),
  movePropertyStage: (id, to_stage, reason) =>
    apiRequest(`/properties/${id}/stage`, {
      method: 'POST',
      body: JSON.stringify({ to_stage, reason }),
    }),
  reevaluateProperty: (id) =>
    apiRequest(`/properties/${id}/evaluate`, {
      method: 'POST',
    }),

  // Phase 4: Milestone 3 Catchment Studies & Field Operations
  createStudy: ({ target_type, property_id, report_id, radius_m = 1000.0 }) =>
    apiRequest('/studies', {
      method: 'POST',
      body: JSON.stringify({ target_type, property_id, report_id, radius_m }),
    }),
  getStudies: (status, target_type) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (target_type) params.append('target_type', target_type);
    const qs = params.toString();
    return apiRequest(`/studies${qs ? `?${qs}` : ''}`);
  },
  getStudy: (id) => apiRequest(`/studies/${id}`),
  planStudy: (id) =>
    apiRequest(`/studies/${id}/plan`, {
      method: 'POST',
    }),
  autoAssignStudy: (id) =>
    apiRequest(`/studies/${id}/auto-assign`, {
      method: 'POST',
    }),
  getStudyProgress: (id) => apiRequest(`/studies/${id}/progress`),
  rollupStudy: (id) =>
    apiRequest(`/studies/${id}/rollup`, {
      method: 'POST',
    }),

  // Phase 4: Survey Tasks
  getMyTasks: () => apiRequest('/tasks/mine'),
  getTask: (id) => apiRequest(`/tasks/${id}`),
  assignTask: (id, assigned_to) =>
    apiRequest(`/tasks/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to }),
    }),
  submitTaskResponse: (id, data) =>
    apiRequest(`/tasks/${id}/responses`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};


