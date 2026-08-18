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
// Filters results with videoEmbeddable=true to ensure videos are playable in embeds.
export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const key = process.env.NEXT_PUBLIC_YT_API_KEY;

  if (!key || !key.startsWith("AIza")) {
    throw new Error(
      "Invalid YouTube API Key format. YouTube Data API v3 keys must start with 'AIza...'. Please copy a Google Cloud API key starting with AIza into NEXT_PUBLIC_YT_API_KEY in .env.local."
    );
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true", // Only return videos that allow embedding!
    maxResults: "10",
    q: query,
    key,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!res.ok) {
    const bodyText = await res.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {}

    if (res.status === 401 || res.status === 403) {
      const msg = parsed?.error?.message || "";
      if (msg.includes("API keys are not supported") || msg.includes("UNAUTHENTICATED")) {
        throw new Error(
          "Your YouTube API Key is an OAuth token rather than a Google Cloud API Key. Please click '+ Create API Key' in Google Cloud Credentials to get a key starting with 'AIza...'."
        );
      }
      if (msg.includes("blocked") || msg.includes("API_KEY_SERVICE_BLOCKED")) {
        throw new Error(
          "YouTube Data API v3 is not enabled or restricted. Please visit https://console.cloud.google.com/apis/credentials?project=music-sync-822b1 and create an unrestricted API key."
        );
      }
    }
    throw new Error(`YouTube search error (${res.status}): ${parsed?.error?.message || bodyText}`);
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

// Cleans up track title to extract key search terms for recommendations
function extractSearchTerms(title: string): string {
  return title
    .replace(/[\(\[\{].*?[\)\]\}]/g, "") // Remove bracketed text like (Official Video), [HD]
    .replace(/(official|video|lyric|lyrics|audio|hd|4k|mv|full song)/gi, "")
    .trim();
}

// Fetches recommendation preferences based on previous song title
export async function fetchRecommendations(
  currentTitle: string,
  excludeVideoId?: string
): Promise<YouTubeSearchResult[]> {
  const terms = extractSearchTerms(currentTitle);
  if (!terms) return [];

  const query = `${terms} song`;
  try {
    const results = await searchYouTube(query);
    return results.filter((item) => item.videoId !== excludeVideoId);
  } catch (err) {
    console.warn("Could not fetch recommendations:", err);
    return [];
  }
}
