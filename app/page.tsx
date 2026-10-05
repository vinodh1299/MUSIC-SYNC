"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal, { UserAccount } from "@/components/AuthModal";
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
  subscribeAllPresence,
  subscribePresence,
  subscribeQueue,
  subscribeState,
  subscribeTyping,
  DEFAULT_ROOM_ID,
} from "@/lib/room";
import { getFirebaseAuth, onAuthStateChanged, signOut } from "@/lib/firebase";

const NAMES: [string, string] = [
  process.env.NEXT_PUBLIC_PARTNER_A_NAME || "Partner A",
  process.env.NEXT_PUBLIC_PARTNER_B_NAME || "Partner B",
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
  const [user, setUser] = useState<UserAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);

  const [state, setState] = useState<PlaybackState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ sender: string; text: string } | null>(null);
  const [duckTrigger, setDuckTrigger] = useState(0);

  const prevMsgCountRef = useRef(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  // Restore permanent user session on mount
  useEffect(() => {
    try {
      const savedAcc = localStorage.getItem("duotone_user_account") || localStorage.getItem("lovewave_user_account");
      if (savedAcc) {
        const parsed = JSON.parse(savedAcc);
        setUser(parsed);
        if (parsed.displayName) {
          const firstName = parsed.displayName.split(" ")[0];
          setSelfName(firstName);
        }
      }
    } catch {}

    // Listen to Firebase Auth state as well
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        const acc: UserAccount = {
          uid: u.uid,
          displayName: u.displayName || u.email?.split("@")[0] || "User",
          email: u.email || "",
          photoURL: u.photoURL,
        };
        setUser(acc);
        try {
          localStorage.setItem("duotone_user_account", JSON.stringify(acc));
          localStorage.setItem("lovewave_user_account", JSON.stringify(acc));
        } catch {}
        if (acc.displayName) {
          setSelfName(acc.displayName.split(" ")[0]);
        }
      }
      setAuthChecked(true);
    });

    setAuthChecked(true);
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
      try {
        localStorage.setItem("duotone_active_room", clean);
        localStorage.setItem("lovewave_active_room", clean);
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem("duotone_active_room") || localStorage.getItem("lovewave_active_room");
        if (saved) setRoomId(saved);
      } catch {}
    }
  }, []);

  const handleAuthSuccess = (acc: UserAccount) => {
    setUser(acc);
    if (acc.displayName) {
      const firstName = acc.displayName.split(" ")[0];
      setSelfName(firstName);
    }
    try {
      localStorage.setItem("duotone_user_account", JSON.stringify(acc));
      localStorage.setItem("lovewave_user_account", JSON.stringify(acc));
    } catch {}
  };

  const handleSelectRoom = (code: string) => {
    const clean = code.trim().toUpperCase() || DEFAULT_ROOM_ID;
    setRoomId(clean);
    try {
      localStorage.setItem("duotone_active_room", clean);
      localStorage.setItem("lovewave_active_room", clean);
    } catch {}
  };

  const handleSwitchRoom = () => {
    setRoomId(null);
    try {
      localStorage.removeItem("duotone_active_room");
      localStorage.removeItem("lovewave_active_room");
    } catch {}
  };

  const handleSignOut = () => {
    try { signOut(getFirebaseAuth()); } catch {}
    try {
      localStorage.removeItem("duotone_user_account");
      localStorage.removeItem("lovewave_user_account");
      localStorage.removeItem("duotone_active_room");
      localStorage.removeItem("lovewave_active_room");
    } catch {}
    setUser(null);
    setRoomId(null);
    setSelfName(null);
  };

  const activeRoom = roomId || DEFAULT_ROOM_ID;

  const [allPresences, setAllPresences] = useState<Record<string, Presence>>({});

  // Subscribe to all presences in the active room
  useEffect(() => {
    if (!selfName || !roomId) return;
    const unsubAll = subscribeAllPresence(activeRoom, setAllPresences);
    return () => unsubAll();
  }, [selfName, roomId, activeRoom]);

  const partnerInfo = useMemo(() => {
    if (!allPresences || !selfName) return { name: null, presence: null };
    const entries = Object.entries(allPresences).filter(([name]) => name !== selfName);
    if (entries.length === 0) return { name: null, presence: null };
    const activeEntry = entries.find(([, p]) => p?.online) || entries[0];
    return { name: activeEntry[0], presence: activeEntry[1] };
  }, [allPresences, selfName]);

  const partnerName = partnerInfo.name;
  const partnerPresence = partnerInfo.presence;

  // Subscribe to room data when selfName and roomId are active
  useEffect(() => {
    if (!selfName || !roomId) return;
    const unsubState = subscribeState(activeRoom, setState);
    const unsubQueue = subscribeQueue(activeRoom, setQueue);
    const unsubChat = subscribeChat(activeRoom, (newMessages) => {
      if (newMessages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
        const latest = newMessages[newMessages.length - 1];
        if (latest && partnerName && latest.sender === partnerName) {
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

    const unsubTyping = partnerName
      ? subscribeTyping(activeRoom, partnerName, setIsPartnerTyping)
      : () => {};

    const presence = registerPresence(activeRoom, selfName);

    return () => {
      unsubState();
      unsubQueue();
      unsubChat();
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
        <p className="app-loading-text">Loading Duotone Sync…</p>
      </div>
    );
  }

  // Step 1: User Account Sign-Up / Sign-In Gate
  if (!user) {
    return (
      <AuthModal
        user={user}
        onAuthSuccess={handleAuthSuccess}
      />
    );
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
          onSignOut={handleSignOut}
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
