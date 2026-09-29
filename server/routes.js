import { createServer } from "http";
import { checkTextSchema } from "../shared/schema.js";
import {
  calculateSimilarity,
  searchWeb,
  fetchPageContent,
  nGramSimilarity,
} from "./plagiarism.js";

export function registerRoutes(app) {
  app.post("/api/plagiarism-check", async (req, res) => {
    try {
      const { text } = checkTextSchema.parse(req.body);

      console.log("Starting plagiarism check for text length:", text.length);

      const sentences = text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);

      console.log("Split into", sentences.length, "sentences");

      const results = [];
      const limit = sentences.length;

      for (let i = 0; i < limit; i++) {
        const sentence = sentences[i];
        console.log("Checking chunk:", sentence.substring(0, 50) + "...");

        const urls = await searchWeb(sentence);
        console.log(`Found ${urls.length} URLs to check`);

        let maxSimilarity = 0;
        const matchedSources = [];

        for (const url of urls) {
          const contentResult = await fetchPageContent(url);
          if (contentResult.error) {
            matchedSources.push({
              url,
              similarity: 0,
              status: "unavailable"
            });
            continue;
          }
          const content = contentResult.text;
          if (content && content.length > 100) {
            const cosineSim = calculateSimilarity(sentence, content);
            const ngramSim = nGramSimilarity(sentence, content, 5);

            const similarity = Math.max(cosineSim, ngramSim);

            console.log(
              `URL ${url}: cosine=${cosineSim.toFixed(2)}, ngram=${ngramSim.toFixed(
                2
              )}, max=${similarity.toFixed(2)}`
            );

            if (similarity > maxSimilarity) {
              maxSimilarity = similarity;
            }

            if (similarity > 0.15) {
              matchedSources.push({
                url,
                similarity: Math.round(similarity * 100),
                status: similarity > 0.5 ? "verified" : "possible"
              });
            }
          }
        }

        matchedSources.sort((a, b) => b.similarity - a.similarity);

        results.push({
          sentence,
          similarity: Math.round(maxSimilarity * 100),
          sources: matchedSources,
          isPlagiarized: maxSimilarity > 0.5,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const totalSimilarity = results.reduce((sum, r) => sum + r.similarity, 0);
      const overallScore = Math.round(totalSimilarity / results.length) || 0;
      const plagiarizedCount = results.filter((r) => r.isPlagiarized).length;
      
      const totalTextLength = results.reduce((sum, r) => sum + r.sentence.length, 0) || 1;
      const plagiarizedTextLength = results.filter(r => r.isPlagiarized).reduce((sum, r) => sum + r.sentence.length, 0);
      const plagiarismPercentage = Math.round((plagiarizedTextLength / totalTextLength) * 100);

      console.log("Plagiarism check complete. Overall score:", overallScore);

      const checkResult = {
        overallScore,
        plagiarismPercentage,
        totalSentences: results.length,
        plagiarizedSentences: plagiarizedCount,
        results,
      };

      res.json(checkResult);
    } catch (error) {
      console.error("Error in plagiarism check:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
