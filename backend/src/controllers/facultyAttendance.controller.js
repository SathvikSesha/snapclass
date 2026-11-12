import {
  getFacultyAttendanceDates,
  getFacultyAttendanceStudents,
  saveFacultyAttendance,
} from '../services/facultyAttendance.service.js';

export const getFacultyAttendanceDatesController = async (
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

    const result = await getFacultyAttendanceDates({
      userId,
      subjectId,
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance dates fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getFacultyAttendanceStudentsController = async (
  req,
  res,
  next
) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const rawUserId = req.user?.userId ?? req.user?.sub;
    const userId = Number(rawUserId);
    const attendanceDate = req.query.date;

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

    // Validate YYYY-MM-DD and reject impossible calendar dates.
    if (
      typeof attendanceDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid date in YYYY-MM-DD format is required',
      });
    }

    const [year, month, day] = attendanceDate.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid calendar date',
      });
    }

    const result = await getFacultyAttendanceStudents({
      userId,
      subjectId,
      attendanceDate,
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance students fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const saveFacultyAttendanceController = async (
  req,
  res,
  next
) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const userId = Number(
      req.user?.userId ?? req.user?.sub
    );

    if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subject ID.',
      });
    }

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const attendanceDate = req.body?.attendanceDate || req.body?.date;
    const students = req.body?.students || req.body?.records;

    const result = await saveFacultyAttendance({
      userId,
      subjectId,
      attendanceDate,
      students,
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance saved successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
