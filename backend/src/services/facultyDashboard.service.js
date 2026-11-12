import * as facultyDashboardRepository from '../repositories/facultyDashboard.repository.js';

export const getFacultyDashboard = async (userId) => {
  const profile = await facultyDashboardRepository.getFacultyProfileByUserId(userId);

  if (!profile) {
    const error = new Error('Faculty profile not found');
    error.statusCode = 404;
    throw error;
  }

  const [subjects, pendingRequests] = await Promise.all([
    facultyDashboardRepository.getTeachingSubjects(profile.facultyId),
    facultyDashboardRepository.getFacultyPendingRequestsCount(profile.facultyId),
  ]);

  const totalStudents = subjects.reduce(
    (sum, subject) => sum + (subject.studentCount || 0),
    0
  );

  return {
    faculty: profile,
    summary: {
      totalSubjects: subjects.length,
      subjectsTeaching: subjects.length,
      totalStudents,
      pendingRequests,
    },
    subjects,
  };
};
