import api from "../config/axios";

export function parseApiError(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;

  const data = err.response?.data;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;

  if (err.response?.status === 429) return "Too many attempts. Please wait a moment before retrying.";
  if (err.response?.status === 401) return "Invalid credentials or expired verification code.";
  if (err.response?.status === 409) return "An account with this email already exists.";
  if (err.response?.status === 502 || err.response?.status === 503) {
    return "AI Biometric or Auth service is warming up. Please try again in a moment.";
  }
  if (err.code === "ERR_NETWORK") {
    return "Cannot reach the SnapClass server. Please check if the backend is running.";
  }

  return err.message || fallback;
}

export async function sendEmailVerificationOtp(email) {
  const response = await api.post("/auth/send-email-verification-otp", {
    email: email.trim().toLowerCase(),
  });
  return response.data;
}

export async function verifyEmailOtp({ email, otp }) {
  const response = await api.post("/auth/verify-email", {
    email: email.trim().toLowerCase(),
    otp: otp.trim(),
  });
  return response.data;
}

export async function registerByRole(role, { fullName, email, password, faceImage }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();

  if (role === "student") {
    const formData = new FormData();
    formData.append("fullName", cleanName);
    formData.append("email", cleanEmail);
    formData.append("password", password);
    formData.append("faceImage", faceImage, faceImage.name || `student-face-${Date.now()}.jpg`);

    const response = await api.post("/auth/student/register", formData);
    return response.data;
  }

  const endpoint = role === "admin" ? "/auth/admin/register" : "/auth/faculty/register";
  const response = await api.post(endpoint, {
    fullName: cleanName,
    email: cleanEmail,
    password,
  });
  return response.data;
}


export async function loginWithPassword(role, { email, password }) {
  const endpointMap = {
    student: "/auth/student/login",
    faculty: "/auth/faculty/login",
    admin: "/auth/admin/login",
  };

  const response = await api.post(endpointMap[role], {
    email: email.trim().toLowerCase(),
    password,
  });
  return response.data;
}

export async function loginStudentWithFace(faceImage) {
  const formData = new FormData();
  formData.append("faceImage", faceImage, faceImage.name || `face-login-${Date.now()}.jpg`);

  const response = await api.post("/auth/student/face-login", formData);
  return response.data;
}

export async function verifyRoleMfa(role, { email, otp }) {
  const endpointMap = {
    student: "/auth/student/verify-mfa",
    faculty: "/auth/faculty/verify-mfa",
    admin: "/auth/admin/verify-mfa",
  };

  const response = await api.post(endpointMap[role], {
    email: email.trim().toLowerCase(),
    otp: otp.trim(),
  });
  return response.data;
}

export async function restoreSession() {
  try {
    const response = await api.get("/auth/me");
    const user = response.data?.user ?? response.data?.data;
    if (user?.userId) {
      localStorage.setItem("snapclass_user", JSON.stringify(user));
      return user;
    }
  } catch (error) {
    if (error?.response?.status === 401) {
      try {
        const refreshRes = await api.post("/auth/refresh");
        const refreshedUser = refreshRes.data?.user ?? refreshRes.data?.data?.user;
        if (refreshedUser?.userId) {
          localStorage.setItem("snapclass_user", JSON.stringify(refreshedUser));
          return refreshedUser;
        }
      } catch (refreshErr) {
        localStorage.removeItem("snapclass_user");
        throw refreshErr;
      }
    }
  }
  return null;
}

export async function logoutUser() {
  try {
    await api.post("/auth/logout");
  } catch {
    // Ignore network error on logout
  } finally {
    localStorage.removeItem("snapclass_user");
  }
}