import { getRegistrationWindowDetails } from '../services/admin.service.js';
import { scheduleRegistrationWindow } from '../services/admin.service.js';
import { rescheduleRegistrationWindow } from '../services/admin.service.js';

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
