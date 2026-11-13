import api from "../config/axios";

// ==========================================
// 1. DASHBOARD & PROFILE
// ==========================================
export async function getStudentDashboard() {
  const response = await api.get("/student/dashboard");
  return response.data?.data ?? response.data;
}

// ==========================================
// 2. SUBJECTS & COURSE REGISTRATION
// ==========================================
export async function getStudentSubjects() {
  const response = await api.get("/student/subjects");
  return response.data?.data ?? response.data;
}

export async function registerForSubject(subjectId) {
  const response = await api.post(`/student/subjects/${subjectId}/register`);
  return response.data?.data ?? response.data;
}

// ==========================================
// 3. ATTENDANCE SUMMARY & HISTORY
// ==========================================
export async function getSubjectAttendance(subjectId) {
  const response = await api.get(`/student/subjects/${subjectId}/attendance`);
  return response.data?.data ?? response.data;
}

export async function getSubjectAttendanceHistory(subjectId) {
  const response = await api.get(
    `/student/subjects/${subjectId}/attendance/history`
  );
  return response.data?.data ?? response.data;
}

// Aliases so any legacy imports continue to work seamlessly
export const getStudentAttendance = getSubjectAttendance;
export const getStudentAttendanceHistory = getSubjectAttendanceHistory;

// ==========================================
// 4. SUBJECT LEARNING MATERIALS
// ==========================================
export async function getSubjectMaterials(subjectId) {
  const response = await api.get(`/subjects/${subjectId}/materials`);
  return response.data?.data ?? response.data;
}

export async function downloadMaterial(materialId, fallbackFilename = "material.pdf") {
  const response = await api.get(`/materials/${materialId}/download`, {
    responseType: "blob",
  });

  const contentType = response.headers?.["content-type"] || "";

  // If the backend returns JSON with { data: { downloadUrl } } instead of a raw binary stream
  if (contentType.includes("application/json")) {
    const text = await response.data.text();
    const parsed = JSON.parse(text);
    const url = parsed?.data?.downloadUrl ?? parsed?.downloadUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
  }

  // Otherwise trigger browser download/open for the binary Blob stream
  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

// ==========================================
// 5. QUIZZES, LIVE ATTEMPTS & RESULTS
// ==========================================
export async function getStudentQuizzes() {
  const response = await api.get("/student/quizzes");
  return response.data?.data ?? response.data;
}

export async function getStudentQuizDetails(quizId) {
  const response = await api.get(`/student/quizzes/${quizId}`);
  return response.data?.data ?? response.data;
}

export async function startQuizAttempt(quizId) {
  const response = await api.post(`/student/quizzes/${quizId}/attempts`);
  return response.data?.data ?? response.data;
}

export async function saveQuizAnswer(attemptId, { questionId, selectedOptionId }) {
  const response = await api.put(
    `/student/quiz-attempts/${attemptId}/answers`,
    {
      questionId: Number(questionId),
      selectedOptionId:
        selectedOptionId === null || selectedOptionId === undefined
          ? null
          : Number(selectedOptionId),
    }
  );
  return response.data?.data ?? response.data;
}

export async function submitQuizAttempt(attemptId) {
  const response = await api.post(`/student/quiz-attempts/${attemptId}/submit`);
  return response.data?.data ?? response.data;
}

export async function getQuizAttemptResult(attemptId) {
  const response = await api.get(`/student/quiz-attempts/${attemptId}/result`);
  return response.data?.data ?? response.data;
}

// ==========================================
// 6. PERFORMANCE & GRADEBOOK MARKS
// ==========================================
export async function getStudentQuizMarks() {
  const response = await api.get("/student/marks/quizzes");
  return response.data?.data ?? response.data;
}