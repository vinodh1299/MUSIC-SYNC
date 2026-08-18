"use client";

let apiPromise: Promise<void> | null = null;

// Loads the YouTube IFrame Player API script exactly once.
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).YT && (window as any).YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const prevCallback = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === "function") prevCallback();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });

  return apiPromise;
}

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
};

// Searches YouTube for music videos using the YouTube Data API v3.
// Requires NEXT_PUBLIC_YT_API_KEY (see README for how to get one).
export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const key = process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_YT_API_KEY. Add a YouTube Data API v3 key to your environment variables."
    );
  }
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    maxResults: "10",
    q: query,
    key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube search failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return (data.items || [])
    .filter((item: any) => item.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));
}
