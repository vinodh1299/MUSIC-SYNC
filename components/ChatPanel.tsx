"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, sendChatMessage } from "@/lib/room";

export default function ChatPanel({
  open,
  onClose,
  selfName,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  selfName: string;
  messages: ChatMessage[];
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChatMessage(selfName, text.trim());
    setText("");
  };

  return (
    <div className={`chat-drawer ${open ? "chat-drawer-open" : ""}`}>
      <div className="chat-header">
        <span>Notes to each other</span>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="chat-empty">Say something.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.sender === selfName ? "chat-msg-self" : ""}`}>
            <span className="chat-sender">{m.sender}</span>
            <p className="chat-text">{m.text}</p>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={send}>
        <input
          className="chat-input"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="chat-send" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
