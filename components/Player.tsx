"use client";

import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi, fetchRecommendations } from "@/lib/youtube";
import { PlaybackState, pushState, QueueItem, removeFromQueue } from "@/lib/room";

const DRIFT_TOLERANCE_SEC = 1.5;
const HEARTBEAT_MS = 10000;

export default function Player({
  selfName,
  state,
  queue,
  onListeningChange,
}: {
  selfName: string;
  state: PlaybackState | null;
  queue: QueueItem[];
  onListeningChange: (listening: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [mode, setMode] = useState<"video" | "compact">("video");
  const [autoplay, setAutoplay] = useState(true);
  const [autoplayNotice, setAutoplayNotice] = useState<string | null>(null);

  const seekingRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const isHandlingEndRef = useRef(false);
  const playedHistoryRef = useRef<string[]>([]);

  // Track history of played video IDs
  useEffect(() => {
    if (state?.videoId && !playedHistoryRef.current.includes(state.videoId)) {
      playedHistoryRef.current.push(state.videoId);
    }
  }, [state?.videoId]);

  // Initialize YouTube Player
  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as any).YT;
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      playerRef.current = new YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          controls: 1,
          disablekb: 0,
          enablejsapi: 1,
          origin: origin,
          widget_referrer: origin,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: any) => {
            const playing = e.data === YT.PlayerState.PLAYING;
            setIsPlayingLocal(playing);
            onListeningChange(playing && document.visibilityState === "visible");

            // Handle Song Ended -> Autoplay Next Preference or Queue
            if (e.data === YT.PlayerState.ENDED) {
              handleSongEnded();
            }
          },
          onError: (e: any) => {
            console.warn("YouTube Player error code:", e.data);
            if (e.data === 101 || e.data === 150 || e.data === 100 || e.data === 2 || e.data === 5) {
              setAutoplayNotice("Embed restricted by uploader. Auto-skipping to alternative track...");
              setTimeout(() => {
                handleSongEnded();
              }, 1200);
            }
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

  // Handle Autoplay / Next Song when current video finishes or errors out
  const handleSongEnded = async () => {
    if (isHandlingEndRef.current) return;
    isHandlingEndRef.current = true;

    try {
      // 1. Check if there are queued items first
      if (queue && queue.length > 0) {
        const nextItem = queue[0];
        setAutoplayNotice(`Playing queued song: ${nextItem.title}`);
        await removeFromQueue(nextItem.id);
        await pushState(
          {
            videoId: nextItem.videoId,
            title: nextItem.title,
            thumbnail: nextItem.thumbnail,
            isPlaying: true,
            positionSec: 0,
          },
          selfName
        );
        setTimeout(() => setAutoplayNotice(null), 4000);
        return;
      }

      // 2. If no queued items and Autoplay is enabled: find next preference recommendation
      if (autoplay && state?.title) {
        setAutoplayNotice("Finding next song based on your preferences...");
        const recommendations = await fetchRecommendations(
          state.title,
          playedHistoryRef.current
        );
        if (recommendations.length > 0) {
          const nextSong = recommendations[0];
          setAutoplayNotice(`Autoplay next: ${nextSong.title}`);
          await pushState(
            {
              videoId: nextSong.videoId,
              title: nextSong.title,
              thumbnail: nextSong.thumbnail,
              isPlaying: true,
              positionSec: 0,
            },
            selfName
          );
          setTimeout(() => setAutoplayNotice(null), 4000);
        } else {
          setAutoplayNotice("No matching recommendations found.");
          setTimeout(() => setAutoplayNotice(null), 3000);
        }
      }
    } catch (err) {
      console.error("Autoplay transition failed:", err);
    } finally {
      setTimeout(() => {
        isHandlingEndRef.current = false;
      }, 2000);
    }
  };

  // Track visibility to fold into "listening" status.
  useEffect(() => {
    const handler = () => onListeningChange(isPlayingLocal && document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isPlayingLocal, onListeningChange]);

  // Tick displayed position & trigger fallback end detection if video reaches end
  useEffect(() => {
    const id = setInterval(() => {
      if (!seekingRef.current && playerRef.current?.getCurrentTime) {
        const curr = playerRef.current.getCurrentTime() || 0;
        const dur = playerRef.current.getDuration?.() || 0;
        setDisplayPosition(curr);
        setDuration(dur);

        // Fallback end-of-track trigger in case YouTube ENDED event is suppressed
        if (dur > 0 && curr >= dur - 0.8 && isPlayingLocal && !isHandlingEndRef.current) {
          handleSongEnded();
        }
      }
    }, 500);
    return () => clearInterval(id);
  }, [isPlayingLocal]);

  // Periodic drift-correction heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      if (!state || state.updatedBy !== selfName || !state.isPlaying || !playerRef.current?.getCurrentTime) return;
      pushState({ positionSec: playerRef.current.getCurrentTime() }, selfName);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [state, selfName]);

  // Reconcile video changes and remote state into local YouTube player instance
  useEffect(() => {
    if (!ready || !state || !playerRef.current) return;

    const player = playerRef.current;
    const expected =
      state.positionSec +
      (state.isPlaying && typeof state.updatedAt === "number"
        ? Math.max(0, (Date.now() - state.updatedAt) / 1000)
        : 0);

    // Whenever video ID changes (for self or partner), load it into YouTube player!
    if (state.videoId && state.videoId !== loadedVideoIdRef.current) {
      loadedVideoIdRef.current = state.videoId;
      if (state.isPlaying) {
        player.loadVideoById(state.videoId, expected);
      } else {
        player.cueVideoById(state.videoId, expected);
      }
      return;
    }

    // Skip position adjustments triggered by self
    if (state.updatedBy === selfName) return;

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
    <div className={`player-wrapper ${mode === "video" ? "mode-video" : "mode-compact"}`}>
      {/* Top Bar Controls for Player UI */}
      <div className="player-toolbar">
        <div className="player-mode-toggle">
          <button
            className={`mode-btn ${mode === "video" ? "active" : ""}`}
            onClick={() => setMode("video")}
          >
            📺 YouTube Video UI
          </button>
          <button
            className={`mode-btn ${mode === "compact" ? "active" : ""}`}
            onClick={() => setMode("compact")}
          >
            🎵 Audio Player UI
          </button>
        </div>

        <button
          className={`autoplay-toggle ${autoplay ? "enabled" : "disabled"}`}
          onClick={() => setAutoplay(!autoplay)}
          title="Autoplay next recommended song based on previous song preferences"
        >
          Autoplay Preferences: {autoplay ? "ON 🔁" : "OFF ⏸"}
        </button>
      </div>

      {autoplayNotice && <div className="autoplay-banner">{autoplayNotice}</div>}

      {/* Main YouTube Video Interface Screen */}
      <div className="youtube-video-container">
        <div className="youtube-player-frame" ref={containerRef} />
        {!state?.videoId && (
          <div className="player-placeholder">
            <div className="placeholder-icon">📺</div>
            <p className="placeholder-title">No Video Playing Yet</p>
            <p className="placeholder-sub">Search for a song or music video below to start watching & listening together.</p>
          </div>
        )}
      </div>

      {/* Synchronized Control Bar */}
      <div className="player-body">
        <div className="player-meta-row">
          <div className="player-art-mini">
            {state?.thumbnail ? (
              <img src={state.thumbnail} alt="" className="player-thumb" />
            ) : (
              <div className="player-thumb player-thumb-empty" />
            )}
          </div>
          <div className="player-meta-text">
            <p className="player-title">{state?.title || "Nothing playing yet"}</p>
            <p className="player-sub">
              {state?.updatedBy ? `Synced by ${state.updatedBy}` : "Search below to start"}
            </p>
          </div>
        </div>

        <div className="player-transport">
          <button
            className="player-play"
            onClick={togglePlay}
            disabled={!state?.videoId}
            aria-label={isPlayingLocal ? "Pause" : "Play"}
          >
            {isPlayingLocal ? "❚❚" : "▶"}
          </button>
          <button
            className="player-next"
            onClick={() => handleSongEnded()}
            disabled={!state?.title}
            aria-label="Next song"
            title="Play next song from queue or recommendations"
          >
            ⏭
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
    </div>
  );
}
