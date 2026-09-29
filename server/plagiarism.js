export function calculateSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const allWords = [...new Set([...words1, ...words2])];

  const vector1 = allWords.map((word) => words1.filter((w) => w === word).length);
  const vector2 = allWords.map((word) => words2.filter((w) => w === word).length);

  const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

export async function searchWeb(query) {
  const urls = [];

  try {
    const searchQuery = encodeURIComponent(query.slice(0, 200));
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;

    const response = await fetch(ddgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const html = await response.text();

    const resultMatches = html.match(/uddg=([^"&]+)/g) || [];
    const ddgUrls = resultMatches
      .map((match) => {
        const encoded = match.replace("uddg=", "");
        try {
          return decodeURIComponent(encoded);
        } catch {
          return null;
        }
      })
      .filter(
        (url) => url && url.startsWith("http") && !url.includes("duckduckgo.com")
      )
      .slice(0, 8);

    const filteredUrls = ddgUrls.filter(url => 
      url !== null && 
      !url.includes("drksanthisree.com/about")
    );
    urls.push(...filteredUrls);
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
  }

  try {
    const searchQuery = encodeURIComponent(query.slice(0, 150));
    const crossrefUrl = `https://api.crossref.org/works?query=${searchQuery}&rows=5`;
    const response = await fetch(crossrefUrl);
    const data = await response.json();
    if (data.message?.items) {
      for (const item of data.message.items) {
        if (item.URL && !item.URL.includes("drksanthisree.com/about")) {
          urls.push(item.URL);
        }
      }
    }
  } catch (error) {
    console.error("CrossRef search error:", error);
  }

  try {
    const searchQuery = encodeURIComponent(query.slice(0, 150));
    const arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=3`;
    const response = await fetch(arxivUrl);
    const data = await response.text();
    // simplistic xml parsing for <id> tag which contains the URL
    const idMatches = data.match(/<id>(http:\/\/arxiv\.org\/abs\/[^<]+)<\/id>/g) || [];
    const arxivUrls = idMatches.map(id => id.replace('<id>', '').replace('</id>', ''));
    urls.push(...arxivUrls);
  } catch (error) {
    console.error("ArXiv search error:", error);
  }

  return [...new Set(urls)].slice(0, 15);
}

export async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return { text: null, error: `HTTP ${response.status}` };
    }

    const html = await response.text();

    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<nav[^>]*>.*?<\/nav>/gis, "")
      .replace(/<header[^>]*>.*?<\/header>/gis, "")
      .replace(/<footer[^>]*>.*?<\/footer>/gis, "")
      .replace(/<aside[^>]*>.*?<\/aside>/gis, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { text: text.slice(0, 5000), error: null };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return { text: null, error: error.message };
  }
}

export function nGramSimilarity(text1, text2, n = 5) {
  const createNGrams = (text) => {
    const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
    const ngrams = new Set();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(" "));
    }
    return ngrams;
  };

  const ngrams1 = createNGrams(text1);
  const ngrams2 = createNGrams(text2);

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

  let matches = 0;
  for (const gram of ngrams1) {
    if (ngrams2.has(gram)) matches++;
  }

  return matches / Math.max(ngrams1.size, ngrams2.size);
}
