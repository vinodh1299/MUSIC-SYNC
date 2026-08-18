"use client";

import { Presence } from "@/lib/room";
import { clearIdentity } from "./IdentityGate";

export default function ConnectionThread({
  selfName,
  partnerName,
  partnerPresence,
}: {
  selfName: string;
  partnerName: string;
  partnerPresence: Presence | null;
}) {
  const partnerOnline = !!partnerPresence?.online;
  const bothListening = partnerOnline && !!partnerPresence?.listening;

  return (
    <div className={`thread ${bothListening ? "thread-active" : ""}`}>
      <div className="thread-node">
        <span className="thread-dot thread-dot-self" />
        <span className="thread-name">{selfName}</span>
        <button
          className="switch-identity-btn"
          onClick={clearIdentity}
          title="Switch between Vinodh & Keerthana"
        >
          (Switch)
        </button>
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
        <span className="thread-name">{partnerName}</span>
      </div>
    </div>
  );
}
