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
  const [isFloating, setIsFloating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Floating Draggable State (position coordinates)
  const [pos, setPos] = useState({ x: 40, y: 80 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Mark unread messages as seen when chat window is open
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

  // Launch Standalone Native Browser Popup Window
  const openNewWindow = () => {
    if (typeof window !== "undefined") {
      onClose(); // close side drawer in main window
      window.open(
        "/chat-popout",
        "LovewaveChatWindow",
        "width=380,height=560,resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no"
      );
    }
  };

  // Mouse & Touch Drag Handlers for In-App Floating Mode
  const startDrag = (clientX: number, clientY: number) => {
    if (!isFloating) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!isFloating || (e.target as HTMLElement).tagName === "BUTTON") return;
    startDrag(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isFloating || (e.target as HTMLElement).tagName === "BUTTON") return;
    const touch = e.touches[0];
    if (touch) startDrag(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 340, e.clientX - dragStartRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 440, e.clientY - dragStartRef.current.y));
      setPos({ x: newX, y: newY });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      const touch = e.touches[0];
      if (touch) {
        const newX = Math.max(10, Math.min(window.innerWidth - 340, touch.clientX - dragStartRef.current.x));
        const newY = Math.max(10, Math.min(window.innerHeight - 440, touch.clientY - dragStartRef.current.y));
        setPos({ x: newX, y: newY });
      }
    };

    const endDrag = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", endDrag);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", endDrag);
    };
  }, [pos, isFloating]);

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

  if (!open) return null;

  const partnerOnline = partnerPresence ? partnerPresence.online : false;

  return (
    <div
      className={
        isFloating
          ? "chat-floating-window"
          : `chat-drawer ${open ? "chat-drawer-open" : ""}`
      }
      style={
        isFloating
          ? {
              left: `${pos.x}px`,
              top: `${pos.y}px`,
            }
          : undefined
      }
    >
      <div
        className={`chat-header ${isFloating ? "chat-header-draggable" : ""}`}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="chat-header-title">
          <div className="chat-header-drag-handle">
            {isFloating && <span className="drag-icon">⋮⋮</span>}
            <span>Notes to {partnerName}</span>
          </div>
          <span className={`chat-partner-status ${partnerOnline ? "status-online" : "status-offline"}`}>
            {partnerOnline ? "🟢 Online" : "🔴 Offline (Disconnected)"}
          </span>
        </div>

        <div className="chat-header-controls">
          <button
            className="chat-mode-btn"
            onClick={openNewWindow}
            title="Open chat in a separate native browser window to move across screens & desktops"
          >
            🗔 New Window
          </button>

          <button
            className="chat-mode-btn"
            onClick={() => setIsFloating(!isFloating)}
            title={isFloating ? "Dock chat to side drawer" : "Float chat window inside this tab"}
          >
            {isFloating ? "📌 Dock Side" : "↗ Float In-App"}
          </button>

          <button className="chat-close" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
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
        />
        <button className="chat-send" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
