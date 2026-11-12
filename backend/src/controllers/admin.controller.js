import { getRegistrationWindowDetails } from '../services/admin.service.js';
import { scheduleRegistrationWindow } from '../services/admin.service.js';
import { rescheduleRegistrationWindow } from '../services/admin.service.js';

import {
  fetchAllStudents,
  fetchStudentSubjects,
  fetchAllFaculty,
  fetchFacultySubjects,
} from '../services/admin.service.js';

import { removePortalUser } from '../services/admin.service.js';

export const getRegistrationWindowController = async (req, res, next) => {
  try {
    const data = await getRegistrationWindowDetails();

    return res.status(200).json({
      success: true,
      message: 'Registration window retrieved successfully.',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const createRegistrationWindowController = async (
  req,
  res,
  next
) => {
  try {
    const adminUserId = Number(req.user?.userId ?? req.user?.sub);

    if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const { startsAt, endsAt } = req.body;

    const data = await scheduleRegistrationWindow({
      startsAt,
      endsAt,
      adminUserId,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration window scheduled successfully.',
      data,
    });
  } catch (error) {
    next(error);
  }
};



export const updateRegistrationWindowController = async (
  req,
  res,
  next
) => {
  try {
    const data = await rescheduleRegistrationWindow({
      windowId: req.params.id,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
    });

    return res.status(200).json({
      success: true,
      message: 'Registration window updated successfully.',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllStudentsController = async (req, res, next) => {
  try {
    const students = await fetchAllStudents();

    return res.status(200).json({
      success: true,
      message: 'Students retrieved successfully.',
      data: {
        totalStudents: students.length,
        students,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStudentSubjectsController = async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);

    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID.',
      });
    }

    const student = await fetchStudentSubjects(studentId);

    return res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllFacultyController = async (req, res, next) => {
  try {
    const faculty = await fetchAllFaculty();

    return res.status(200).json({
      success: true,
      message: 'Faculty retrieved successfully.',
      data: {
        totalFaculty: faculty.length,
        faculty,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFacultySubjectsController = async (req, res, next) => {
  try {
    const facultyId = Number(req.params.facultyId);

    if (!Number.isSafeInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid faculty ID.',
      });
    }

    const faculty = await fetchFacultySubjects(facultyId);

    return res.status(200).json({
      success: true,
      data: faculty,
    });
  } catch (error) {
    next(error);
  }
};

const removeAccountController = (role) => async (req, res, next) => {
  try {
    const accountId = Number(req.params.accountId);

    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account ID.',
      });
    }

    const result = await removePortalUser({
      accountId,
      role,
    });

    return res.status(200).json({
      success: true,
      message: `${role} account disabled successfully.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const removeStudentController =
  removeAccountController('STUDENT');

export const removeFacultyController =
  removeAccountController('FACULTY');
