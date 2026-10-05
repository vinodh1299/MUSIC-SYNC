import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { otpStore } from "@/lib/otpStore";

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

    // Generate 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes valid

    // Save to memory store
    otpStore.set(cleanEmail, { code, expiresAt, type: type || "verification" });

    // Attempt SMTP Email Delivery if configured
    let sentEmail = false;
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
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

        const subject =
          type === "signup"
            ? "🔑 lovewave - Verify Your Email Address"
            : "🔐 lovewave - 2-Step Verification Security Code";

        const textContent = `Hello ${name || "Music Lover"},\n\nYour 6-digit verification code is: ${code}\n\nThis code is valid for 10 minutes. Please enter it to complete your ${
          type === "signup" ? "account registration" : "sign in"
        }.\n\nIf you did not request this, please ignore this email.\n\nLovewave Music Sync`;

        await transporter.sendMail({
          from: `"lovewave Security" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: cleanEmail,
          subject,
          text: textContent,
          html: `
            <div style="font-family: sans-serif; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #ec4899; margin-top: 0;">🎵 lovewave</h2>
              <p style="font-size: 16px; color: #cbd5e1;">Hello ${name || "Music Lover"},</p>
              <p style="font-size: 15px; color: #94a3b8;">Your 6-digit security code for <strong>${
                type === "signup" ? "Email Verification" : "2-Step Verification"
              }</strong> is:</p>
              <div style="background: #1e293b; padding: 16px; text-align: center; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #f43f5e; margin: 24px 0;">
                ${code}
              </div>
              <p style="font-size: 13px; color: #64748b;">This code is valid for 10 minutes. Do not share this code with anyone.</p>
            </div>
          `,
        });
        sentEmail = true;
      } catch (err: any) {
        console.error("SMTP Delivery Warning:", err.message || err);
      }
    }

    console.log(`[OTP GENERATED] ${cleanEmail} -> ${code} (Sent SMTP: ${sentEmail})`);

    return NextResponse.json({
      success: true,
      message: sentEmail
        ? `Security OTP sent to ${cleanEmail}. Please check your inbox.`
        : `Security OTP generated for ${cleanEmail}.`,
      // Return devOtp when SMTP is not configured so local development / testing works smoothly!
      devOtp: sentEmail ? undefined : code,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send OTP code." },
      { status: 500 }
    );
  }
}
