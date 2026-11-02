import {
  getFacultySubjects,
  requestSubjectAccess,
} from '../services/facultySubjects.service.js';

export const getFacultySubjectsController = async (req, res, next) => {
  try {
    const rawUserId = req.user?.userId ?? req.user?.sub;
    const userId = rawUserId ? Number(rawUserId) : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const result = await getFacultySubjects(userId);

    return res.status(200).json({
      success: true,
      message: 'Faculty subjects fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const requestSubjectAccessController = async (req, res, next) => {
  try {
    const subjectId = Number(req.params.subjectId);

    if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subject ID parameter',
      });
    }

    const rawUserId = req.user?.userId ?? req.user?.sub;
    const userId = rawUserId ? Number(rawUserId) : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const result = await requestSubjectAccess({ userId, subjectId });

    return res.status(201).json({
      success: true,
      message: 'Subject access requested successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
