"use client";

import { useState } from "react";
import { Presence } from "@/lib/room";
import { UserAccount } from "@/components/AuthModal";
import { getFirebaseAuth, signOut } from "@/lib/firebase";

export default function ConnectionThread({
  selfName,
  partnerName,
  partnerPresence,
  roomId,
  user,
  onSwitchRoom,
  onSignOut,
}: {
  selfName: string;
  partnerName: string | null;
  partnerPresence: Presence | null;
  roomId: string;
  user: UserAccount | null;
  onSwitchRoom: () => void;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hasPartner = Boolean(partnerName);
  const partnerOnline = hasPartner && Boolean(partnerPresence?.online);
  const bothListening = partnerOnline && Boolean(partnerPresence?.listening);

  const copyRoomLink = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSignOutClick = () => {
    try {
      signOut(getFirebaseAuth());
    } catch {}
    onSignOut();
  };

  return (
    <div className="thread-bar-container">
      <div className={`thread ${bothListening ? "thread-active" : ""}`}>
        <div className="thread-node">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="thread-avatar" />
          ) : (
            <span className="thread-dot thread-dot-self" />
          )}
          <span className="thread-name">{selfName} (You)</span>
        </div>

        <svg
          className="thread-line"
          viewBox="0 0 240 24"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1="4"
            y1="12"
            x2="236"
            y2="12"
            className={`thread-path ${partnerOnline ? "" : "thread-path-dim"}`}
          />
        </svg>

        <div className="thread-node">
          <span className={`thread-dot ${partnerOnline ? "thread-dot-on" : "thread-dot-off"}`} />
          <span className="thread-name">
            {hasPartner ? (
              `${partnerName} ${partnerOnline ? "🟢 Online" : "🔴 Offline"}`
            ) : (
              <span style={{ opacity: 0.75, fontStyle: "italic" }}>
                ⏳ Waiting for partner...
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="room-control-bar">
        <div className="room-code-badge" onClick={copyRoomLink} title="Click to copy Room Share Link">
          <span className="room-code-label">🔑 Room:</span>
          <span className="room-code-value">{roomId}</span>
          <button className="copy-code-btn">
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>
        </div>

        <a
          href="https://github.com/vinodh1299/MUSIC-SYNC/releases/latest/download/Duotone-Setup.exe"
          target="_blank"
          rel="noopener noreferrer"
          className="header-action-btn download-win-btn"
          title="Download & Install Duotone for Windows (.exe)"
        >
          💻 Windows App
        </a>

        <button className="header-action-btn" onClick={onSwitchRoom} title="Switch or Create Room">
          🔄 Switch Room
        </button>

        {user && (
          <button className="header-action-btn danger-btn" onClick={handleSignOutClick} title="Sign Out">
            🚪 Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
