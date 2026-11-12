import * as adminDashboardRepository from
    "../repositories/adminDashboard.repository.js";

export const getAdminDashboard = async () => {
    const [
        studentCount,
        facultyCount,
        subjectCount,
        pendingRequestsCount,
        recentLogs,
    ] = await Promise.all([
        adminDashboardRepository.getStudentCount(),
        adminDashboardRepository.getFacultyCount(),
        adminDashboardRepository.getSubjectCount(),
        adminDashboardRepository.getPendingRequestsCount(),
        adminDashboardRepository.getRecentLogs(),
    ]);

    return {
        counts: {
            students: studentCount,
            faculty: facultyCount,
            subjects: subjectCount,
            pendingRequests: pendingRequestsCount,
            totalStudents: studentCount,
            totalFaculty: facultyCount,
            totalSubjects: subjectCount,
            totalPendingRequests: pendingRequestsCount,
        },
        recentLogs,
    };
};
