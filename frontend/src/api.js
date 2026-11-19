const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'atAdminToken';
const ADMIN_KEY = 'atAdmin';

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY) || '',
  admin: () => {
    try { return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null'); } catch { return null; }
  },
  set: (token, admin) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  },
};

async function handle(res, admin) {
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (admin && res.status === 401) {
      session.clear();
      window.dispatchEvent(new Event('admin-logout'));
    }
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function request(path, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers.Authorization = `Bearer ${session.token()}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res, admin);
}

async function uploadFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token()}` },
    body: form,
  });
  return handle(res, true);
}

export const authApi = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me', { admin: true }),
  markTourSeen: (key) => request(`/auth/tours/${key}`, { method: 'POST', body: {}, admin: true }),
  resetTours: () => request('/auth/tours', { method: 'DELETE', admin: true }),
};

export const adminApi = {
  config: () => request('/admin/config', { admin: true }),
  list: () => request('/admin/articles', { admin: true }),
  defaults: () => request('/admin/articles/defaults', { admin: true }),
  get: (id) => request(`/admin/articles/${id}`, { admin: true }),
  create: (a) => request('/admin/articles', { method: 'POST', body: a, admin: true }),
  update: (id, a) => request(`/admin/articles/${id}`, { method: 'PUT', body: a, admin: true }),
  setShare: (id, active) => request(`/admin/articles/${id}/share`, { method: 'PATCH', body: { active }, admin: true }),
  addRecipients: (id, recipients) =>
    request(`/admin/articles/${id}/recipients`, { method: 'POST', body: { recipients }, admin: true }),
  report: (id) => request(`/admin/articles/${id}/report`, { admin: true }),
  recipient: (rid) => request(`/admin/recipients/${rid}`, { admin: true }),
  uploadImage: (file) => uploadFile('/admin/assets', file),
  importDocx: (file) => uploadFile('/admin/import-docx', file),
  // A reader's uploaded file (File upload question): fetched with the admin token, then saved
  async downloadResponseFile(fileId, name) {
    const res = await fetch(`${BASE}/admin/response-files/${fileId}`, {
      headers: { Authorization: `Bearer ${session.token()}` },
    });
    if (!res.ok) await handle(res, true);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export const publicApi = {
  share: (shareToken) => request(`/public/share/${shareToken}`),
  join: (shareToken, person) => request(`/public/share/${shareToken}/join`, { method: 'POST', body: person }),
  get: (token) => request(`/public/${token}`),
  open: (token) => request(`/public/${token}/open`, { method: 'POST', body: {} }),
  submit: (token, answers) => request(`/public/${token}/submit`, { method: 'POST', body: { answers } }),
  // File upload question: questionId must be sent before the file (multer reads fields in order)
  async uploadFile(token, questionId, file) {
    const form = new FormData();
    form.append('questionId', String(questionId));
    form.append('file', file);
    const res = await fetch(`${BASE}/public/${token}/files`, { method: 'POST', body: form });
    return handle(res, false);
  },
  removeFile: (token, fileId) => request(`/public/${token}/files/${fileId}`, { method: 'DELETE' }),
};

// Reader's personal token for a share link, so they are not asked again on this device.
export const readerStore = {
  key: (shareToken) => `atReader:${shareToken}`,
  get(shareToken) { try { return localStorage.getItem(this.key(shareToken)); } catch { return null; } },
  set(shareToken, token) { try { localStorage.setItem(this.key(shareToken), token); } catch { /* private mode */ } },
  clear(shareToken) { try { localStorage.removeItem(this.key(shareToken)); } catch { /* ignore */ } },
};

// sendBeacon survives tab close / navigation; it posts as text/plain.
export function beacon(path, payload) {
  const url = BASE + path;
  const data = JSON.stringify(payload);
  if (navigator.sendBeacon && navigator.sendBeacon(url, data)) return;
  fetch(url, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
}
