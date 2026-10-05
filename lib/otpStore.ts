// Shared server memory store for email OTPs: email -> { code, expiresAt, type }
export const otpStore = new Map<
  string,
  { code: string; expiresAt: number; type: string }
>();
