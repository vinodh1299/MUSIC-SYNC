"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, sendChatMessage, setTypingStatus, markMessagesSeen, Presence } from "@/lib/room";

export default function ChatPanel({
  open,
  onClose,
  selfName,
  partnerName,
  partnerPresence,
  messages,
  isPartnerTyping,
}: {
  open: boolean;
  onClose: () => void;
  selfName: string;
  partnerName: string;
  partnerPresence: Presence | null;
  messages: ChatMessage[];
  isPartnerTyping: boolean;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Mark unread messages as seen when chat drawer is open
  useEffect(() => {
    if (open && messages.length > 0) {
      markMessagesSeen(selfName, messages);
    }
  }, [open, messages, selfName]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, open, isPartnerTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

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
    if (!text.trim()) return;
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

  const partnerOnline = partnerPresence ? partnerPresence.online : false;

  return (
    <div className={`chat-drawer ${open ? "chat-drawer-open" : ""}`}>
      <div className="chat-header">
        <div className="chat-header-title">
          <span>Notes to {partnerName}</span>
          <span className={`chat-partner-status ${partnerOnline ? "status-online" : "status-offline"}`}>
            {partnerOnline ? "🟢 Online" : "🔴 Offline (Disconnected)"}
          </span>
        </div>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
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
        />
        <button className="chat-send" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
