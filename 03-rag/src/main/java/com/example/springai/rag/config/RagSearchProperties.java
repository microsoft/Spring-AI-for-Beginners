package com.example.springai.rag.config;

import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Shared retrieval settings for both native and advisor-based RAG paths.
 */
@Component
public class RagSearchProperties {

    public static final int DEFAULT_MAX_RESULTS = 5;
    public static final double DEFAULT_SIMILARITY_THRESHOLD = 0.35;

    private final int maxResults;
    private final double similarityThreshold;

    public RagSearchProperties(
            @Value("${app.rag.search.max-results:" + DEFAULT_MAX_RESULTS + "}") int maxResults,
            @Value("${app.rag.search.similarity-threshold:" + DEFAULT_SIMILARITY_THRESHOLD + "}") double similarityThreshold) {
        if (maxResults < 1) {
            throw new IllegalArgumentException("RAG max results must be at least 1");
        }
        if (similarityThreshold < 0.0 || similarityThreshold > 1.0) {
            throw new IllegalArgumentException("RAG similarity threshold must be between 0.0 and 1.0");
        }
        this.maxResults = maxResults;
        this.similarityThreshold = similarityThreshold;
    }

    public int maxResults() {
        return maxResults;
    }

    public double similarityThreshold() {
        return similarityThreshold;
    }

    public SearchRequest buildSearchRequest() {
        return SearchRequest.builder()
                .topK(maxResults)
                .similarityThreshold(similarityThreshold)
                .build();
    }

    public SearchRequest buildSearchRequest(String query) {
        return SearchRequest.builder()
                .query(query)
                .topK(maxResults)
                .similarityThreshold(similarityThreshold)
                .build();
    }
}