"use client";

import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtube";
import { PlaybackState, pushState } from "@/lib/room";

const DRIFT_TOLERANCE_SEC = 1.5;
const HEARTBEAT_MS = 10000;

export default function Player({
  selfName,
  state,
  onListeningChange,
}: {
  selfName: string;
  state: PlaybackState | null;
  onListeningChange: (listening: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const seekingRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);

  // Initialize the hidden/compact YouTube player once.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(containerRef.current, {
        height: "180",
        width: "320",
        playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: any) => {
            const playing = e.data === YT.PlayerState.PLAYING;
            setIsPlayingLocal(playing);
            onListeningChange(playing && document.visibilityState === "visible");
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track visibility to fold into "listening" status.
  useEffect(() => {
    const handler = () => onListeningChange(isPlayingLocal && document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isPlayingLocal, onListeningChange]);

  // Tick the displayed position while playing (UI only, not written to Firebase).
  useEffect(() => {
    const id = setInterval(() => {
      if (!seekingRef.current && playerRef.current?.getCurrentTime) {
        setDisplayPosition(playerRef.current.getCurrentTime());
        setDuration(playerRef.current.getDuration?.() || 0);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Periodic drift-correction heartbeat: only the last actor broadcasts position.
  useEffect(() => {
    const id = setInterval(() => {
      if (!state || state.updatedBy !== selfName || !state.isPlaying || !playerRef.current?.getCurrentTime) return;
      pushState({ positionSec: playerRef.current.getCurrentTime() }, selfName);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [state, selfName]);

  // Reconcile remote state changes into the local player.
  useEffect(() => {
    if (!ready || !state || !playerRef.current) return;
    if (state.updatedBy === selfName) return; // we already applied our own action locally

    const player = playerRef.current;
    const expected =
      state.positionSec +
      (state.isPlaying && typeof state.updatedAt === "number"
        ? Math.max(0, (Date.now() - state.updatedAt) / 1000)
        : 0);

    if (state.videoId && state.videoId !== loadedVideoIdRef.current) {
      loadedVideoIdRef.current = state.videoId;
      if (state.isPlaying) player.loadVideoById(state.videoId, expected);
      else player.cueVideoById(state.videoId, expected);
      return;
    }

    const current = player.getCurrentTime?.() ?? 0;
    if (Math.abs(current - expected) > DRIFT_TOLERANCE_SEC) {
      player.seekTo(expected, true);
    }

    if (state.isPlaying) player.playVideo?.();
    else player.pauseVideo?.();
  }, [state, ready, selfName]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    const nextPlaying = !isPlayingLocal;
    if (nextPlaying) playerRef.current.playVideo();
    else playerRef.current.pauseVideo();
    pushState(
      { isPlaying: nextPlaying, positionSec: playerRef.current.getCurrentTime?.() ?? 0 },
      selfName
    );
  };

  const seekTo = (seconds: number) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(seconds, true);
    setDisplayPosition(seconds);
    pushState({ positionSec: seconds }, selfName);
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="player">
      <div className="player-art">
        {state?.thumbnail ? (
          <img src={state.thumbnail} alt="" className="player-thumb" />
        ) : (
          <div className="player-thumb player-thumb-empty" />
        )}
      </div>

      <div className="player-body">
        <p className="player-title">{state?.title || "Nothing playing yet"}</p>
        <p className="player-sub">
          {state?.updatedBy ? `${state.updatedBy} started this` : "Search below to start listening"}
        </p>

        <div className="player-transport">
          <button
            className="player-play"
            onClick={togglePlay}
            disabled={!state?.videoId}
            aria-label={isPlayingLocal ? "Pause" : "Play"}
          >
            {isPlayingLocal ? "❚❚" : "▶"}
          </button>
          <span className="player-time">{fmt(displayPosition)}</span>
          <input
            className="player-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={1}
            value={Math.min(displayPosition, duration || 0)}
            onMouseDown={() => (seekingRef.current = true)}
            onTouchStart={() => (seekingRef.current = true)}
            onChange={(e) => setDisplayPosition(Number(e.target.value))}
            onMouseUp={(e) => {
              seekingRef.current = false;
              seekTo(Number((e.target as HTMLInputElement).value));
            }}
            onTouchEnd={(e) => {
              seekingRef.current = false;
              seekTo(Number((e.target as HTMLInputElement).value));
            }}
          />
          <span className="player-time">{fmt(duration)}</span>
        </div>
      </div>

      {/* The actual YouTube iframe — kept small; audio is what matters. */}
      <div className="player-frame" ref={containerRef} />
    </div>
  );
}
