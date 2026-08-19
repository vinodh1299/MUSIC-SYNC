"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IdentityGate from "@/components/IdentityGate";
import {
  ChatMessage,
  Presence,
  registerPresence,
  subscribeChat,
  subscribePresence,
  subscribeTyping,
  sendChatMessage,
  setTypingStatus,
  markMessagesSeen,
} from "@/lib/room";

const NAMES: [string, string] = [
  process.env.NEXT_PUBLIC_PARTNER_A_NAME || "Vinodh",
  process.env.NEXT_PUBLIC_PARTNER_B_NAME || "Keerthana",
];

export default function ChatPopoutPage() {
  const [selfName, setSelfName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  const partnerName = useMemo(
    () => NAMES.find((n) => n !== selfName) || NAMES[1],
    [selfName]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("lovewave_identity");
      if (stored && NAMES.includes(stored)) {
        setSelfName(stored);
      }
    }
  }, []);

  useEffect(() => {
    if (!selfName) return;
    const unsubChat = subscribeChat((newMsgs) => {
      setMessages(newMsgs);
      markMessagesSeen(selfName, newMsgs);
    });
    const unsubPresence = subscribePresence(partnerName, setPartnerPresence);
    const unsubTyping = subscribeTyping(partnerName, setIsPartnerTyping);
    const presence = registerPresence(selfName);

    return () => {
      unsubChat();
      unsubPresence();
      unsubTyping();
      presence.goOffline();
    };
  }, [selfName, partnerName]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPartnerTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    if (!selfName) return;

    if (val.trim().length > 0) {
      setTypingStatus(selfName, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus(selfName, false);
      }, 2500);
    } else {
      setTypingStatus(selfName, false);
    }
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !selfName) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(selfName, false);
    sendChatMessage(selfName, text.trim());
    setText("");
  };

  const fmtTime = (ts: number | object | undefined | null) => {
    if (!ts || typeof ts !== "number") return "";
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  };

  if (!selfName) {
    return (
      <main className="popout-container">
        <IdentityGate
          names={NAMES}
          onReady={(name) => {
            if (typeof window !== "undefined") {
              localStorage.setItem("lovewave_identity", name);
            }
            setSelfName(name);
          }}
        />
      </main>
    );
  }

  const partnerOnline = partnerPresence ? partnerPresence.online : false;

  return (
    <main className="popout-container">
      <div className="chat-popout-window">
        <div className="chat-header">
          <div className="chat-header-title">
            <span className="popout-title-text">💬 Notes to {partnerName}</span>
            <span className={`chat-partner-status ${partnerOnline ? "status-online" : "status-offline"}`}>
              {partnerOnline ? "🟢 Online" : "🔴 Offline (Disconnected)"}
            </span>
          </div>
        </div>

        <div className="chat-list" ref={listRef}>
          {messages.length === 0 && <p className="chat-empty">Say something to {partnerName}.</p>}

          {messages.map((m) => {
            const isSelf = m.sender === selfName;
            const sentTime = fmtTime(m.ts);
            const isSeen = m.seenBy && m.seenBy.includes(partnerName);
            const seenTime = isSeen ? fmtTime(m.seenAt) : null;

            return (
              <div key={m.id} className={`chat-msg ${isSelf ? "chat-msg-self" : ""}`}>
                <span className="chat-sender">{m.sender}</span>
                <p className="chat-text">{m.text}</p>

                <div className="chat-msg-footer">
                  {sentTime && <span className="chat-msg-time">{sentTime}</span>}
                  {isSelf && (
                    <span className={`chat-seen-badge ${isSeen ? "seen" : "unseen"}`}>
                      {isSeen ? `Seen ${seenTime ? seenTime : ""} ✓✓` : "Sent ✓"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Real-Time Typing Indicator */}
          {isPartnerTyping && (
            <div className="chat-typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-text">{partnerName} is typing...</span>
            </div>
          )}
        </div>

        <form className="chat-input-row" onSubmit={send}>
          <input
            className="chat-input"
            placeholder={`Type a note to ${partnerName}...`}
            value={text}
            onChange={handleInputChange}
            autoFocus
          />
          <button className="chat-send" type="submit">
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
