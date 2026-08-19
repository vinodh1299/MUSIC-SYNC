"use client";

import { useEffect, useState } from "react";
import { searchYouTube, YouTubeSearchResult } from "@/lib/youtube";
import { addToQueue, insertPlayNextInQueue, removeFromQueue, clearQueue, pushState, QueueItem } from "@/lib/room";

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
  const [notice, setNotice] = useState<string | null>(null);

  // Clear suggestions immediately when search bar is cleared
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
    }
  }, [query]);

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

  const clearSearchInput = () => {
    setQuery("");
    setResults([]);
    setError(null);
  };

  const playNow = async (item: { videoId: string; title: string; thumbnail: string }) => {
    // If not already in queue, ensure it's in the room queue so next song continues smoothly
    await addToQueue({ ...item, addedBy: selfName }, queue);
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
    addToQueue({ ...item, addedBy: selfName }, queue);
    setNotice(`Added "${item.title.substring(0, 30)}..." to queue`);
    setTimeout(() => setNotice(null), 3000);
  };

  const playNext = async (item: { videoId: string; title: string; thumbnail: string }) => {
    await insertPlayNextInQueue({ ...item, addedBy: selfName }, queue);
    setNotice(`Set "${item.title.substring(0, 30)}..." to play next! ⚡`);
    setTimeout(() => setNotice(null), 3000);
  };

  const removeItem = (id: string) => {
    removeFromQueue(id);
  };

  const handleClearQueue = () => {
    if (confirm("Clear all queued songs?")) {
      clearQueue();
    }
  };

  return (
    <div className="panel">
      <form className="search-row" onSubmit={runSearch}>
        <div className="search-input-wrapper">
          <input
            className="search-input"
            placeholder="Find a song to listen or queue together..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="search-clear-btn" onClick={clearSearchInput} title="Clear search">
              ✕
            </button>
          )}
        </div>
        <button className="search-btn" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="panel-error">{error}</p>}
      {notice && <div className="queue-notice-banner">{notice}</div>}

      {/* Search Suggestions & Results List */}
      {results.length > 0 && query.trim() && (
        <div className="search-results-section">
          <div className="results-header-row">
            <span className="results-heading">Search Results ({results.length})</span>
            <button className="chip-btn chip-btn-ghost" onClick={clearSearchInput}>
              Dismiss
            </button>
          </div>
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
                  <button className="chip-btn chip-btn-ghost" onClick={() => playNext(r)} title="Set to play next in queue">
                    ⚡ Play Next
                  </button>
                  <button className="chip-btn chip-btn-ghost" onClick={() => addQueue(r)}>
                    + Queue
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Room Queue Section */}
      {queue.length > 0 && (
        <div className="queue">
          <div className="queue-header-row">
            <p className="queue-heading">Up next in Queue ({queue.length})</p>
            <button className="chip-btn chip-btn-danger" onClick={handleClearQueue}>
              🧹 Clear Queue
            </button>
          </div>
          <ul className="result-list">
            {queue.map((item, index) => (
              <li
                key={item.id}
                className={`result-row ${item.videoId === currentVideoId ? "result-row-active" : ""}`}
              >
                <img src={item.thumbnail} alt="" className="result-thumb" />
                <div className="result-meta">
                  <p className="result-title">
                    {index === 0 ? "⚡ NEXT: " : ""}{item.title}
                  </p>
                  <p className="result-channel">queued by {item.addedBy}</p>
                </div>
                <div className="result-actions">
                  <button className="chip-btn" onClick={() => playNow(item)}>
                    Play now
                  </button>
                  {index > 0 && (
                    <button
                      className="chip-btn chip-btn-ghost"
                      onClick={() => playNext(item)}
                      title="Move song to top of queue"
                    >
                      ⚡ Move Next
                    </button>
                  )}
                  <button
                    className="chip-btn chip-btn-ghost chip-btn-remove"
                    onClick={() => removeItem(item.id)}
                    title="Remove from queue"
                  >
                    🗑️ Remove
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
