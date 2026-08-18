"use client";

import { useState } from "react";
import { searchYouTube, YouTubeSearchResult } from "@/lib/youtube";
import { addToQueue, pushState, QueueItem } from "@/lib/room";

export default function SearchPanel({
  selfName,
  queue,
  currentVideoId,
}: {
  selfName: string;
  queue: QueueItem[];
  currentVideoId: string | null | undefined;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const items = await searchYouTube(query.trim());
      setResults(items);
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const playNow = (item: { videoId: string; title: string; thumbnail: string }) => {
    pushState(
      {
        videoId: item.videoId,
        title: item.title,
        thumbnail: item.thumbnail,
        isPlaying: true,
        positionSec: 0,
      },
      selfName
    );
  };

  const addQueue = (item: { videoId: string; title: string; thumbnail: string }) => {
    addToQueue({ ...item, addedBy: selfName });
  };

  return (
    <div className="panel">
      <form className="search-row" onSubmit={runSearch}>
        <input
          className="search-input"
          placeholder="Find a song for both of you"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="search-btn" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="panel-error">{error}</p>}

      {results.length > 0 && (
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.videoId} className="result-row">
              <img src={r.thumbnail} alt="" className="result-thumb" />
              <div className="result-meta">
                <p className="result-title">{r.title}</p>
                <p className="result-channel">{r.channel}</p>
              </div>
              <div className="result-actions">
                <button className="chip-btn" onClick={() => playNow(r)}>
                  Play now
                </button>
                <button className="chip-btn chip-btn-ghost" onClick={() => addQueue(r)}>
                  + Queue
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {queue.length > 0 && (
        <div className="queue">
          <p className="queue-heading">Up next</p>
          <ul className="result-list">
            {queue.map((item) => (
              <li
                key={item.id}
                className={`result-row ${item.videoId === currentVideoId ? "result-row-active" : ""}`}
              >
                <img src={item.thumbnail} alt="" className="result-thumb" />
                <div className="result-meta">
                  <p className="result-title">{item.title}</p>
                  <p className="result-channel">added by {item.addedBy}</p>
                </div>
                <div className="result-actions">
                  <button className="chip-btn" onClick={() => playNow(item)}>
                    Play now
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
