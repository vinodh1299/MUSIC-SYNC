"use client";

// SHA-256 Password Hashing with Static Salt
export async function hashPassword(password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    // Fallback for non-browser environment
    return `hash_${password.length}_${password.substring(0, 3)}`;
  }
  const enc = new TextEncoder();
  const data = enc.encode(password + "_LOVEWAVE_PASS_SALT_2026");
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Derive a Cryptographic Key from Room ID for End-to-End Encryption (E2EE)
async function getE2EEKey(roomId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(roomId + "_LOVEWAVE_ROOM_SALT_2026"),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("e2ee_salt_" + roomId),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt plain text using AES-GCM-256
export async function encryptMessage(text: string, roomId: string): Promise<string> {
  if (!text || typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    return text;
  }
  try {
    const key = await getE2EEKey(roomId);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(text)
    );
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const cipherHex = Array.from(new Uint8Array(ciphertext))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `e2ee:${ivHex}:${cipherHex}`;
  } catch (err) {
    console.error("E2EE Encryption Error:", err);
    return text;
  }
}

// Decrypt AES-GCM-256 ciphertext
export async function decryptMessage(encryptedPayload: string, roomId: string): Promise<string> {
  if (!encryptedPayload || !encryptedPayload.startsWith("e2ee:")) {
    return encryptedPayload; // Return as-is if already unencrypted/legacy
  }
  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    return encryptedPayload;
  }
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) return encryptedPayload;
    const ivHex = parts[1];
    const cipherHex = parts[2];

    const ivMatches = ivHex.match(/.{1,2}/g);
    const cipherMatches = cipherHex.match(/.{1,2}/g);
    if (!ivMatches || !cipherMatches) return encryptedPayload;

    const iv = new Uint8Array(ivMatches.map((byte) => parseInt(byte, 16)));
    const ciphertext = new Uint8Array(cipherMatches.map((byte) => parseInt(byte, 16)));
    const key = await getE2EEKey(roomId);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    return "[Encrypted Message]";
  }
}
