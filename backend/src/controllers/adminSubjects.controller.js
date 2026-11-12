import * as adminSubjectsService from '../services/adminSubjects.service.js';

const getAdminIdentity = (req) => {
  const rawId =
    req.user?.userId ??
    req.user?.sub ??
    (req.body?.adminUserId ? Number(req.body.adminUserId) : null) ??
    (req.headers['x-admin-user-id'] ? Number(req.headers['x-admin-user-id']) : null);

  const adminUserId = rawId ? Number(rawId) : null;
  const adminName =
    req.user?.name ??
    req.user?.fullName ??
    req.body?.adminName ??
    (req.headers['x-admin-name'] || null);

  return { adminUserId, adminName };
};

export const createSubject = async (req, res, next) => {
  try {
    const subjectCode = req.body.subjectCode?.trim();
    const name = req.body.name?.trim();
    const description = req.body.description?.trim() || null;
    const rawCredits = req.body.credits !== undefined ? Number(req.body.credits) : 3;

    if (!subjectCode || !name) {
      return res.status(400).json({
        success: false,
        message: 'subjectCode and name are required',
      });
    }

    if (!Number.isInteger(rawCredits) || rawCredits < 1 || rawCredits > 30) {
      return res.status(400).json({
        success: false,
        message: 'Credits must be an integer between 1 and 30',
      });
    }

    if (subjectCode.length > 30 || name.length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Subject code or name exceeds the allowed length',
      });
    }

    const identity = getAdminIdentity(req);

    if (!identity.adminUserId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication is required to create a subject',
      });
    }

    const subject = await adminSubjectsService.createSubject({
      subjectCode,
      name,
      description,
      credits: rawCredits,
      ...identity,
    });

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: subject,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A subject with this code already exists',
      });
    }

    next(error);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await adminSubjectsService.getSubjects();

    return res.status(200).json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    next(error);
  }
};

export const getSubjectRequests = async (req, res, next) => {
  try {
    const rawStatus = req.query.status
      ? String(req.query.status).trim().toUpperCase()
      : 'ALL';
    const requests = await adminSubjectsService.getRequests(rawStatus);

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewSubjectRequest = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID',
      });
    }

    const rawDecision = req.body.decision || req.body.status;
    const decision = typeof rawDecision === 'string'
      ? rawDecision.trim().toUpperCase()
      : null;

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Decision must be APPROVED or REJECTED',
      });
    }

    const reviewNote = req.body.reviewNote?.trim() || null;
    const identity = getAdminIdentity(req);

    if (!identity.adminUserId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication is required to review subject requests',
      });
    }

    const result = await adminSubjectsService.reviewSubjectRequest({
      requestId,
      decision,
      reviewNote,
      ...identity,
    });

    return res.status(200).json({
      success: true,
      message: `Request ${decision.toLowerCase()} successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
