"use client";

import { useEffect, useState } from "react";
import { createRoom, generateRoomCode, joinRoomAuthorized } from "@/lib/room";
import { UserAccount } from "@/components/AuthModal";

export default function RoomSelectionModal({
  user,
  activeRoomId,
  onSelectRoom,
}: {
  user: UserAccount | null;
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}) {
  const [tab, setTab] = useState<"create" | "join">("join");
  const [joinCode, setJoinCode] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("duotone_recent_rooms") || localStorage.getItem("lovewave_recent_rooms");
      if (saved) {
        setRecentRooms(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const addRecentRoom = (code: string) => {
    try {
      const clean = code.trim().toUpperCase();
      const next = [clean, ...recentRooms.filter((r) => r !== clean)].slice(0, 5);
      setRecentRooms(next);
      localStorage.setItem("duotone_recent_rooms", JSON.stringify(next));
      localStorage.setItem("lovewave_recent_rooms", JSON.stringify(next));
    } catch {}
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (!clean) {
      setError("Please enter a valid Room Code");
      return;
    }

    setLoading(true);
    setError(null);

    const displayName = user?.displayName || user?.email || "User";
    const userEmail = user?.email || displayName;

    const authCheck = await joinRoomAuthorized(clean, displayName, userEmail);
    if (!authCheck.success) {
      setError(authCheck.message || "Cannot join this room.");
      setLoading(false);
      return;
    }

    addRecentRoom(clean);
    onSelectRoom(clean);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const displayName = user?.displayName || user?.email || "Host";
      const userEmail = user?.email || displayName;
      const codeToUse = customCode.trim() ? customCode.trim().toUpperCase() : generateRoomCode();
      const room = await createRoom(codeToUse, createTitle || "Private Music Lounge", displayName, userEmail);
      addRecentRoom(room.code);
      onSelectRoom(room.code);
    } catch (err: any) {
      setError(err.message || "Failed to create room. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user || activeRoomId) return null;

  return (
    <div className="auth-overlay">
      <div className="room-card">
        <div className="room-card-header">
          <div className="user-profile-badge">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="user-avatar" />
            ) : (
              <div className="user-avatar-placeholder">
                {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="user-profile-meta">
              <span className="user-display-name">{user.displayName || "Music Lover"}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>
        </div>

        <div className="room-tabs">
          <button
            className={`room-tab ${tab === "join" ? "active" : ""}`}
            onClick={() => setTab("join")}
          >
            🔑 Join Room with Code
          </button>
          <button
            className={`room-tab ${tab === "create" ? "active" : ""}`}
            onClick={() => setTab("create")}
          >
            ✨ Create New Private Room
          </button>
        </div>

        {error && <div className="auth-error-banner">⚠️ {error}</div>}

        {tab === "join" ? (
          <form className="room-form" onSubmit={handleJoin}>
            <p className="room-form-sub">
              Enter the <strong>Room Code</strong> shared by your partner to connect instantly and listen together.
            </p>
            <div className="room-input-group">
              <input
                type="text"
                className="room-input"
                placeholder="e.g. SYNC-8492 or main"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoFocus
              />
              <button type="submit" className="room-action-btn">
                Join Room 🚀
              </button>
            </div>

            {recentRooms.length > 0 && (
              <div className="recent-rooms-section">
                <span className="recent-rooms-title">Recent Rooms:</span>
                <div className="recent-rooms-list">
                  {recentRooms.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="recent-room-chip"
                      onClick={() => {
                        addRecentRoom(r);
                        onSelectRoom(r);
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          <form className="room-form" onSubmit={handleCreate}>
            <p className="room-form-sub">
              Create a new private sync room. Only people with your secret Room Code can join.
            </p>
            <div className="room-field">
              <label className="room-label">Room Title (Optional)</label>
              <input
                type="text"
                className="room-input-field"
                placeholder="e.g. Private Music Room"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
              />
            </div>

            <div className="room-field">
              <label className="room-label">Custom Room Code (Optional)</label>
              <input
                type="text"
                className="room-input-field"
                placeholder="Leave blank for auto-generated code"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              />
            </div>

            <button type="submit" className="room-action-btn primary-btn" disabled={loading}>
              {loading ? "Creating Room…" : "✨ Create & Enter Private Room"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
