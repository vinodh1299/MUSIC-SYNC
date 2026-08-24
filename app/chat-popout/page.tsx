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

function fmtTime(ts: number | object | undefined | null) {
  if (!ts || typeof ts !== "number") return "";
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function ChatMessageItem({
  message,
  selfName,
  partnerName,
  onReply,
  onQuoteClick,
}: {
  message: ChatMessage;
  selfName: string;
  partnerName: string;
  onReply: (msg: ChatMessage) => void;
  onQuoteClick?: (targetId?: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const isSelf = message.sender === selfName;
  const sentTime = fmtTime(message.ts);
  const isSeen = message.seenBy && message.seenBy.includes(partnerName);
  const seenTime = isSeen ? fmtTime(message.seenAt) : null;

  const handleStart = (clientX: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    setIsSwiping(true);
  };

  const handleMove = (clientX: number) => {
    if (!isDraggingRef.current) return;
    const deltaX = clientX - startXRef.current;
    if (deltaX > 0) {
      const resistanceX = Math.min(80, deltaX * 0.6);
      setDragX(resistanceX);
    }
  };

  const handleEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsSwiping(false);

    if (dragX >= 45) {
      onReply(message);
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(35); } catch {}
      }
    }
    setDragX(0);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`chat-swipe-wrapper ${isSelf ? "chat-swipe-self" : "chat-swipe-partner"}`}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => e.touches[0] && handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => e.touches[0] && handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
    >
      <div
        className={`swipe-reply-indicator ${dragX >= 45 ? "threshold-active" : ""}`}
        style={{ opacity: Math.min(1, dragX / 40) }}
      >
        <span className="swipe-icon">↩️</span>
      </div>

      <div
        className={`chat-msg ${isSelf ? "chat-msg-self" : "chat-msg-partner"} ${dragX > 0 ? "swiping" : ""}`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.25)",
        }}
      >
        {message.replyTo && (
          <div
            className="chat-reply-quote"
            onClick={(e) => {
              e.stopPropagation();
              onQuoteClick?.(message.replyTo?.id);
            }}
          >
            <span className="quote-sender">{message.replyTo.sender}</span>
            <p className="quote-text">{message.replyTo.text}</p>
          </div>
        )}

        <span className="chat-sender">{message.sender}</span>
        <p className="chat-text">{message.text}</p>

        <div className="chat-msg-footer">
          {sentTime && <span className="chat-msg-time">{sentTime}</span>}
          {isSelf && (
            <span className={`chat-seen-badge ${isSeen ? "seen" : "unseen"}`}>
              {isSeen ? `Seen ${seenTime ? seenTime : ""} ✓✓` : "Sent ✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPopoutPage() {
  const [selfName, setSelfName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleReplyTo = (msg: ChatMessage) => {
    setReplyingTo(msg);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleQuoteClick = (targetId?: string) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
    }
  };

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
    
    sendChatMessage(
      selfName,
      text.trim(),
      replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
    );
    
    setText("");
    setReplyingTo(null);
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

          {messages.map((m) => (
            <ChatMessageItem
              key={m.id}
              message={m}
              selfName={selfName}
              partnerName={partnerName}
              onReply={handleReplyTo}
              onQuoteClick={handleQuoteClick}
            />
          ))}

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

        {/* Replying Banner above Chat Input Row */}
        {replyingTo && (
          <div className="replying-banner">
            <div className="replying-meta">
              <span className="replying-label">Replying to {replyingTo.sender}</span>
              <p className="replying-snippet">{replyingTo.text}</p>
            </div>
            <button type="button" className="replying-cancel" onClick={() => setReplyingTo(null)} title="Cancel reply">
              ✕
            </button>
          </div>
        )}

        <form className="chat-input-row" onSubmit={send}>
          <input
            ref={inputRef}
            className="chat-input"
            placeholder={replyingTo ? `Replying to ${replyingTo.sender}...` : `Type a note to ${partnerName}...`}
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
