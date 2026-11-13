import axios from "axios";
import api from "../config/axios";

// ==========================================
// 1. DASHBOARD & SUBJECTS
// ==========================================
export async function getFacultyDashboard() {
  const response = await api.get("/faculty/dashboard");
  return response.data?.data ?? response.data;
}

export async function getFacultySubjects() {
  const response = await api.get("/faculty/subjects");
  return response.data?.data ?? response.data;
}

export async function requestSubjectAccess(subjectId) {
  const response = await api.post(`/faculty/subjects/${subjectId}/request`);
  return response.data;
}

// ==========================================
// 2. CLASSROOM ATTENDANCE & AI RECOGNITION
// ==========================================
export async function getSubjectAttendanceDates(subjectId) {
  const response = await api.get(
    `/faculty/subjects/${subjectId}/attendance/dates`
  );
  return response.data?.data ?? response.data;
}

export async function getSubjectAttendance(subjectId, date) {
  const response = await api.get(
    `/faculty/subjects/${subjectId}/attendance`,
    { params: { date } }
  );
  return response.data?.data ?? response.data;
}

export async function recognizeAttendance(subjectId, files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  const response = await api.post(
    `/faculty/subjects/${subjectId}/attendance/recognize`,
    formData
  );
  return response.data?.data ?? response.data;
}

export async function saveSubjectAttendance(subjectId, date, records) {
  const response = await api.post(
    `/faculty/subjects/${subjectId}/attendance/save`,
    {
      attendanceDate: date,
      date,
      students: records,
      records,
    }
  );
  return response.data;
}

// ==========================================
// 3. STUDY MATERIALS (S3 PRESIGNED + RAG)
// ==========================================
export async function getSubjectMaterials(subjectId) {
  const response = await api.get(`/subjects/${subjectId}/materials`);
  return response.data?.data ?? response.data;
}

export async function requestMaterialUploadUrl(
  subjectId,
  { title, description, originalFilename, fileType, fileSize }
) {
  const response = await api.post(`/faculty/subjects/${subjectId}/materials`, {
    title: title.trim(),
    description: description?.trim() || "",
    originalFilename,
    fileType,
    fileSize,
  });
  return response.data?.data ?? response.data;
}

export async function uploadFileToPresignedUrl(
  uploadUrl,
  file,
  requiredHeaders = {},
  onProgress
) {
  const headers = {
    "Content-Type": file.type || "application/octet-stream",
    ...requiredHeaders,
  };

  await axios.put(uploadUrl, file, {
    headers,
    withCredentials: false, // S3 presigned URLs reject cookies
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percent);
      }
    },
  });
}

export async function completeMaterialUpload(materialId) {
  const response = await api.post(`/faculty/materials/${materialId}/complete`);
  return response.data?.data ?? response.data;
}

export async function getMaterialDownloadUrl(materialId) {
  const response = await api.get(`/materials/${materialId}/download`);
  return response.data?.data ?? response.data;
}

// ==========================================
// 4. AI QUIZZES & LIFECYCLE MANAGEMENT
// ==========================================
export async function generateAiQuizQuestions(
  subjectId,
  { documentIds, numberOfQuestions = 5, difficulty = "mixed" }
) {
  const response = await api.post(
    `/faculty/subjects/${subjectId}/quizzes/generate`,
    {
      documentIds: documentIds.map(Number),
      numberOfQuestions: Number(numberOfQuestions) || 5,
      difficulty: String(difficulty).toLowerCase(),
    }
  );
  return response.data?.data ?? response.data;
}

export async function saveQuizDraft(subjectId, quizPayload) {
  const response = await api.post(
    `/faculty/subjects/${subjectId}/quizzes`,
    quizPayload
  );
  return response.data;
}

export async function getFacultyQuizzes(filters = {}) {
  const params = {};
  if (filters.status && filters.status !== "ALL") params.status = filters.status;
  if (filters.subjectId && filters.subjectId !== "ALL") {
    params.subjectId = Number(filters.subjectId);
  }

  const response = await api.get("/faculty/quizzes", { params });
  return response.data?.data ?? response.data;
}

export async function getFacultyQuizDetails(quizId) {
  const response = await api.get(`/faculty/quizzes/${quizId}`);
  return response.data?.data ?? response.data;
}

export async function updateQuizDraft(quizId, quizPayload) {
  const response = await api.patch(`/faculty/quizzes/${quizId}`, quizPayload);
  return response.data;
}

export async function publishFacultyQuiz(
  quizId,
  { startAt, deadlineAt, durationMinutes, maxAttempts }
) {
  const response = await api.post(`/faculty/quizzes/${quizId}/publish`, {
    startAt,
    deadlineAt,
    durationMinutes: Number(durationMinutes),
    maxAttempts: Number(maxAttempts),
  });
  return response.data;
}

export async function closeFacultyQuiz(quizId) {
  const response = await api.post(`/faculty/quizzes/${quizId}/close`);
  return response.data;
}

export async function getFacultyQuizResults(quizId) {
  const response = await api.get(`/faculty/quizzes/${quizId}/results`);
  return response.data?.data ?? response.data;
}