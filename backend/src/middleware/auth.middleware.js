import { verifyAccessToken } from '../utils/token.js';
import { env } from '../config/env.js';

export const extractUser = (req, _res, next) => {
  try {
    const token =
      req.cookies?.[env.accessCookieName] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (token) {
      const payload = verifyAccessToken(token);
      req.user = {
        userId: Number(payload.sub),
        sub: payload.sub,
        role: payload.role,
        name: payload.name ?? null,
      };
    }
  } catch (_err) {
    // If token is invalid or expired, leave req.user undefined
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  try {
    const token =
      req.cookies?.[env.accessCookieName] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as an administrator.',
      });
    }

    const payload = verifyAccessToken(token);

    if (payload.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Admin privileges required.',
      });
    }

    req.user = {
      userId: Number(payload.sub),
      sub: payload.sub,
      role: payload.role,
      name: payload.name ?? null,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
};

export const requireFaculty = (req, res, next) => {
  try {
    const token =
      req.cookies?.[env.accessCookieName] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const payload = verifyAccessToken(token);

    if (payload.role !== 'FACULTY') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Faculty privileges required.',
      });
    }

    req.user = {
      userId: Number(payload.sub),
      sub: payload.sub,
      role: payload.role,
      name: payload.name ?? null,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
};

export const requireStudent = (req, res, next) => {
  try {
    const token =
      req.cookies?.[env.accessCookieName] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as a student.',
      });
    }

    const payload = verifyAccessToken(token);

    if (payload.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Student privileges required.',
      });
    }

    req.user = {
      userId: Number(payload.sub),
      sub: payload.sub,
      role: payload.role,
      name: payload.name ?? null,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
};
