import { env } from '../config/env.js';

export function setAuthCookies(res, accessToken, refreshToken) {
  const commonOptions = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
  };

  res.cookie(env.accessCookieName, accessToken, {
    ...commonOptions,
    maxAge: 30 * 60 * 1000,
  });

  res.cookie(env.refreshCookieName, refreshToken, {
    ...commonOptions,
    maxAge: env.jwtRefreshTtlSeconds * 1000,
  });
}

export function setAccessCookie(res, accessToken) {
  res.cookie(env.accessCookieName, accessToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: 30 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  const options = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
  };

  res.clearCookie(env.accessCookieName, options);
  res.clearCookie(env.refreshCookieName, options);
}