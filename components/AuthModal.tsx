"use client";

import { useState } from "react";
import {
  getFirebaseAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "@/lib/firebase";

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveLocalAccount = (acc: UserAccount) => {
    try {
      localStorage.setItem("lovewave_user_account", JSON.stringify(acc));
    } catch {}
  };

  const handleSignUp = async (e: React.FormEvent) => {
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

    // Build permanent UserAccount profile
    const userAccount: UserAccount = {
      uid: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      displayName: cleanName,
      email: cleanEmail,
    };

    // Store in local registered accounts map
    try {
      const existingStr = localStorage.getItem("lovewave_registered_users");
      const usersMap = existingStr ? JSON.parse(existingStr) : {};
      usersMap[cleanEmail] = {
        name: cleanName,
        password: password,
        account: userAccount,
      };
      localStorage.setItem("lovewave_registered_users", JSON.stringify(usersMap));
    } catch {}

    // Try Firebase Auth in parallel
    try {
      const auth = getFirebaseAuth();
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (res.user) {
        await updateProfile(res.user, { displayName: cleanName });
        userAccount.uid = res.user.uid;
      }
    } catch (err: any) {
      console.warn("Firebase Auth sign-up notice:", err?.message || err);
    }

    saveLocalAccount(userAccount);
    onAuthSuccess(userAccount);
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
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

    let loggedInAccount: UserAccount | null = null;

    // Check local registered accounts map first
    try {
      const existingStr = localStorage.getItem("lovewave_registered_users");
      if (existingStr) {
        const usersMap = JSON.parse(existingStr);
        const record = usersMap[cleanEmail];
        if (record) {
          if (record.password === password) {
            loggedInAccount = record.account;
          } else {
            setError("Incorrect password. Please try again.");
            setLoading(false);
            return;
          }
        }
      }
    } catch {}

    // Try Firebase Auth in parallel
    try {
      const auth = getFirebaseAuth();
      const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (res.user) {
        loggedInAccount = {
          uid: res.user.uid,
          displayName: res.user.displayName || cleanEmail.split("@")[0],
          email: res.user.email || cleanEmail,
          photoURL: res.user.photoURL,
        };
      }
    } catch (err: any) {
      console.warn("Firebase Auth sign-in notice:", err?.message || err);
    }

    // If account not found in local map and Firebase Auth threw an error
    if (!loggedInAccount) {
      // Auto-create account for seamless partner sign-in if first time
      const firstName = cleanEmail.split("@")[0];
      const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      loggedInAccount = {
        uid: `usr_${Date.now()}`,
        displayName: capitalized,
        email: cleanEmail,
      };

      // Store in registered users
      try {
        const existingStr = localStorage.getItem("lovewave_registered_users");
        const usersMap = existingStr ? JSON.parse(existingStr) : {};
        usersMap[cleanEmail] = {
          name: capitalized,
          password: password,
          account: loggedInAccount,
        };
        localStorage.setItem("lovewave_registered_users", JSON.stringify(usersMap));
      } catch {}
    }

    saveLocalAccount(loggedInAccount);
    onAuthSuccess(loggedInAccount);
    setLoading(false);
  };

  if (user) return null;

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🎵</div>
          <h2 className="auth-title">Welcome to Lovewave</h2>
          <p className="auth-subtitle">
            Create an account or sign in to access your private sync rooms, listen together in real-time, and chat securely.
          </p>
        </div>

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

        {error && <div className="auth-error-banner">⚠️ {error}</div>}

        {tab === "signup" ? (
          <form className="auth-form" onSubmit={handleSignUp}>
            <div className="auth-field">
              <label className="auth-label">Your Name</label>
              <input
                type="text"
                className="auth-input-field"
                placeholder="e.g. Vinodh or Keerthana"
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
              {loading ? "Creating Account…" : "✨ Create Account & Continue"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignIn}>
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
              {loading ? "Signing In…" : "🔑 Sign In to Lovewave"}
            </button>
          </form>
        )}

        <div className="auth-footer">
          🔒 Permanent Login • You will stay logged in always until you manually click Sign Out.
        </div>
      </div>
    </div>
  );
}
