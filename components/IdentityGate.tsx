"use client";

import { useEffect, useState } from "react";

export const STORAGE_KEY = "lovewave:identity";

export function clearIdentity() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
}

export default function IdentityGate({
  names,
  onReady,
}: {
  names: [string, string];
  onReady: (name: string) => void;
}) {
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      if (names.includes(existing)) {
        setSaved(existing);
        onReady(existing);
      } else {
        // Clear obsolete cached names (like Alex/Sam)
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);

  if (!checked || saved) return null;

  const choose = (name: string) => {
    window.localStorage.setItem(STORAGE_KEY, name);
    setSaved(name);
    onReady(name);
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <p className="gate-eyebrow">before we begin</p>
        <h1 className="gate-title">Who&rsquo;s listening?</h1>
        <p className="gate-sub">Choose your identity for this room:</p>
        <div className="gate-options">
          {names.map((name) => (
            <button key={name} className="gate-btn" onClick={() => choose(name)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
