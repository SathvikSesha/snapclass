import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  frontendUrl: process.env.FRONTEND_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
  jwtRefreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS || 86400),
  accessCookieName: process.env.ACCESS_COOKIE_NAME || 'snapclass_access',
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'snapclass_refresh',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',

  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    connectionLimit:
      Number(process.env.DB_CONNECTION_LIMIT) || 10,
  },
};
