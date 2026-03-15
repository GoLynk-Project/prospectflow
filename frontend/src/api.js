const API = "http://localhost:8000/api";

async function get(path) {
  const r = await fetch(`${API}${path}`);
  return r.json();
}

async function post(path, data = {}) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return r.json();
}

async function patch(path, data = {}) {
  const r = await fetch(`${API}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return r.json();
}

async function put(path, data = {}) {
  const r = await fetch(`${API}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return r.json();
}

async function del(path) {
  const r = await fetch(`${API}${path}`, { method: "DELETE" });
  return r.json();
}

export const api = {
  // Prospects
  getProspects: () => get("/prospects"),
  addProspect: (p) => post("/prospects", p),
  addBulk: (list) => post("/prospects/bulk", list),
  updateProspect: (id, data) => patch(`/prospects/${id}`, data),
  deleteProspect: (id) => del(`/prospects/${id}`),
  // Blacklist
  getBlacklist: () => get("/blacklist"),
  addBlacklist: (data) => post("/blacklist", data),
  removeBlacklist: (id) => del(`/blacklist/${id}`),
  // Template
  getTemplate: () => get("/template"),
  updateTemplate: (data) => put("/template", data),
  // Send config
  getSendConfig: () => get("/send-config"),
  updateSendConfig: (data) => put("/send-config", data),
  // SMTP
  getSmtp: () => get("/smtp"),
  updateSmtp: (data) => put("/smtp", data),
  // Sequences
  getSequences: () => get("/sequences"),
  updateSequence: (id, data) => patch(`/sequences/${id}`, data),
  getSteps: () => get("/sequence-steps"),
  addStep: (data) => post("/sequence-steps", data),
  updateStep: (id, data) => patch(`/sequence-steps/${id}`, data),
  deleteStep: (id) => del(`/sequence-steps/${id}`),
  // Campaigns
  getCampaigns: () => get("/campaigns"),
  addCampaign: (data) => post("/campaigns", data),
  updateCampaign: (id, data) => patch(`/campaigns/${id}`, data),
  deleteCampaign: (id) => del(`/campaigns/${id}`),
  // Tags
  getTags: () => get("/tags"),
  addTag: (data) => post("/tags", data),
  deleteTag: (id) => del(`/tags/${id}`),
  getProspectTags: () => get("/prospect-tags"),
  assignTag: (data) => post("/prospect-tags", data),
  removeTag: (pid, tid) => del(`/prospect-tags/${pid}/${tid}`),
  // Notes
  getNotes: () => get("/notes"),
  addNote: (data) => post("/notes", data),
  updateNote: (id, data) => patch(`/notes/${id}`, data),
  deleteNote: (id) => del(`/notes/${id}`),
  // Activity
  getActivity: () => get("/activity"),
  // Test
  sendTest: (email) => post("/send-test", { test_email: email }),
};
