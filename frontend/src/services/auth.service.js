import api from "../config/axios";

export async function startFacultyLogin({ email, password }) {
  const response = await api.post("/auth/faculty/login", {
    email: email.trim().toLowerCase(),
    password,
  });
  return response.data;
}

export async function completeFacultyMfa({ email, otp }) {
  const response = await api.post("/auth/faculty/verify-mfa", {
    email: email.trim().toLowerCase(),
    otp: otp.trim(),
  });
  return response.data;
}

export async function registerFaculty({ fullName, email, password }) {
  const response = await api.post("/auth/faculty/register", {
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    password,
  });
  return response.data;
}

export async function sendEmailVerificationOtp(email) {
  const response = await api.post("/auth/send-email-verification-otp", {
    email: email.trim().toLowerCase(),
  });
  return response.data;
}

export async function verifyEmail({ email, otp }) {
  const response = await api.post("/auth/verify-email", {
    email: email.trim().toLowerCase(),
    otp: otp.trim(),
  });
  return response.data;
}

export async function restoreSession() {
  try {
    const response = await api.get("/auth/me");
    const user = response.data?.user ?? response.data?.data?.user;
    if (user) {
      localStorage.setItem("snapclass_user", JSON.stringify(user));
      return user;
    }
  } catch (error) {
    if (error?.response?.status === 401) {
      localStorage.removeItem("snapclass_user");
      throw error;
    }

    try {
      const refreshRes = await api.post("/auth/refresh");
      const user = refreshRes.data?.user ?? refreshRes.data?.data?.user;
      if (user) {
        localStorage.setItem("snapclass_user", JSON.stringify(user));
        return user;
      }
    } catch (refreshErr) {
      if (refreshErr?.response?.status === 401) {
        localStorage.removeItem("snapclass_user");
        throw refreshErr;
      }
    }
  }

  // Fallback to locally cached user if offline
  try {
    const saved = localStorage.getItem("snapclass_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export async function logoutUser() {
  try {
    await api.post("/auth/logout");
  } catch (_e) {
    // Ignore network failure on logout
  }
}
