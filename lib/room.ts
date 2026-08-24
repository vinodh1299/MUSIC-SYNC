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
  replyTo?: {
    id?: string;
    sender: string;
    text: string;
  } | null;
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

export async function addToQueue(item: Omit<QueueItem, "id">, currentQueue: QueueItem[] = []) {
  // If already in queue, skip adding duplicate
  const exists = currentQueue.some((q) => q.videoId === item.videoId);
  if (exists) return;
  await push(queueRef(), item);
}

export async function insertPlayNextInQueue(item: Omit<QueueItem, "id">, currentQueue: QueueItem[] = []) {
  const db = getDb();
  // Filter out any existing copy of this videoId
  const remaining = currentQueue.filter((q) => q.videoId !== item.videoId);
  const newId = push(queueRef()).key as string;
  const newItem = { id: newId, ...item };
  const updatedQueue = [newItem, ...remaining];

  // Atomic update queue in Firebase
  const updates: Record<string, any> = {};
  updates[`rooms/${ROOM_ID}/queue`] = null;
  for (const q of updatedQueue) {
    updates[`rooms/${ROOM_ID}/queue/${q.id}`] = {
      videoId: q.videoId,
      title: q.title,
      thumbnail: q.thumbnail,
      addedBy: q.addedBy,
    };
  }
  await update(ref(db), updates);
}

export async function removeFromQueue(id: string) {
  await remove(ref(getDb(), `rooms/${ROOM_ID}/queue/${id}`));
}

export async function clearQueue() {
  await remove(ref(getDb(), `rooms/${ROOM_ID}/queue`));
}

export async function sendChatMessage(
  sender: string,
  text: string,
  replyTo?: { id?: string; sender: string; text: string } | null
) {
  const payload: any = {
    sender,
    text,
    ts: serverTimestamp(),
    seenAt: null,
    seenBy: [sender],
  };
  if (replyTo) {
    payload.replyTo = {
      id: replyTo.id || null,
      sender: replyTo.sender,
      text: replyTo.text,
    };
  }
  await push(chatRef(), payload);
}

export async function markMessagesSeen(selfName: string, messages: ChatMessage[]) {
  const updates: Record<string, any> = {};
  let hasUpdates = false;

  for (const m of messages) {
    if (m.id && m.sender !== selfName) {
      const seenBy = m.seenBy || [];
      if (!seenBy.includes(selfName)) {
        updates[`rooms/${ROOM_ID}/chat/${m.id}/seenBy`] = [...seenBy, selfName];
        updates[`rooms/${ROOM_ID}/chat/${m.id}/seenAt`] = Date.now();
        hasUpdates = true;
      }
    }
  }

  if (hasUpdates) {
    await update(ref(getDb()), updates);
  }
}

export function registerPresence(name: string) {
  const pRef = presenceRef(name);
  const myPresence: Presence = {
    online: true,
    listening: false,
    lastSeen: serverTimestamp(),
  };

  set(pRef, myPresence);
  onDisconnect(pRef).set({
    online: false,
    listening: false,
    lastSeen: serverTimestamp(),
  });

  return {
    setListening: (listening: boolean) => {
      update(pRef, { listening, lastSeen: serverTimestamp() });
    },
    goOffline: () => {
      set(pRef, {
        online: false,
        listening: false,
        lastSeen: serverTimestamp(),
      });
    },
  };
}
