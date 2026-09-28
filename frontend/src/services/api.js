const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Low-level API client that automatically includes X-User-Id header from localStorage
 */
export async function apiRequest(endpoint, options = {}) {
  const currentUserId = localStorage.getItem('sitescout_user_id');
  
  const headers = {
    'Content-Type': 'application/json',
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
      try {
        const errJson = await res.json();
        errorMessage = errJson.detail || errorMessage;
      } catch (e) {
        // keep status text
      }
      const error = new Error(errorMessage);
      error.status = res.status;
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
};
