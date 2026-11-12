
import { verifyAccessToken } from '../utils/token.js';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';

// Extract token from cookie or Authorization header.
function getAccessToken(req) {
  return (
    req.cookies?.[env.accessCookieName] ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null)
  );
}

// Verify JWT and check current account status in MySQL.
async function authenticate(req, res, next, requiredRole = null) {
  try {
    const token = getAccessToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const payload = verifyAccessToken(token);

    // Check role before querying the database.
    const allowedRoles = requiredRole
  ? Array.isArray(requiredRole)
    ? requiredRole
    : [requiredRole]
  : null;

if (allowedRoles && !allowedRoles.includes(payload.role)) {
  return res.status(403).json({
    success: false,
    message: 'You do not have permission to access this resource.',
  });
}

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    // Check the latest account status from the database.
    const [rows] = await pool.execute(
      `SELECT user_id, email, role, status
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    const user = rows[0];

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Your account is inactive or disabled. Please contact the administrator.',
      });
    }

    // Ensure the role in the database matches the JWT role.
    if (user.role !== payload.role) {
      return res.status(403).json({
        success: false,
        message: 'Account role mismatch. Please log in again.',
      });
    }

    req.user = {
      userId: Number(user.user_id),
      sub: String(user.user_id),
      email: user.email,
      role: user.role,
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

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    console.error('Authentication middleware error:', error);

    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.',
    });
  }
}

// Extract user without enforcing a particular role.
export const extractUser = (req, res, next) => {
  authenticate(req, res, next);
};

// Role-specific middleware.
export const requireAdmin = (req, res, next) => {
  authenticate(req, res, next, 'ADMIN');
};

export const requireFaculty = (req, res, next) => {
  authenticate(req, res, next, 'FACULTY');
};

export const requireStudent = (req, res, next) => {
  authenticate(req, res, next, 'STUDENT');
};

export const requireFacultyOrStudent = (req, res, next) => {
  authenticate(req, res, next, ['FACULTY', 'STUDENT']);
};
