import api from "../config/axios";

export async function getAdminDashboard() {
  const response = await api.get("/admin/dashboard");
  return response.data?.data ?? response.data;
}

export async function getAdminSubjects() {
  const response = await api.get("/admin/subjects");
  return response.data?.data ?? response.data;
}

export async function createAdminSubject({ subjectCode, name, description, credits }) {
  const response = await api.post("/admin/subjects", {
    subjectCode: subjectCode.trim().toUpperCase(),
    name: name.trim(),
    description: description?.trim() || null,
    credits: Number(credits) || 3,
  });
  return response.data;
}

export async function getAdminSubjectRequests(status = "ALL") {
  const params = { status: status || "ALL" };
  const response = await api.get("/admin/subject-requests", { params });
  return response.data?.data ?? response.data;
}

export async function reviewAdminSubjectRequest(requestId, decision, reviewNote = "") {
  const payload = {
    decision,
    status: decision,
  };
  if (reviewNote && reviewNote.trim()) {
    payload.reviewNote = reviewNote.trim();
  }

  const response = await api.patch(`/admin/subject-requests/${requestId}`, payload);
  return response.data;
}

export async function getAdminRegistrationWindow() {
  const response = await api.get("/admin/registration-window");
  return response.data?.data ?? response.data;
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

export async function getAdminStudents() {
  const response = await api.get("/admin/students");
  return response.data?.data ?? response.data;
}

export async function getAdminStudentSubjects(studentId) {
  const response = await api.get(`/admin/students/${studentId}/subjects`);
  return response.data?.data ?? response.data;
}

export async function disableAdminStudentAccount(accountId) {
  const response = await api.delete(`/admin/students/${accountId}`);
  return response.data;
}

export async function getAdminFaculty() {
  const response = await api.get("/admin/faculty");
  return response.data?.data ?? response.data;
}

export async function getAdminFacultySubjects(facultyId) {
  const response = await api.get(`/admin/faculty/${facultyId}/subjects`);
  return response.data?.data ?? response.data;
}

export async function disableAdminFacultyAccount(accountId) {
  const response = await api.delete(`/admin/faculty/${accountId}`);
  return response.data;
}