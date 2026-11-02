import { getAdminDashboard } from
    "../services/adminDashboard.service.js";

export const adminDashboard = async (req, res, next) => {
    try {
        const dashboardData = await getAdminDashboard();

        return res.status(200).json({
            success: true,
            message: "Admin dashboard fetched successfully",
            data: dashboardData,
        });
    } catch (error) {
        next(error);
    }
};