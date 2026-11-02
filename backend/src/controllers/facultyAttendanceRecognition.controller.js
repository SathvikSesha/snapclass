
import {
  recognizeAttendanceFaces,
} from '../services/facultyAttendanceRecognition.service.js';

export const recognizeAttendanceFacesController = async (
  req,
  res,
  next
) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const rawUserId = req.user?.userId ?? req.user?.sub;
    const userId = Number(rawUserId);

    if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid subjectId is required',
      });
    }

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const result = await recognizeAttendanceFaces({
      userId,
      subjectId,
      files: req.files,
    });

    return res.status(200).json({
      success: true,
      message: 'Face recognition completed. Review the suggestions before saving attendance.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
