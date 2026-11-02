import * as adminDashboardRepository from
    "../repositories/adminDashboard.repository.js";

export const getAdminDashboard = async () => {
    const [
        studentCount,
        facultyCount,
        subjectCount,
        recentLogs,
    ] = await Promise.all([
        adminDashboardRepository.getStudentCount(),
        adminDashboardRepository.getFacultyCount(),
        adminDashboardRepository.getSubjectCount(),
        adminDashboardRepository.getRecentLogs(),
    ]);

    return {
        counts: {
            students: studentCount,
            faculty: facultyCount,
            subjects: subjectCount,
        },
        recentLogs,
    };
};