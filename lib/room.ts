"use client";

import { getDb, ref, onValue, set, update, push, remove, onDisconnect, serverTimestamp, ROOM_ID } from "./firebase";

export type PlaybackState = {
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
  isPlaying: boolean;
  positionSec: number; // playback position at the moment of updatedAt
  updatedAt: number | object; // serverTimestamp
  updatedBy: string | null; // partner name who triggered the change
};

export type QueueItem = {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  addedBy: string;
};

export type ChatMessage = {
  id?: string;
  sender: string;
  text: string;
  ts: number | object;
  seenAt?: number | null;
  seenBy?: string[];
};

export type Presence = {
  online: boolean;
  listening: boolean;
  lastSeen: number | object;
};

const stateRef = () => ref(getDb(), `rooms/${ROOM_ID}/state`);
const queueRef = () => ref(getDb(), `rooms/${ROOM_ID}/queue`);
const chatRef = () => ref(getDb(), `rooms/${ROOM_ID}/chat`);
const presenceRef = (name: string) => ref(getDb(), `rooms/${ROOM_ID}/presence/${name}`);
const typingRef = (name: string) => ref(getDb(), `rooms/${ROOM_ID}/typing/${name}`);

export function subscribeState(cb: (s: PlaybackState | null) => void) {
  return onValue(stateRef(), (snap) => cb(snap.val()));
}

export function subscribeQueue(cb: (items: QueueItem[]) => void) {
  return onValue(queueRef(), (snap) => {
    const val = snap.val() || {};
    cb(Object.entries(val).map(([id, v]: [string, any]) => ({ id, ...v })));
  });
}

export function subscribeChat(cb: (messages: ChatMessage[]) => void) {
  return onValue(chatRef(), (snap) => {
    const val = snap.val() || {};
    cb(
      Object.entries(val)
        .map(([id, v]: [string, any]) => ({ id, ...v }))
        .sort((a, b) => (typeof a.ts === "number" ? a.ts : 0) - (typeof b.ts === "number" ? b.ts : 0))
    );
  });
}

export function subscribePresence(name: string, cb: (p: Presence | null) => void) {
  return onValue(presenceRef(name), (snap) => cb(snap.val()));
}

export function subscribeTyping(partnerName: string, cb: (isTyping: boolean) => void) {
  return onValue(typingRef(partnerName), (snap) => {
    const val = snap.val();
    cb(Boolean(val?.isTyping));
  });
}

export async function setTypingStatus(selfName: string, isTyping: boolean) {
  const myTypingRef = typingRef(selfName);
  await set(myTypingRef, { isTyping, updatedAt: serverTimestamp() });
  if (isTyping) {
    onDisconnect(myTypingRef).set({ isTyping: false, updatedAt: serverTimestamp() });
  }
}

export async function pushState(partial: Partial<PlaybackState>, actor: string) {
  await update(stateRef(), {
    ...partial,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  });
}

export async function addToQueue(item: Omit<QueueItem, "id">) {
  await push(queueRef(), item);
}

export async function removeFromQueue(id: string) {
  await remove(ref(getDb(), `rooms/${ROOM_ID}/queue/${id}`));
}

export async function sendChatMessage(sender: string, text: string) {
  await push(chatRef(), {
    sender,
    text,
    ts: serverTimestamp(),
    seenAt: null,
    seenBy: [sender],
  });
}

export async function markMessagesSeen(selfName: string, messages: ChatMessage[]) {
  const db = getDb();
  const updates: Record<string, any> = {};
  let updatedCount = 0;

  for (const msg of messages) {
    if (msg.id && msg.sender !== selfName && (!msg.seenBy || !msg.seenBy.includes(selfName))) {
      const seenBy = Array.from(new Set([...(msg.seenBy || []), selfName]));
      updates[`rooms/${ROOM_ID}/chat/${msg.id}/seenBy`] = seenBy;
      updates[`rooms/${ROOM_ID}/chat/${msg.id}/seenAt`] = Date.now();
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await update(ref(db), updates);
  }
}

// Registers presence for a partner and wires up auto-offline on disconnect.
export function registerPresence(name: string) {
  const myRef = presenceRef(name);
  set(myRef, { online: true, listening: false, lastSeen: serverTimestamp() });
  onDisconnect(myRef).set({ online: false, listening: false, lastSeen: serverTimestamp() });
  return {
    setListening: (listening: boolean) =>
      update(myRef, { listening, lastSeen: serverTimestamp() }),
    goOffline: () => set(myRef, { online: false, listening: false, lastSeen: serverTimestamp() }),
  };
}
