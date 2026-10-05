"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import RoomSelectionModal from "@/components/RoomSelectionModal";
import IdentityGate from "@/components/IdentityGate";
import ConnectionThread from "@/components/ConnectionThread";
import Player from "@/components/Player";
import SearchPanel from "@/components/SearchPanel";
import ChatPanel from "@/components/ChatPanel";
import {
  ChatMessage,
  PlaybackState,
  Presence,
  QueueItem,
  registerPresence,
  subscribeChat,
  subscribePresence,
  subscribeQueue,
  subscribeState,
  subscribeTyping,
  DEFAULT_ROOM_ID,
} from "@/lib/room";
import { getFirebaseAuth, onAuthStateChanged, User } from "@/lib/firebase";

const NAMES: [string, string] = [
  process.env.NEXT_PUBLIC_PARTNER_A_NAME || "Vinodh",
  process.env.NEXT_PUBLIC_PARTNER_B_NAME || "Keerthana",
];

function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (err) {
    console.warn("Chime error:", err);
  }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);

  const [state, setState] = useState<PlaybackState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ sender: string; text: string } | null>(null);
  const [duckTrigger, setDuckTrigger] = useState(0);

  const prevMsgCountRef = useRef(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  // Listen to Firebase Auth state
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);

      // Auto-set selfName based on Google profile display name if available
      if (u?.displayName) {
        const firstName = u.displayName.split(" ")[0];
        setSelfName(firstName);
      }
    });
    return () => unsub();
  }, []);

  // Check URL query param for room share link (e.g. ?room=SYNC-8492) or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");

    if (roomFromUrl) {
      const clean = roomFromUrl.trim().toUpperCase();
      setRoomId(clean);
      try { localStorage.setItem("lovewave_active_room", clean); } catch {}
    } else {
      try {
        const saved = localStorage.getItem("lovewave_active_room");
        if (saved) setRoomId(saved);
      } catch {}
    }
  }, []);

  const handleSelectRoom = (code: string) => {
    const clean = code.trim().toUpperCase() || DEFAULT_ROOM_ID;
    setRoomId(clean);
    try { localStorage.setItem("lovewave_active_room", clean); } catch {}
  };

  const handleSwitchRoom = () => {
    setRoomId(null);
    try { localStorage.removeItem("lovewave_active_room"); } catch {}
  };

  const activeRoom = roomId || DEFAULT_ROOM_ID;

  const partnerName = useMemo(
    () => NAMES.find((n) => n !== selfName) || NAMES[1],
    [selfName]
  );

  // Subscribe to room data when selfName and roomId are active
  useEffect(() => {
    if (!selfName || !roomId) return;
    const unsubState = subscribeState(activeRoom, setState);
    const unsubQueue = subscribeQueue(activeRoom, setQueue);
    const unsubChat = subscribeChat(activeRoom, (newMessages) => {
      if (newMessages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
        const latest = newMessages[newMessages.length - 1];
        if (latest && latest.sender === partnerName) {
          const isChatVisibleAndFocused =
            chatOpenRef.current &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible" &&
            document.hasFocus();

          if (!isChatVisibleAndFocused) {
            setDuckTrigger((prev) => prev + 1);
            playNotificationChime();
            setToastNotification({ sender: latest.sender, text: latest.text });
            setTimeout(() => setToastNotification(null), 5000);
          }
        }
      }
      prevMsgCountRef.current = newMessages.length;
      setMessages(newMessages);
    });
    const unsubPresence = subscribePresence(activeRoom, partnerName, setPartnerPresence);
    const unsubTyping = subscribeTyping(activeRoom, partnerName, setIsPartnerTyping);
    const presence = registerPresence(activeRoom, selfName);

    return () => {
      unsubState();
      unsubQueue();
      unsubChat();
      unsubPresence();
      unsubTyping();
      presence.goOffline();
    };
  }, [selfName, partnerName, roomId, activeRoom]);

  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!selfName || !roomId) return;
    registerPresence(activeRoom, selfName).setListening(listening);
  }, [listening, selfName, roomId, activeRoom]);

  const unreadCount = useMemo(() => {
    if (!selfName) return 0;
    return messages.filter(
      (m) => m.sender === partnerName && (!m.seenBy || !m.seenBy.includes(selfName))
    ).length;
  }, [messages, partnerName, selfName]);

  // Loading spinner while verifying auth state
  if (!authChecked) {
    return (
      <div className="app-loading-screen">
        <div className="auth-logo spinner-logo">🎵</div>
        <p className="app-loading-text">Loading Lovewave Sync…</p>
      </div>
    );
  }

  // Step 1: User Authentication Gate
  if (!user) {
    return <AuthModal user={user} onAuthSuccess={setUser} />;
  }

  // Step 2: Room Selection / Creation Gate
  if (!roomId) {
    return (
      <RoomSelectionModal
        user={user}
        activeRoomId={roomId}
        onSelectRoom={handleSelectRoom}
      />
    );
  }

  // Step 3: Identity Gate fallback if selfName is not yet set
  if (!selfName) {
    return <IdentityGate names={NAMES} onReady={setSelfName} />;
  }

  return (
    <main className="page">
      {/* Floating In-App Toast Notification Banner */}
      {toastNotification && (
        <div className="in-app-toast" onClick={() => setChatOpen(true)}>
          <div className="toast-icon">💬</div>
          <div className="toast-content">
            <p className="toast-sender">{toastNotification.sender}</p>
            <p className="toast-text">{toastNotification.text}</p>
          </div>
          <span className="toast-action">View</span>
        </div>
      )}

      <header className="page-header">
        <ConnectionThread
          selfName={selfName}
          partnerName={partnerName}
          partnerPresence={partnerPresence}
          roomId={activeRoom}
          user={user}
          onSwitchRoom={handleSwitchRoom}
        />
        <button
          className={`chat-toggle ${unreadCount > 0 ? "has-unread" : ""}`}
          onClick={() => setChatOpen(true)}
        >
          💬 Notes
          {unreadCount > 0 ? (
            <span className="unread-badge">{unreadCount}</span>
          ) : (
            messages.length > 0 && <span className="chat-badge" />
          )}
        </button>
      </header>

      <section className="stage">
        <Player
          selfName={selfName}
          partnerName={partnerName}
          partnerPresence={partnerPresence}
          state={state}
          queue={queue}
          onListeningChange={setListening}
          duckTrigger={duckTrigger}
          roomId={activeRoom}
        />
        <SearchPanel selfName={selfName} queue={queue} currentVideoId={state?.videoId} roomId={activeRoom} />
      </section>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selfName={selfName}
        partnerName={partnerName}
        partnerPresence={partnerPresence}
        messages={messages}
        isPartnerTyping={isPartnerTyping}
        roomId={activeRoom}
      />
    </main>
  );
}
