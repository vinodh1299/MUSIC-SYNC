"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/room";

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

  const partnerName = useMemo(
    () => NAMES.find((n) => n !== selfName) || NAMES[1],
    [selfName]
  );

  useEffect(() => {
    if (!selfName) return;
    const unsubState = subscribeState(setState);
    const unsubQueue = subscribeQueue(setQueue);
    const unsubChat = subscribeChat((newMessages) => {
      // Detect incoming message from partner
      if (newMessages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
        const latest = newMessages[newMessages.length - 1];
        if (latest && latest.sender === partnerName) {
          // Check if chat is open AND actively focused & visible on screen
          const isChatVisibleAndFocused =
            chatOpenRef.current &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible" &&
            document.hasFocus();

          // If chat is closed OR user is in another tab/window -> PLAY CHIME, DUCK AUDIO, & SHOW TOAST!
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
    const unsubPresence = subscribePresence(partnerName, setPartnerPresence);
    const unsubTyping = subscribeTyping(partnerName, setIsPartnerTyping);
    const presence = registerPresence(selfName);

    return () => {
      unsubState();
      unsubQueue();
      unsubChat();
      unsubPresence();
      unsubTyping();
      presence.goOffline();
    };
  }, [selfName, partnerName]);

  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!selfName) return;
    registerPresence(selfName).setListening(listening);
  }, [listening, selfName]);

  // Compute unread message count
  const unreadCount = useMemo(() => {
    if (!selfName) return 0;
    return messages.filter(
      (m) => m.sender === partnerName && (!m.seenBy || !m.seenBy.includes(selfName))
    ).length;
  }, [messages, partnerName, selfName]);

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
        />
        <SearchPanel selfName={selfName} queue={queue} currentVideoId={state?.videoId} />
      </section>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selfName={selfName}
        partnerName={partnerName}
        partnerPresence={partnerPresence}
        messages={messages}
        isPartnerTyping={isPartnerTyping}
      />
    </main>
  );
}
