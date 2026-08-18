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
        .sort((a, b) => (a.ts as number) - (b.ts as number))
    );
  });
}

export function subscribePresence(name: string, cb: (p: Presence | null) => void) {
  return onValue(presenceRef(name), (snap) => cb(snap.val()));
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
  await push(chatRef(), { sender, text, ts: serverTimestamp() });
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
