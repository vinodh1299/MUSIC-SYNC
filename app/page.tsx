"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/room";

const NAMES: [string, string] = [
  process.env.NEXT_PUBLIC_PARTNER_A_NAME || "Partner A",
  process.env.NEXT_PUBLIC_PARTNER_B_NAME || "Partner B",
];

export default function Home() {
  const [selfName, setSelfName] = useState<string | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const partnerName = useMemo(
    () => NAMES.find((n) => n !== selfName) || NAMES[1],
    [selfName]
  );

  useEffect(() => {
    if (!selfName) return;
    const unsubState = subscribeState(setState);
    const unsubQueue = subscribeQueue(setQueue);
    const unsubChat = subscribeChat(setMessages);
    const unsubPresence = subscribePresence(partnerName, setPartnerPresence);
    const presence = registerPresence(selfName);

    return () => {
      unsubState();
      unsubQueue();
      unsubChat();
      unsubPresence();
      presence.goOffline();
    };
  }, [selfName, partnerName]);

  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!selfName) return;
    registerPresence(selfName).setListening(listening);
  }, [listening, selfName]);

  if (!selfName) {
    return <IdentityGate names={NAMES} onReady={setSelfName} />;
  }

  return (
    <main className="page">
      <header className="page-header">
        <ConnectionThread
          selfName={selfName}
          partnerName={partnerName}
          partnerPresence={partnerPresence}
        />
        <button className="chat-toggle" onClick={() => setChatOpen(true)}>
          Notes
          {messages.length > 0 && <span className="chat-badge" />}
        </button>
      </header>

      <section className="stage">
        <Player selfName={selfName} state={state} onListeningChange={setListening} />
        <SearchPanel selfName={selfName} queue={queue} currentVideoId={state?.videoId} />
      </section>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selfName={selfName}
        messages={messages}
      />
    </main>
  );
}
