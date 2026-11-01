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
