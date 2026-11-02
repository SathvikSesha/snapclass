import { getFacultyDashboard } from '../services/facultyDashboard.service.js';

export const facultyDashboard = async (req, res, next) => {
  try {
    const rawId = req.user?.userId ?? req.user?.sub;
    const userId = rawId ? Number(rawId) : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const dashboard = await getFacultyDashboard(userId);

    return res.status(200).json({
      success: true,
      message: 'Faculty dashboard fetched successfully',
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
};
