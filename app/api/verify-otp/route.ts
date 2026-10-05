import { NextResponse } from "next/server";

const FIREBASE_DB_URL =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  "https://music-sync-822b1-default-rtdb.firebaseio.com";

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: "Email and OTP code are required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanEmailKey = cleanEmail.replace(/[^a-z0-9]/g, "_");
    const cleanOtp = otp.trim();

    // Fetch stored OTP record from Firebase Realtime Database
    let record: { code: string; expiresAt: number; type: string } | null = null;
    try {
      const resDb = await fetch(`${FIREBASE_DB_URL}/otps/${cleanEmailKey}.json`, {
        cache: "no-store",
      });
      record = await resDb.json();
    } catch (dbErr: any) {
      console.warn("Firebase OTP lookup notice:", dbErr?.message || dbErr);
    }

    if (!record || !record.code) {
      return NextResponse.json(
        { success: false, message: "No OTP request found for this email. Please request a new code." },
        { status: 400 }
      );
    }

    if (Date.now() > record.expiresAt) {
      try {
        await fetch(`${FIREBASE_DB_URL}/otps/${cleanEmailKey}.json`, { method: "DELETE" });
      } catch {}
      return NextResponse.json(
        { success: false, message: "OTP code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    if (record.code !== cleanOtp) {
      return NextResponse.json(
        { success: false, message: "Incorrect OTP code. Please check and try again." },
        { status: 400 }
      );
    }

    // OTP verified successfully - delete token from Firebase
    try {
      await fetch(`${FIREBASE_DB_URL}/otps/${cleanEmailKey}.json`, { method: "DELETE" });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "OTP code verified successfully.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to verify OTP code." },
      { status: 500 }
    );
  }
}
