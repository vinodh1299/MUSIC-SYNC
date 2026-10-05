"use client";

import { getDb, ref, onValue, set, update, push, remove, onDisconnect, serverTimestamp, DEFAULT_ROOM_ID } from "./firebase";

export { DEFAULT_ROOM_ID };

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

export type RoomMetadata = {
  code: string;
  title: string;
  createdBy: string;
  createdAt: number | object;
};

// Database references scoped to dynamic roomId
const roomPath = (roomId: string) => `rooms/${roomId || DEFAULT_ROOM_ID}`;
const stateRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/state`);
const queueRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/queue`);
const chatRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/chat`);
const presenceRef = (roomId: string, name: string) => ref(getDb(), `${roomPath(roomId)}/presence/${name}`);
const typingRef = (roomId: string, name: string) => ref(getDb(), `${roomPath(roomId)}/typing/${name}`);
const metadataRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/metadata`);

// Generate 6-character room code (e.g., SYNC-8492)
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYNC-${rand}`;
}

export async function createRoom(code: string, title: string, createdBy: string): Promise<RoomMetadata> {
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "") || generateRoomCode();
  const meta: RoomMetadata = {
    code: cleanCode,
    title: title.trim() || "Lovewave Music Sync Room",
    createdBy,
    createdAt: serverTimestamp(),
  };
  await set(metadataRef(cleanCode), meta);
  return meta;
}

export function subscribeState(roomId: string, cb: (s: PlaybackState | null) => void) {
  return onValue(stateRef(roomId), (snap) => cb(snap.val()));
}

export function subscribeQueue(roomId: string, cb: (items: QueueItem[]) => void) {
  return onValue(queueRef(roomId), (snap) => {
    const val = snap.val() || {};
    cb(Object.entries(val).map(([id, v]: [string, any]) => ({ id, ...v })));
  });
}

export function subscribeChat(roomId: string, cb: (messages: ChatMessage[]) => void) {
  return onValue(chatRef(roomId), (snap) => {
    const val = snap.val() || {};
    cb(
      Object.entries(val)
        .map(([id, v]: [string, any]) => ({ id, ...v }))
        .sort((a, b) => (typeof a.ts === "number" ? a.ts : 0) - (typeof b.ts === "number" ? b.ts : 0))
    );
  });
}

export function subscribePresence(roomId: string, name: string, cb: (p: Presence | null) => void) {
  return onValue(presenceRef(roomId, name), (snap) => cb(snap.val()));
}

export function subscribeTyping(roomId: string, partnerName: string, cb: (isTyping: boolean) => void) {
  return onValue(typingRef(roomId, partnerName), (snap) => {
    const val = snap.val();
    cb(Boolean(val?.isTyping));
  });
}

export async function setTypingStatus(roomId: string, selfName: string, isTyping: boolean) {
  const myTypingRef = typingRef(roomId, selfName);
  await set(myTypingRef, { isTyping, updatedAt: serverTimestamp() });
  if (isTyping) {
    onDisconnect(myTypingRef).set({ isTyping: false, updatedAt: serverTimestamp() });
  }
}

export async function pushState(roomId: string, partial: Partial<PlaybackState>, actor: string) {
  await update(stateRef(roomId), {
    ...partial,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  });
}

export async function addToQueue(roomId: string, item: Omit<QueueItem, "id">, currentQueue: QueueItem[] = []) {
  // If already in queue, skip adding duplicate
  const exists = currentQueue.some((q) => q.videoId === item.videoId);
  if (exists) return;
  await push(queueRef(roomId), item);
}

export async function insertPlayNextInQueue(roomId: string, item: Omit<QueueItem, "id">, currentQueue: QueueItem[] = []) {
  const db = getDb();
  const targetRoom = roomId || DEFAULT_ROOM_ID;
  const remaining = currentQueue.filter((q) => q.videoId !== item.videoId);
  const newId = push(queueRef(targetRoom)).key as string;
  const newItem = { id: newId, ...item };
  const updatedQueue = [newItem, ...remaining];

  // Atomic update queue in Firebase
  const updates: Record<string, any> = {};
  updates[`rooms/${targetRoom}/queue`] = null;
  for (const q of updatedQueue) {
    updates[`rooms/${targetRoom}/queue/${q.id}`] = {
      videoId: q.videoId,
      title: q.title,
      thumbnail: q.thumbnail,
      addedBy: q.addedBy,
    };
  }
  await update(ref(db), updates);
}

export async function removeFromQueue(roomId: string, id: string) {
  await remove(ref(getDb(), `${roomPath(roomId)}/queue/${id}`));
}

export async function clearQueue(roomId: string) {
  await remove(ref(getDb(), `${roomPath(roomId)}/queue`));
}

export async function sendChatMessage(
  roomId: string,
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
  await push(chatRef(roomId), payload);
}

export async function markMessagesSeen(roomId: string, selfName: string, messages: ChatMessage[]) {
  const targetRoom = roomId || DEFAULT_ROOM_ID;
  const updates: Record<string, any> = {};
  let hasUpdates = false;

  for (const m of messages) {
    if (m.id && m.sender !== selfName) {
      const seenBy = m.seenBy || [];
      if (!seenBy.includes(selfName)) {
        updates[`rooms/${targetRoom}/chat/${m.id}/seenBy`] = [...seenBy, selfName];
        updates[`rooms/${targetRoom}/chat/${m.id}/seenAt`] = Date.now();
        hasUpdates = true;
      }
    }
  }

  if (hasUpdates) {
    await update(ref(getDb()), updates);
  }
}

export function registerPresence(roomId: string, name: string) {
  const pRef = presenceRef(roomId, name);
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
