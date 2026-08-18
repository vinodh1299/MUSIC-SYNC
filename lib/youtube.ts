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

// Parses artist, movie/album, or core title from YouTube video title
function parseTitleMetadata(rawTitle: string): { songName: string; artistOrAlbum: string } {
  const parts = rawTitle
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")
    .split(/\||-|:|\bfrom\b/i)
    .map((p) => p.replace(/(official|video|song|lyric|lyrics|audio|hd|4k|mv|full)/gi, "").trim())
    .filter(Boolean);

  const songName = parts[0] || rawTitle;
  const artistOrAlbum = parts.slice(1).join(" ") || songName;

  return { songName, artistOrAlbum };
}

// Smart Recommendation Engine: Finds NEW, DIFFERENT songs based on artist/album/genre preferences
export async function fetchRecommendations(
  currentTitle: string,
  excludeVideoIds: string[] = []
): Promise<YouTubeSearchResult[]> {
  const { songName, artistOrAlbum } = parseTitleMetadata(currentTitle);
  const excludeSet = new Set(excludeVideoIds);

  // Normalize song name to prevent repeating alternative uploads of the exact same song
  const primaryWord = songName.toLowerCase().split(" ")[0];

  const queries = [
    `${artistOrAlbum} top songs`,
    `${songName} similar music songs`,
    `${artistOrAlbum} hits`,
  ];

  for (const query of queries) {
    try {
      const results = await searchYouTube(query);
      const candidates = results.filter((item) => {
        if (excludeSet.has(item.videoId)) return false;
        // Exclude exact same song title variations
        const itemLower = item.title.toLowerCase();
        if (primaryWord && primaryWord.length > 3 && itemLower.includes(primaryWord)) {
          return false;
        }
        return true;
      });

      if (candidates.length > 0) {
        return candidates;
      }
    } catch (err) {
      console.warn(`Query "${query}" failed:`, err);
    }
  }

  // Fallback: search for top music hits
  try {
    const fallbackResults = await searchYouTube("popular music songs");
    return fallbackResults.filter((item) => !excludeSet.has(item.videoId));
  } catch {
    return [];
  }
}

// Resolves a direct playable HTML5 audio stream URL for a given YouTube video ID
export async function fetchAudioStream(videoId: string): Promise<string | null> {
  const endpoints = [
    `https://api.piped.video/streams/${videoId}`,
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
          const bestStream = data.audioStreams.find((s: any) => s.mimeType?.includes("audio/mp4")) || data.audioStreams[0];
          if (bestStream?.url) return bestStream.url;
        }
        if (Array.isArray(data.adaptiveFormats)) {
          const audioFormats = data.adaptiveFormats.filter((f: any) => f.type?.includes("audio"));
          if (audioFormats.length > 0) {
            return audioFormats[0].url;
          }
        }
      }
    } catch (err) {
      console.warn(`Audio stream endpoint ${endpoint} failed:`, err);
    }
  }
  return null;
}
