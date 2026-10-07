"use client";

import { useState } from "react";
import {
  getFirebaseAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "@/lib/firebase";
import { hashPassword } from "@/lib/crypto";

export type UserAccount = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
};

export default function AuthModal({
  user,
  onAuthSuccess,
}: {
  user: UserAccount | null;
  onAuthSuccess: (account: UserAccount) => void;
}) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [otpStep, setOtpStep] = useState<"form" | "signup_otp" | "login_2fa">("form");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [otpInput, setOtpInput] = useState("");
  const [devOtpNotice, setDevOtpNotice] = useState<string | null>(null);

  const [pendingUserAccount, setPendingUserAccount] = useState<UserAccount | null>(null);
  const [pendingPasswordHash, setPendingPasswordHash] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveLocalAccount = (acc: UserAccount) => {
    try {
      localStorage.setItem("duotone_user_account", JSON.stringify(acc));
      localStorage.setItem("lovewave_user_account", JSON.stringify(acc));
    } catch {}
  };

  // 1. Initial Signup Submission -> Request Email Verification OTP
  const handleSignUpInit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError("Please enter your name");
      return;
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setDevOtpNotice(null);

    try {
      // Hash password using SHA-256 before storing
      const pwdHash = await hashPassword(password);

      const userAccount: UserAccount = {
        uid: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        displayName: cleanName,
        email: cleanEmail,
      };

      setPendingUserAccount(userAccount);
      setPendingPasswordHash(pwdHash);

      // Send OTP via API endpoint
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, type: "signup", name: cleanName }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to send verification code.");
        setLoading(false);
        return;
      }

      if (data.devOtp) {
        setDevOtpNotice(`[Dev Helper] Your OTP code is: ${data.devOtp}`);
      }

      setOtpStep("signup_otp");
      setOtpInput("");
    } catch (err: any) {
      setError(err.message || "An error occurred while requesting OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify Signup Email OTP -> Finish Account Creation
  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserAccount || !otpInput.trim()) {
      setError("Please enter the 6-digit OTP code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingUserAccount.email, otp: otpInput.trim() }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Invalid OTP code.");
        setLoading(false);
        return;
      }

      // Store in local registered users map with HASHED password
      try {
        const existingStr = localStorage.getItem("duotone_registered_users") || localStorage.getItem("lovewave_registered_users");
        const usersMap = existingStr ? JSON.parse(existingStr) : {};
        usersMap[pendingUserAccount.email] = {
          name: pendingUserAccount.displayName,
          passwordHash: pendingPasswordHash,
          account: pendingUserAccount,
        };
        localStorage.setItem("duotone_registered_users", JSON.stringify(usersMap));
        localStorage.setItem("lovewave_registered_users", JSON.stringify(usersMap));
      } catch {}

      // Store in Firebase Realtime Database users directory
      try {
        const dbUrl =
          process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
          "https://music-sync-822b1-default-rtdb.firebaseio.com";
        const cleanKey = pendingUserAccount.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
        await fetch(`${dbUrl}/users/${cleanKey}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: pendingUserAccount.uid,
            displayName: pendingUserAccount.displayName,
            email: pendingUserAccount.email,
            createdAt: Date.now(),
          }),
        });
      } catch {}

      // Try Firebase Auth in parallel
      try {
        const auth = getFirebaseAuth();
        const resFb = await createUserWithEmailAndPassword(
          auth,
          pendingUserAccount.email,
          password
        );
        if (resFb.user) {
          await updateProfile(resFb.user, { displayName: pendingUserAccount.displayName });
          pendingUserAccount.uid = resFb.user.uid;
        }
      } catch (err: any) {
        console.warn("Firebase Auth sign-up notice:", err?.message || err);
      }

      saveLocalAccount(pendingUserAccount);
      onAuthSuccess(pendingUserAccount);
    } catch (err: any) {
      setError(err.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Initial Signin Submission -> Request 2-Step Verification (2FA) OTP
  const handleSignInInit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError(null);
    setDevOtpNotice(null);

    try {
      const pwdHash = await hashPassword(password);
      let targetAccount: UserAccount | null = null;
      let accountFound = false;

      // 1. Check local registered users map
      const existingStr = localStorage.getItem("duotone_registered_users") || localStorage.getItem("lovewave_registered_users");
      if (existingStr) {
        const usersMap = JSON.parse(existingStr);
        const record = usersMap[cleanEmail];
        if (record) {
          accountFound = true;
          if (record.passwordHash === pwdHash || record.password === password) {
            targetAccount = record.account;
          } else {
            setError("Incorrect password. Please check and try again.");
            setLoading(false);
            return;
          }
        }
      }

      // 2. Validate against Firebase Auth
      if (!targetAccount) {
        try {
          const auth = getFirebaseAuth();
          const resFb = await signInWithEmailAndPassword(auth, cleanEmail, password);
          if (resFb.user) {
            accountFound = true;
            targetAccount = {
              uid: resFb.user.uid,
              displayName: resFb.user.displayName || cleanEmail.split("@")[0],
              email: resFb.user.email || cleanEmail,
              photoURL: resFb.user.photoURL,
            };
          }
        } catch (fbErr: any) {
          const code = fbErr?.code || "";
          if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
            setError("Incorrect password. Please check and try again.");
            setLoading(false);
            return;
          }
        }
      }

      // 3. If account was not found anywhere
      if (!targetAccount) {
        if (accountFound) {
          setError("Incorrect password. Please check and try again.");
        } else {
          setError("Account not found for this email. Please click '✨ Create Account' to register first.");
        }
        setLoading(false);
        return;
      }

      setPendingUserAccount(targetAccount);
      setPendingPasswordHash(pwdHash);

      // Send 2FA OTP code to user email
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          type: "login",
          name: targetAccount.displayName,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to send 2-Step Verification code.");
        setLoading(false);
        return;
      }

      if (data.devOtp) {
        setDevOtpNotice(`[Dev Helper] Your 2FA OTP code is: ${data.devOtp}`);
      }

      setOtpStep("login_2fa");
      setOtpInput("");
    } catch (err: any) {
      setError(err.message || "An error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify 2FA OTP -> Complete Signin
  const handleVerifyLogin2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserAccount || !otpInput.trim()) {
      setError("Please enter the 6-digit 2FA code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingUserAccount.email, otp: otpInput.trim() }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Invalid 2FA OTP code.");
        setLoading(false);
        return;
      }

      // Try Firebase Auth in parallel
      try {
        const auth = getFirebaseAuth();
        const resFb = await signInWithEmailAndPassword(auth, pendingUserAccount.email, password);
        if (resFb.user) {
          pendingUserAccount.uid = resFb.user.uid;
        }
      } catch (err: any) {
        console.warn("Firebase Auth sign-in notice:", err?.message || err);
      }

      saveLocalAccount(pendingUserAccount);
      onAuthSuccess(pendingUserAccount);
    } catch (err: any) {
      setError(err.message || "2FA verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingUserAccount) return;
    setLoading(true);
    setError(null);
    setDevOtpNotice(null);
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingUserAccount.email,
          type: otpStep === "signup_otp" ? "signup" : "login",
          name: pendingUserAccount.displayName,
        }),
      });
      const data = await res.json();
      if (data.devOtp) {
        setDevOtpNotice(`[Dev Helper] New OTP code: ${data.devOtp}`);
      }
    } catch {}
    setLoading(false);
  };

  if (user) return null;

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🎵</div>
          <h2 className="auth-title">Welcome to Duotone</h2>
          <p className="auth-subtitle">
            Create an account or sign in with 2-step email verification to access your private sync rooms.
          </p>
        </div>

        {otpStep === "form" && (
          <div className="room-tabs">
            <button
              className={`room-tab ${tab === "login" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setTab("login");
                setError(null);
              }}
            >
              🔑 Sign In
            </button>
            <button
              className={`room-tab ${tab === "signup" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setTab("signup");
                setError(null);
              }}
            >
              ✨ Create Account
            </button>
          </div>
        )}

        {error && <div className="auth-error-banner">⚠️ {error}</div>}
        {devOtpNotice && (
          <div style={{ background: "rgba(244, 63, 94, 0.2)", border: "1px solid rgba(244, 63, 94, 0.5)", color: "#fda4af", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", margin: "12px 0" }}>
            🔑 {devOtpNotice}
          </div>
        )}

        {otpStep === "signup_otp" ? (
          <form className="auth-form" onSubmit={handleVerifySignupOtp}>
            <div className="auth-field">
              <label className="auth-label">Verify Email OTP Code</label>
              <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "10px" }}>
                We sent a 6-digit verification code to <strong>{pendingUserAccount?.email}</strong>.
              </p>
              <input
                type="text"
                className="auth-input-field"
                placeholder="Enter 6-digit OTP code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Verifying OTP…" : "✅ Verify Email & Create Account"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#ec4899", cursor: "pointer", fontSize: "13px" }}
                onClick={handleResendOtp}
              >
                🔄 Resend OTP Code
              </button>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "13px" }}
                onClick={() => setOtpStep("form")}
              >
                ← Back to Signup
              </button>
            </div>
          </form>
        ) : otpStep === "login_2fa" ? (
          <form className="auth-form" onSubmit={handleVerifyLogin2fa}>
            <div className="auth-field">
              <label className="auth-label">2-Step Verification OTP Code</label>
              <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "10px" }}>
                Security check: Enter the 6-digit OTP code sent to <strong>{pendingUserAccount?.email}</strong>.
              </p>
              <input
                type="text"
                className="auth-input-field"
                placeholder="Enter 6-digit OTP code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Verifying 2FA…" : "🔐 Complete Sign In"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#ec4899", cursor: "pointer", fontSize: "13px" }}
                onClick={handleResendOtp}
              >
                🔄 Resend OTP Code
              </button>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "13px" }}
                onClick={() => setOtpStep("form")}
              >
                ← Back to Login
              </button>
            </div>
          </form>
        ) : tab === "signup" ? (
          <form className="auth-form" onSubmit={handleSignUpInit}>
            <div className="auth-field">
              <label className="auth-label">Your Name</label>
              <input
                type="text"
                className="auth-input-field"
                placeholder="e.g. Alex or Sam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                className="auth-input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                className="auth-input-field"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                type="password"
                className="auth-input-field"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Sending Email OTP…" : "✨ Send Verification OTP & Continue"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignInInit}>
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                className="auth-input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                className="auth-input-field"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Authenticating…" : "🔑 Continue to 2-Step Verification"}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <div>🔒 Permanent Login • 2-Step Verification Enabled</div>
          <div className="auth-win-download-container">
            <a
              href="https://github.com/vinodh1299/MUSIC-SYNC/releases/latest/download/Duotone-Setup.exe"
              target="_blank"
              rel="noopener noreferrer"
              className="auth-win-download-link"
              title="Download & Install Duotone for Windows (.exe)"
            >
              💻 Download for Windows (.exe)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
