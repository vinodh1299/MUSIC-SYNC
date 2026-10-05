import { NextResponse } from "next/server";
import { otpStore } from "@/lib/otpStore";

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
    const cleanOtp = otp.trim();

    const record = otpStore.get(cleanEmail);

    if (!record) {
      return NextResponse.json(
        { success: false, message: "No OTP request found for this email. Please request a new code." },
        { status: 400 }
      );
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanEmail);
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

    // OTP verified successfully - clear token
    otpStore.delete(cleanEmail);

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
