"use client";

import {
  getDb,
  ref,
  onValue,
  get,
  set,
  update,
  push,
  remove,
  onDisconnect,
  serverTimestamp,
  DEFAULT_ROOM_ID,
} from "./firebase";
import { encryptMessage, decryptMessage } from "./crypto";

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
  maxMembers?: number;
};

// Database references scoped to dynamic roomId
const roomPath = (roomId: string) => `rooms/${roomId || DEFAULT_ROOM_ID}`;
const stateRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/state`);
const queueRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/queue`);
const chatRef = (roomId: string) => ref(getDb(), `${roomPath(roomId)}/chat`);
const presenceRef = (roomId: string, name: string) =>
  ref(getDb(), `${roomPath(roomId)}/presence/${name}`);
const allPresenceRef = (roomId: string) =>
  ref(getDb(), `${roomPath(roomId)}/presence`);
const membersRef = (roomId: string) =>
  ref(getDb(), `${roomPath(roomId)}/members`);
const typingRef = (roomId: string, name: string) =>
  ref(getDb(), `${roomPath(roomId)}/typing/${name}`);
const metadataRef = (roomId: string) =>
  ref(getDb(), `${roomPath(roomId)}/metadata`);

// Generate 6-character room code (e.g., SYNC-8492)
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYNC-${rand}`;
}

export async function createRoom(
  code: string,
  title: string,
  createdBy: string,
  userEmail?: string
): Promise<RoomMetadata> {
  const cleanCode =
    code.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "") || generateRoomCode();
  const meta: RoomMetadata = {
    code: cleanCode,
    title: title.trim() || "Private Music Sync Room",
    createdBy,
    createdAt: serverTimestamp(),
    maxMembers: 2,
  };
  await set(metadataRef(cleanCode), meta);

  // Register creator as authorized member #1
  const cleanEmailKey = (userEmail || createdBy)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
  await update(ref(getDb(), `${roomPath(cleanCode)}/members/${cleanEmailKey}`), {
    name: createdBy,
    email: userEmail || createdBy,
    joinedAt: serverTimestamp(),
  });

  return meta;
}

// Check room capacity and authorize member joining (max 2 members)
export async function joinRoomAuthorized(
  code: string,
  userName: string,
  userEmail: string
): Promise<{ success: boolean; message?: string }> {
  const targetRoom = code.trim().toUpperCase();
  if (!targetRoom) {
    return { success: false, message: "Please enter a valid Room Code." };
  }

  const cleanEmailKey = userEmail.toLowerCase().replace(/[^a-z0-9]/g, "_");

  try {
    const memSnap = await get(membersRef(targetRoom));
    const members = memSnap.val() || {};
    const memberKeys = Object.keys(members);

    // If user is already a registered member, allow access
    if (members[cleanEmailKey] || memberKeys.some((k) => members[k]?.name === userName)) {
      return { success: true };
    }

    // If room has less than 2 members, add user as authorized member #2
    if (memberKeys.length < 2) {
      await update(ref(getDb(), `${roomPath(targetRoom)}/members/${cleanEmailKey}`), {
        name: userName,
        email: userEmail,
        joinedAt: serverTimestamp(),
      });
      return { success: true };
    }

    // Otherwise room is full and restricted
    return {
      success: false,
      message: `Access Denied: Room ${targetRoom} is a private 2-person room and already has 2 members connected. No other people can join without the code/invitation.`,
    };
  } catch (err: any) {
    // If DB check fails, fallback to allowing join
    return { success: true };
  }
}

export function subscribeState(
  roomId: string,
  cb: (s: PlaybackState | null) => void
) {
  return onValue(stateRef(roomId), (snap) => cb(snap.val()));
}

export function subscribeQueue(
  roomId: string,
  cb: (items: QueueItem[]) => void
) {
  return onValue(queueRef(roomId), (snap) => {
    const val = snap.val() || {};
    cb(Object.entries(val).map(([id, v]: [string, any]) => ({ id, ...v })));
  });
}

// Chat subscription with automatic End-to-End Encryption (E2EE) decryption
export function subscribeChat(
  roomId: string,
  cb: (messages: ChatMessage[]) => void
) {
  return onValue(chatRef(roomId), async (snap) => {
    const val = snap.val() || {};
    const rawList = Object.entries(val)
      .map(([id, v]: [string, any]) => ({ id, ...v }))
      .sort(
        (a, b) =>
          (typeof a.ts === "number" ? a.ts : 0) -
          (typeof b.ts === "number" ? b.ts : 0)
      );

    // Decrypt messages client-side
    const decryptedList: ChatMessage[] = await Promise.all(
      rawList.map(async (msg) => {
        const decryptedText = await decryptMessage(msg.text, roomId);
        let decryptedReply = msg.replyTo;
        if (msg.replyTo && msg.replyTo.text) {
          const decReplyText = await decryptMessage(msg.replyTo.text, roomId);
          decryptedReply = { ...msg.replyTo, text: decReplyText };
        }
        return {
          ...msg,
          text: decryptedText,
          replyTo: decryptedReply,
        };
      })
    );

    cb(decryptedList);
  });
}

export function subscribePresence(
  roomId: string,
  name: string,
  cb: (p: Presence | null) => void
) {
  return onValue(presenceRef(roomId, name), (snap) => cb(snap.val()));
}

// Subscribe to all presences in the room to dynamically discover connected partner
export function subscribeAllPresence(
  roomId: string,
  cb: (presences: Record<string, Presence>) => void
) {
  return onValue(allPresenceRef(roomId), (snap) => {
    cb(snap.val() || {});
  });
}

export function subscribeTyping(
  roomId: string,
  partnerName: string,
  cb: (isTyping: boolean) => void
) {
  return onValue(typingRef(roomId, partnerName), (snap) => {
    const val = snap.val();
    cb(Boolean(val?.isTyping));
  });
}

export async function setTypingStatus(
  roomId: string,
  selfName: string,
  isTyping: boolean
) {
  const myTypingRef = typingRef(roomId, selfName);
  await set(myTypingRef, { isTyping, updatedAt: serverTimestamp() });
  if (isTyping) {
    onDisconnect(myTypingRef).set({
      isTyping: false,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function pushState(
  roomId: string,
  partial: Partial<PlaybackState>,
  actor: string
) {
  await update(stateRef(roomId), {
    ...partial,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  });
}

export async function addToQueue(
  roomId: string,
  item: Omit<QueueItem, "id">,
  currentQueue: QueueItem[] = []
) {
  const exists = currentQueue.some((q) => q.videoId === item.videoId);
  if (exists) return;
  await push(queueRef(roomId), item);
}

export async function insertPlayNextInQueue(
  roomId: string,
  item: Omit<QueueItem, "id">,
  currentQueue: QueueItem[] = []
) {
  const db = getDb();
  const targetRoom = roomId || DEFAULT_ROOM_ID;
  const remaining = currentQueue.filter((q) => q.videoId !== item.videoId);
  const newId = push(queueRef(targetRoom)).key as string;
  const newItem = { id: newId, ...item };
  const updatedQueue = [newItem, ...remaining];

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

// Send chat message with End-to-End Encryption (E2EE)
export async function sendChatMessage(
  roomId: string,
  sender: string,
  text: string,
  replyTo?: { id?: string; sender: string; text: string } | null
) {
  const encryptedText = await encryptMessage(text, roomId);
  let encryptedReply = replyTo || null;
  if (replyTo && replyTo.text) {
    const encReplyText = await encryptMessage(replyTo.text, roomId);
    encryptedReply = { ...replyTo, text: encReplyText };
  }

  const payload: any = {
    sender,
    text: encryptedText,
    ts: serverTimestamp(),
    seenAt: null,
    seenBy: [sender],
  };
  if (encryptedReply) {
    payload.replyTo = {
      id: encryptedReply.id || null,
      sender: encryptedReply.sender,
      text: encryptedReply.text,
    };
  }
  await push(chatRef(roomId), payload);
}

export async function markMessagesSeen(
  roomId: string,
  selfName: string,
  messages: ChatMessage[]
) {
  const targetRoom = roomId || DEFAULT_ROOM_ID;
  const updates: Record<string, any> = {};
  let hasUpdates = false;

  for (const m of messages) {
    if (m.id && m.sender !== selfName) {
      const seenBy = m.seenBy || [];
      if (!seenBy.includes(selfName)) {
        updates[`rooms/${targetRoom}/chat/${m.id}/seenBy`] = [
          ...seenBy,
          selfName,
        ];
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
