"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lovewave:identity";

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
    if (existing && names.includes(existing)) {
      setSaved(existing);
      onReady(existing);
    }
    setChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <p className="gate-sub">This device will remember you.</p>
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
