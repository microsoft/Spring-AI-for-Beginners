package com.example.springai.rag.config;

import org.junit.jupiter.api.Test;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RagSearchPropertiesTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withBean(RagSearchProperties.class);

    @Test
    void defaultSearchSettingsFilterWeakMatches() {
        contextRunner.run(context -> {
            RagSearchProperties properties = context.getBean(RagSearchProperties.class);
            SearchRequest request = properties.buildSearchRequest("What is Spring AI?");

            assertThat(properties.maxResults()).isEqualTo(5);
            assertThat(properties.similarityThreshold()).isEqualTo(0.35);
            assertThat(request.getTopK()).isEqualTo(5);
            assertThat(request.getSimilarityThreshold()).isEqualTo(0.35);
            assertThat(request.getQuery()).isEqualTo("What is Spring AI?");
        });
    }

    @Test
    void searchSettingsCanBeTunedWithProperties() {
        contextRunner
                .withPropertyValues(
                        "app.rag.search.max-results=3",
                        "app.rag.search.similarity-threshold=0.7")
                .run(context -> {
                    RagSearchProperties properties = context.getBean(RagSearchProperties.class);
                    SearchRequest request = properties.buildSearchRequest();

                    assertThat(properties.maxResults()).isEqualTo(3);
                    assertThat(properties.similarityThreshold()).isEqualTo(0.7);
                    assertThat(request.getTopK()).isEqualTo(3);
                    assertThat(request.getSimilarityThreshold()).isEqualTo(0.7);
                });
    }

    @Test
    void rejectsInvalidSearchSettings() {
        assertThatThrownBy(() -> new RagSearchProperties(0, 0.5))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max results");

        assertThatThrownBy(() -> new RagSearchProperties(5, 1.1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("similarity threshold");
    }
}