package com.example.springai.prompts.config;

import com.openai.client.OpenAIClientAsync;
import com.openai.client.okhttp.OpenAIOkHttpClientAsync;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for Spring AI with Microsoft Foundry using the OpenAI SDK starter.
 *
 * The starter (spring-ai-starter-model-openai) auto-configures {@code OpenAiChatModel}
 * and {@code ChatClient.Builder} from properties in application.yaml. Azure mode is
 * detected automatically when the base URL contains openai.azure.com.
 *
 * Note: reasoning effort is set as a real API parameter on the Responses API.
 * See Gpt5PromptService#streamResponse, which passes a {@link com.openai.models.ReasoningEffort}.
 *
 * 💡 Ask GitHub Copilot:
 * - "Why does this stream via the Responses API instead of Chat Completions?"
 * - "When does it make sense to expose multiple chat model beans with different configurations?"
 * - "How would I inject Azure AD (managed identity) credentials here instead of an API key?"
 * - "How do I test this configuration without making real Microsoft Foundry calls?"
 */
@Configuration
public class SpringAiConfig {

    @Value("${AZURE_OPENAI_ENDPOINT}")
    private String azureEndpoint;

    @Value("${AZURE_OPENAI_API_KEY}")
    private String azureApiKey;

    /**
     * High-level fluent chat API. Built from the auto-configured {@link ChatClient.Builder}
     * so the prompt-engineering service can write {@code chatClient.prompt(...).call().content()}
     * instead of the lower-level {@code chatModel.call(new Prompt(...))} pattern.
     */
    @Bean
    public ChatClient chatClient(ChatClient.Builder chatClientBuilder) {
        return chatClientBuilder.build();
    }

    /**
     * Exposes the raw OpenAI async client for direct streaming.
     * The Spring AI SDK's stream() method uses collectList() which buffers
     * the entire response, destroying real-time token delivery. This bean
     * lets the streaming service bypass that and stream tokens as they arrive.
     * Spring AI 2.0.1's ChatClient has no Responses API surface, so the
     * streaming path needs this client directly.
     *
     * Points at Azure's OpenAI-compatible {@code /openai/v1} surface rather than the
     * deployment-scoped one, because the Responses API lives at /openai/v1/responses.
     * Azure accepts the API key as a bearer token there.
     */
    @Bean
    public OpenAIClientAsync openAIClientAsync() {
        return OpenAIOkHttpClientAsync.builder()
                .baseUrl(azureEndpoint.replaceAll("/+$", "") + "/openai/v1")
                .apiKey(azureApiKey)
                .timeout(java.time.Duration.ofSeconds(180))
                // One retry, not three: retrying a 180s call four times hangs the demo for minutes.
                .maxRetries(1)
                .build();
    }
}
