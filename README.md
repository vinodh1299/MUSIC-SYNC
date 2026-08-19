# lovewave - Synced Music & Video Player for Vinodh & Keerthana

> **Release**: Compact Background Audio, YouTube Sync & Live iOS Lock Screen Integration

A single, private room for Vinodh and Keerthana to listen to music and watch videos at the exact same time —
with 2-way synced play/pause/seek, shared queue, and a live chat drawer.

**Important technical note:** YT Music has no public API for embedding or controlling playback on
a third-party site — Google only exposes that for regular YouTube (via the IFrame Player API).
So this app plays audio through YouTube's official player, with a UI styled to feel like a focused
music player. Any song on YT Music is also on YouTube, so in practice this doesn't limit what you
can play.

There's no login system — this is built for exactly two people who both know the URL. The first
time each of you opens the site, you pick your name once and the browser remembers it.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up Firebase (powers the sync + presence + chat)

1. Go to https://console.firebase.google.com and create a new project (free "Spark" plan is enough).
2. In the project, go to **Build → Realtime Database → Create Database**. Start in **test mode** for
   now (you'll lock it down in step 4).
3. Go to **Project settings → General**, scroll to "Your apps", click the **Web** icon (`</>`) to
   register a web app. Copy the config values it gives you.
4. Paste those values into `.env.local` (copy `.env.local.example` to `.env.local` first) as the
   `NEXT_PUBLIC_FIREBASE_*` variables. `NEXT_PUBLIC_FIREBASE_DATABASE_URL` looks like
   `https://your-project-id-default-rtdb.firebaseio.com`.
5. Lock down the database so only you two can read/write it. In **Realtime Database → Rules**,
   replace the rules with something like:

   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```

   This is fine for a private link only you two know, but if you want real protection, enable
   Firebase Anonymous Auth and restrict rules to authenticated users — ask me if you want this
   wired in.

## 3. Get a YouTube API key (powers search)

1. Go to https://console.cloud.google.com, create a project (or reuse one).
2. Go to **APIs & Services → Library**, search for **YouTube Data API v3**, and enable it.
3. Go to **APIs & Services → Credentials → Create Credentials → API key**.
4. Click into the new key and under "Application restrictions" choose **Websites**, and add your
   Vercel domain (and `http://localhost:3000` for local testing) so the key can't be used elsewhere.
5. Paste the key into `.env.local` as `NEXT_PUBLIC_YT_API_KEY`.

The free quota (10,000 units/day, ~100 searches) is plenty for two people.

## 4. Set your names

In `.env.local`, set `NEXT_PUBLIC_PARTNER_A_NAME` and `NEXT_PUBLIC_PARTNER_B_NAME` to your two
names — these are what show up in the connection thread at the top and in chat.

## 5. Run it locally

```bash
npm run dev
```

Open http://localhost:3000, pick your name. Open it in another browser (or send the link to your
partner) and pick the other name — you should see the connection thread light up.

## 6. Deploy to Vercel

1. Push this project to a GitHub repo (keep it **private** — it's just for the two of you).
2. Go to https://vercel.com, **Add New → Project**, import the repo.
3. Under **Environment Variables**, add every variable from your `.env.local` (Vercel won't read
   `.env.local` itself — you have to paste them in).
4. Deploy. Share the resulting URL with your partner.

If you add your Vercel domain to the YouTube API key's website restrictions (step 3 above) before
deploying, search will work in production immediately.

## How the sync works

- Whoever presses play, pauses, seeks, or picks a new song writes that action (video, position,
  playing/paused, timestamp) to Firebase.
- The other person's browser picks up that change in real time, calculates how much time has
  passed, and jumps their player to the same spot.
- Every 10 seconds, whoever is currently "in control" quietly re-broadcasts their position so any
  network drift gets corrected automatically.
- Presence (online / listening) is handled by Firebase's `onDisconnect`, so if someone closes the
  tab or loses connection, their dot goes gray for the other person within seconds.

## Project structure

```
app/            Next.js App Router pages, layout, global styles
components/     IdentityGate, ConnectionThread, Player, SearchPanel, ChatPanel
lib/            firebase.ts (init), room.ts (state/queue/chat/presence), youtube.ts (API + search)
```
