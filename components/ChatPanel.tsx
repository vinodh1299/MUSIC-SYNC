"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, sendChatMessage, setTypingStatus, markMessagesSeen, Presence, DEFAULT_ROOM_ID } from "@/lib/room";

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
      className={`chat-swipe-wrapper ${isSelf ? "chat-swipe-self" : "chat-swipe-partner"}`}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
    >
      <div
        className={`swipe-reply-indicator ${dragX >= 45 ? "threshold-active" : ""}`}
        style={{
          opacity: Math.min(1, dragX / 30),
          transform: `translateY(-50%) scale(${Math.min(1, dragX / 45)})`,
        }}
      >
        <span className="swipe-icon">↩️</span>
      </div>

      <div
        id={`msg-${message.id}`}
        className={`chat-msg ${isSelf ? "chat-msg-self" : "chat-msg-partner"} ${isSwiping ? "swiping" : ""}`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
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

export default function ChatPanel({
  open,
  onClose,
  selfName,
  partnerName,
  partnerPresence,
  messages,
  isPartnerTyping,
  roomId = DEFAULT_ROOM_ID,
}: {
  open: boolean;
  onClose: () => void;
  selfName: string;
  partnerName: string;
  partnerPresence: Presence | null;
  messages: ChatMessage[];
  isPartnerTyping: boolean;
  roomId?: string;
}) {
  const [text, setText] = useState("");
  const [isFloating, setIsFloating] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState({ x: 40, y: 80 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (open && messages.length > 0) {
      markMessagesSeen(roomId, selfName, messages);
    }
  }, [open, messages, selfName, roomId]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, open, isPartnerTyping]);

  const openNewWindow = () => {
    if (typeof window !== "undefined") {
      onClose();
      window.open(
        `/chat-popout?room=${encodeURIComponent(roomId)}`,
        "LovewaveChatWindow",
        "width=380,height=560,resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no"
      );
    }
  };

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

  const startDrag = (clientX: number, clientY: number) => {
    if (!isFloating) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const onDrag = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;
    setPos({ x: newX, y: newY });
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
  };

  const handleTyping = (val: string) => {
    setText(val);
    setTypingStatus(roomId, selfName, true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(roomId, selfName, false);
    }, 2000);
  };

  const submitMsg = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(roomId, selfName, false);

    sendChatMessage(roomId, selfName, clean, replyingTo);
    setText("");
    setReplyingTo(null);
  };

  if (!open) return null;

  return (
    <div
      className={isFloating ? "chat-floating-window" : "chat-drawer chat-drawer-open"}
      style={isFloating ? { left: `${pos.x}px`, top: `${pos.y}px` } : {}}
      onMouseMove={(e) => onDrag(e.clientX, e.clientY)}
      onMouseUp={stopDrag}
      onTouchMove={(e) => onDrag(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={stopDrag}
    >
      <div
        className={`chat-header ${isFloating ? "chat-header-draggable" : ""}`}
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
      >
        <div className="chat-header-title">
          <div className="chat-header-drag-handle">
            {isFloating && <span className="drag-icon">⋮⋮</span>}
            <span>Chat {partnerName ? `with ${partnerName}` : ""}</span>
            <span style={{ fontSize: "11px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "2px 6px", borderRadius: "10px", marginLeft: "6px", fontWeight: "600" }}>
              🔒 End-to-End Encrypted
            </span>
          </div>
          <span
            className={`chat-partner-status ${
              partnerPresence?.online ? "status-online" : "status-offline"
            }`}
          >
            {partnerPresence?.online ? "🟢 Active Now" : "🔴 Offline"}
          </span>
        </div>

        <div className="chat-header-controls">
          <button
            className="chat-mode-btn"
            onClick={() => setIsFloating(!isFloating)}
            title={isFloating ? "Dock to Side Drawer" : "Float on Screen"}
          >
            {isFloating ? "📌 Dock" : "🔲 Float"}
          </button>
          <button
            className="chat-mode-btn"
            onClick={openNewWindow}
            title="Open in Standalone Native Window"
          >
            ↗️ Pop Out
          </button>
          <button className="chat-close" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </div>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">No messages yet. Swipe right on a message to reply!</p>
        ) : (
          messages.map((m, idx) => (
            <ChatMessageItem
              key={m.id || idx}
              message={m}
              selfName={selfName}
              partnerName={partnerName}
              onReply={handleReplyTo}
              onQuoteClick={handleQuoteClick}
            />
          ))
        )}

        {isPartnerTyping && (
          <div className="chat-typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-text">{partnerName} is typing…</span>
          </div>
        )}
      </div>

      {replyingTo && (
        <div className="replying-banner">
          <div className="replying-meta">
            <span className="replying-label">Replying to {replyingTo.sender}</span>
            <p className="replying-snippet">{replyingTo.text}</p>
          </div>
          <button className="replying-cancel" onClick={() => setReplyingTo(null)} title="Cancel reply">
            ✕
          </button>
        </div>
      )}

      <form className="chat-input-row" onSubmit={submitMsg}>
        <input
          ref={inputRef}
          className="chat-input"
          placeholder={`Message ${partnerName}…`}
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
        />
        <button className="chat-send" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
