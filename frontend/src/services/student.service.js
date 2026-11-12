
import api from "../config/axios";

export async function getStudentDashboard() {
  const response = await api.get("/student/dashboard");
  return response.data.data;
}

export async function getStudentSubjects() {
  const response = await api.get("/student/subjects");
  return response.data.data;
}

export async function registerForSubject(subjectId) {
  const response = await api.post(
    `/student/subjects/${subjectId}/register`
  );
  return response.data;
}

export async function getStudentAttendance(subjectId) {
  const response = await api.get(
    `/student/subjects/${subjectId}/attendance`
  );
  return response.data.data;
}

export async function getStudentAttendanceHistory(subjectId) {
  const response = await api.get(
    `/student/subjects/${subjectId}/attendance/history`
  );
  return response.data.data;
}
