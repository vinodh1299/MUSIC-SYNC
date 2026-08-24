"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, sendChatMessage, setTypingStatus, markMessagesSeen, Presence } from "@/lib/room";

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
    // Only allow dragging left-to-right (positive deltaX) like WhatsApp
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
      // Trigger WhatsApp Swipe to Reply!
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
      {/* Background Swipe Icon Indicator */}
      <div
        className={`swipe-reply-indicator ${dragX >= 45 ? "threshold-active" : ""}`}
        style={{ opacity: Math.min(1, dragX / 40) }}
      >
        <span className="swipe-icon">↩️</span>
      </div>

      {/* Message Bubble Container with Smooth Spring Transform */}
      <div
        className={`chat-msg ${isSelf ? "chat-msg-self" : "chat-msg-partner"} ${dragX > 0 ? "swiping" : ""}`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.25)",
        }}
      >
        {/* WhatsApp-Style Quoted Message Preview inside Bubble */}
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
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Handle Swipe/Drag-to-Reply trigger
  const handleReplyTo = (msg: ChatMessage) => {
    setReplyingTo(msg);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Scroll to original quoted message on quote tap
  const handleQuoteClick = (targetId?: string) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
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
    
    sendChatMessage(
      selfName,
      text.trim(),
      replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
    );
    
    setText("");
    setReplyingTo(null);
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
        />
        <button className="chat-send" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
