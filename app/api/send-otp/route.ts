import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const FIREBASE_DB_URL =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  "https://music-sync-822b1-default-rtdb.firebaseio.com";

export async function POST(req: Request) {
  try {
    const { email, type, name } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "A valid email address is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanEmailKey = cleanEmail.replace(/[^a-z0-9]/g, "_");

    // Generate 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes valid

    // Save to Firebase Realtime Database for persistent serverless availability across Vercel Lambdas
    try {
      await fetch(`${FIREBASE_DB_URL}/otps/${cleanEmailKey}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, expiresAt, type: type || "verification" }),
      });
    } catch (dbErr: any) {
      console.warn("Firebase OTP store notice:", dbErr?.message || dbErr);
    }

    const subject =
      type === "signup"
        ? "🔑 lovewave - Verify Your Email Address"
        : "🔐 lovewave - 2-Step Verification Security Code";

    const textContent = `Hello ${name || "Music Lover"},\n\nYour 6-digit verification code is: ${code}\n\nThis code is valid for 10 minutes. Please enter it to complete your ${
      type === "signup" ? "account registration" : "sign in"
    }.\n\nIf you did not request this, please ignore this email.\n\nLovewave Music Sync`;

    const htmlContent = `
      <div style="font-family: sans-serif; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; max-width: 480px; margin: 0 auto; border: 1px solid #1e293b;">
        <h2 style="color: #ec4899; margin-top: 0; font-size: 22px;">🎵 lovewave</h2>
        <p style="font-size: 16px; color: #cbd5e1; margin-bottom: 8px;">Hello ${name || "Music Lover"},</p>
        <p style="font-size: 15px; color: #94a3b8; margin-top: 0;">Your 6-digit security code for <strong>${
          type === "signup" ? "Email Verification" : "2-Step Verification"
        }</strong> is:</p>
        <div style="background: #1e293b; padding: 18px; text-align: center; border-radius: 10px; font-size: 34px; font-weight: bold; letter-spacing: 10px; color: #f43f5e; margin: 24px 0; border: 1px solid #334155;">
          ${code}
        </div>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">This code is valid for 10 minutes. Do not share this code with anyone.</p>
      </div>
    `;

    let sentEmail = false;
    const resendApiKey =
      process.env.RESEND_API_KEY ||
      (process.env.SMTP_PASS?.startsWith("re_") ? process.env.SMTP_PASS : null);

    // 1. Try Resend HTTP API directly first
    if (resendApiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.SMTP_FROM || "Lovewave <onboarding@resend.dev>",
            to: [cleanEmail],
            subject,
            text: textContent,
            html: htmlContent,
          }),
        });

        const resendData = await resendRes.json();
        if (resendRes.ok) {
          sentEmail = true;
          console.log(`[RESEND SUCCESS] Sent OTP to ${cleanEmail}:`, resendData.id);
        } else {
          console.warn("[RESEND NOTICE]", resendData.message || resendData);
        }
      } catch (resendErr: any) {
        console.error("Resend API Delivery Error:", resendErr?.message || resendErr);
      }
    }

    // 2. Fallback to Nodemailer SMTP
    if (!sentEmail && process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Boolean(process.env.SMTP_SECURE === "true"),
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: `"Lovewave Security" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: cleanEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });
        sentEmail = true;
      } catch (err: any) {
        console.error("SMTP Delivery Warning:", err.message || err);
      }
    }

    console.log(`[OTP GENERATED] ${cleanEmail} -> ${code} (Sent Email: ${sentEmail})`);

    return NextResponse.json({
      success: true,
      message: sentEmail
        ? `Security OTP sent to ${cleanEmail}. Please check your email inbox.`
        : `Security OTP generated for ${cleanEmail}.`,
      devOtp: sentEmail ? undefined : code,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send OTP code." },
      { status: 500 }
    );
  }
}
