import api from "../config/axios";

export async function getAdminDashboard() {
  const response = await api.get("/admin/dashboard");
  return response.data.data;
}

export async function getAdminSubjects() {
  const response = await api.get("/admin/subjects");
  return response.data.data;
}

export async function createAdminSubject(subject) {
  const response = await api.post("/admin/subjects", subject);
  return response.data;
}

export async function getAdminSubjectRequests(status = "ALL") {
  const params = status && status !== "ALL" ? { status } : { status: "ALL" };
  const response = await api.get("/admin/subject-requests", { params });
  return response.data.data;
}

export async function reviewAdminSubjectRequest(requestId, status, reviewNote = "") {
  const response = await api.patch(
    `/admin/subject-requests/${requestId}`,
    {
      decision: status,
      status,
      reviewNote,
    }
  );
  return response.data;
}

export async function getAdminRegistrationWindow() {
  const response = await api.get("/admin/registration-window");
  return response.data.data;
}

export async function createAdminRegistrationWindow({ startsAt, endsAt }) {
  const response = await api.post("/admin/registration-window", {
    startsAt,
    endsAt,
  });
  return response.data;
}

export async function updateAdminRegistrationWindow(id, { startsAt, endsAt }) {
  const response = await api.put(`/admin/registration-window/${id}`, {
    startsAt,
    endsAt,
  });
  return response.data;
}
