import api from "../config/axios";

export async function getFacultyDashboard() {
  const response = await api.get("/faculty/dashboard");
  return response.data.data;
}

export async function getFacultySubjects() {
  const response = await api.get("/faculty/subjects");
  return response.data.data;
}

export async function requestSubjectAccess(subjectId) {
  const response = await api.post(
    `/faculty/subjects/${subjectId}/request`
  );
  return response.data;
}

export async function getSubjectAttendanceDates(subjectId) {
  const response = await api.get(
    `/faculty/subjects/${subjectId}/attendance/dates`
  );
  return response.data.data;
}

export async function getSubjectAttendance(subjectId, date) {
  const response = await api.get(
    `/faculty/subjects/${subjectId}/attendance`,
    { params: { date } }
  );
  return response.data.data;
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

  return response.data.data;
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
