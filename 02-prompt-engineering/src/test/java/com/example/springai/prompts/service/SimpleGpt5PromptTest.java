package com.example.springai.prompts.service;

import com.openai.models.ReasoningEffort;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import reactor.core.publisher.Flux;

/**
 * Simple tests for Gpt5PromptService demonstrating GPT-5 prompting patterns.
 * These tests validate that prompts are structured correctly according to best practices.
 *
 * Testing Philosophy for Beginners:
 * - Uses Mockito to mock the underlying OpenAiChatModel
 * - The service consumes a {@link ChatClient}; here we hand it a real ChatClient
 *   built around the mocked ChatModel, so every fluent call still routes through
 *   the mock and an {@link ArgumentCaptor} can capture the {@link Prompt}
 * - Tests verify prompt structure contains expected GPT-5 patterns
 * - Doesn't require a real LLM — keeps tests fast and deterministic
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("GPT-5 Prompt Engineering Tests")
class SimpleGpt5PromptTest {

    private Gpt5PromptService promptService;

    @Mock
    private OpenAiChatModel mockChatModel;

    private ArgumentCaptor<Prompt> promptCaptor;

    private static ChatResponse mockChatResponse(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }

    @BeforeEach
    void setUp() {
        promptCaptor = ArgumentCaptor.forClass(Prompt.class);

        // Default mock behavior
        when(mockChatModel.call(any(Prompt.class)))
            .thenReturn(mockChatResponse("Mocked response"));

        // ChatClient internally calls chatModel.getOptions().mutate() to
        // merge per-request options, so the mock must return a non-null instance.
        when(mockChatModel.getOptions())
            .thenReturn(OpenAiChatOptions.builder().build());

        promptService = new Gpt5PromptService();
        // Inject a real ChatClient backed by the mocked ChatModel so the fluent
        // chatClient.prompt(...).call().content() chain ultimately routes through
        // mockChatModel.call(Prompt), letting the existing verify(...) assertions
        // continue to capture the underlying Prompt.
        ChatClient realChatClient = ChatClient.builder(mockChatModel).build();
        setField(promptService, "chatClient", realChatClient);
    }

    @Test
    @DisplayName("Should generate low eagerness prompt with search depth constraint")
    void shouldGenerateLowEagernessPrompt() {
        // Given
        String problem = "What is 2 + 2?";

        // When
        promptService.solveFocused(problem);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        String actualPrompt = getPromptText(promptCaptor.getValue());
        
        assertThat(actualPrompt)
            .contains("<context_gathering>")
            .contains("Search depth: very low")
            .contains("2 reasoning steps")
            .contains(problem);
    }

    @Test
    @DisplayName("Should generate high eagerness prompt for autonomous solving")
    void shouldGenerateHighEagernessPrompt() {
        // Given
        String problem = "Design a scalable microservices architecture";
        TestableStreamingPromptService streamingService = new TestableStreamingPromptService(
            Flux.just("analysis")
        );

        // When
        String result = streamingService.solveAutonomous(problem);

        // Then
        assertThat(result).isEqualTo("analysis");
        assertThat(streamingService.efforts()).containsExactly(ReasoningEffort.MEDIUM);
        assertThat(streamingService.prompts()).hasSize(1);
        assertThat(streamingService.prompts().get(0))
            .contains("thoroughly")
            .contains("comprehensive solution")
            .contains("multiple approaches")
            .contains(problem);
    }

    @Test
    @DisplayName("Should generate prompt with task execution preambles")
    void shouldGeneratePromptWithPreambles() {
        // Given
        String task = "Create a REST API for user management";

        // When
        promptService.executeWithPreamble(task);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        String actualPrompt = getPromptText(promptCaptor.getValue());
        
        assertThat(actualPrompt)
            .contains("<task_execution>")
            .contains("<tool_preambles>")
            .contains("restate the user's goal")
            .contains("step-by-step plan")
            .contains(task);
    }

    @Test
    @DisplayName("Should generate code prompt with self-reflection rubric")
    void shouldGenerateCodeWithReflectionPrompt() {
        // Given
        String requirement = "Create a Spring Boot REST controller for products";

        // When
        promptService.generateCodeWithReflection(requirement);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        String actualPrompt = getPromptText(promptCaptor.getValue());
        
        assertThat(actualPrompt)
            .contains("Generate Java code")
            .contains("simple")
            .contains("error handling")
            .contains(requirement);
    }

    @Test
    @DisplayName("Should generate structured analysis prompt")
    void shouldGenerateStructuredAnalysisPrompt() {
        // Given
        String code = "public void process() { System.out.println(\"test\"); }";

        // When
        promptService.analyzeCode(code);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        String actualPrompt = getPromptText(promptCaptor.getValue());
        
        assertThat(actualPrompt)
            .contains("<analysis_framework>")
            .contains("<output_format>")
            .contains("Correctness")
            .contains("Best Practices")
            .contains("Performance")
            .contains("Security")
            .contains("Maintainability")
            .contains(code);
    }

    @Test
    @DisplayName("Should maintain conversation context across multiple turns")
    void shouldMaintainConversationContext() {
        // Given
        String sessionId = "test-session";
        when(mockChatModel.call(any(Prompt.class)))
            .thenReturn(mockChatResponse("First response"))
            .thenReturn(mockChatResponse("Second response"));

        // When
        promptService.continueConversation("Hello", sessionId);
        promptService.continueConversation("Tell me more", sessionId);

        // Then
        verify(mockChatModel, times(2)).call(promptCaptor.capture());
        
        Prompt secondCallPrompt = promptCaptor.getAllValues().get(1);
        List<Message> secondCallMessages = secondCallPrompt.getInstructions();
        
        // Should have: System message, first user message, first AI response, second user message
        assertThat(secondCallMessages).hasSizeGreaterThanOrEqualTo(4);
    }

    @Test
    @DisplayName("Should preserve streamed assistant response for later conversation turns")
    void shouldPreserveStreamingConversationContext() {
        // Given
        TestableStreamingPromptService streamingService = new TestableStreamingPromptService(
            Flux.just("Nice to meet you, ", "Alex."),
            Flux.just("You told me your name is Alex.")
        );
        String sessionId = "streaming-session";

        // When
        List<String> firstResponse = streamingService
            .continueConversationStreaming("My name is Alex.", sessionId)
            .collectList()
            .block(Duration.ofSeconds(1));
        List<String> secondResponse = streamingService
            .continueConversationStreaming("What is my name?", sessionId)
            .collectList()
            .block(Duration.ofSeconds(1));

        // Then
        assertThat(firstResponse).containsExactly("Nice to meet you, ", "Alex.");
        assertThat(secondResponse).containsExactly("You told me your name is Alex.");
        assertThat(streamingService.prompts()).hasSize(2);
        assertThat(streamingService.prompts().get(1))
            .contains("[User] My name is Alex.")
            .contains("[Assistant] Nice to meet you, Alex.")
            .contains("[User] What is my name?");
    }

    @Test
    @DisplayName("Should not preserve partial streamed response when stream fails")
    void shouldNotPreservePartialStreamingResponseOnError() {
        // Given
        TestableStreamingPromptService streamingService = new TestableStreamingPromptService(
            Flux.concat(Flux.just("partial response"), Flux.error(new RuntimeException("stream failed"))),
            Flux.just("Fresh response")
        );
        String sessionId = "failed-stream-session";

        // When / Then
        assertThatThrownBy(() -> streamingService
            .continueConversationStreaming("First message", sessionId)
            .collectList()
            .block(Duration.ofSeconds(1)))
            .hasMessageContaining("stream failed");

        streamingService
            .continueConversationStreaming("Second message", sessionId)
            .collectList()
            .block(Duration.ofSeconds(1));

        assertThat(streamingService.prompts()).hasSize(2);
        assertThat(streamingService.prompts().get(1))
            .contains("[User] First message")
            .doesNotContain("[Assistant] partial response")
            .contains("[User] Second message");
    }

    @Test
    @DisplayName("Should include conversation guidelines in first message")
    void shouldIncludeConversationGuidelinesInFirstMessage() {
        // Given
        String sessionId = "new-session";

        // When
        promptService.continueConversation("First message", sessionId);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        List<Message> messages = promptCaptor.getValue().getInstructions();
        
        // Should have system message and user message
        assertThat(messages).hasSizeGreaterThanOrEqualTo(2);
        
        // First message should be system message with guidelines
        Message firstMessage = messages.get(0);
        assertThat(firstMessage).isInstanceOf(SystemMessage.class);
        assertThat(firstMessage.getText())
            .contains("<conversation_guidelines>")
            .contains("<response_style>")
            .contains("<tool_preambles>")
            .contains("Remember previous context");
    }

    @Test
    @DisplayName("Should generate constrained output prompt with strict limits")
    void shouldGenerateConstrainedPrompt() {
        // Given
        String topic = "Java Streams";
        String format = "bullet points";
        int maxWords = 50;

        // When
        promptService.generateConstrained(topic, format, maxWords);

        // Then
        verify(mockChatModel).call(promptCaptor.capture());
        String actualPrompt = getPromptText(promptCaptor.getValue());
        
        assertThat(actualPrompt)
            .contains("<strict_constraints>")
            .contains(topic)
            .contains(format)
            .contains(String.valueOf(maxWords))
            .contains("MUST adhere")
            .contains("Do NOT exceed");
    }

    @Test
    @DisplayName("Should generate step-by-step reasoning prompt")
    void shouldGenerateReasoningPrompt() {
        // Given
        String problem = "Calculate the compound interest";
        TestableStreamingPromptService streamingService = new TestableStreamingPromptService(
            Flux.just("reasoning")
        );

        // When
        String result = streamingService.solveWithReasoning(problem);

        // Then
        assertThat(result).isEqualTo("reasoning");
        assertThat(streamingService.efforts()).containsExactly(ReasoningEffort.LOW);
        String actualPrompt = streamingService.prompts().get(0);

        assertThat(actualPrompt)
            .contains("step by step")
            .contains("understand the problem")
            .contains("approach to solving")
            .contains("Verification")
            .contains(problem);
    }

    @Test
    @DisplayName("Should clear session memory")
    void shouldClearSessionMemory() {
        // Given
        String sessionId = "session-to-clear";
        promptService.continueConversation("Test message", sessionId);

        // When
        promptService.clearSession(sessionId);
        promptService.continueConversation("New message", sessionId);

        // Then - Should start fresh without previous context
        verify(mockChatModel, times(2)).call(promptCaptor.capture());
        
        Prompt newSessionPrompt = promptCaptor.getAllValues().get(1);
        List<Message> newSessionMessages = newSessionPrompt.getInstructions();
        
        // After clearing, should only have system message and new user message (not old messages)
        assertThat(newSessionMessages.size()).isLessThanOrEqualTo(3);
    }

    @Test
    @DisplayName("Should clear all sessions")
    void shouldClearAllSessions() {
        // Given
        promptService.continueConversation("Message 1", "session-1");
        promptService.continueConversation("Message 2", "session-2");

        // When
        promptService.clearAllSessions();
        
        // Then - New conversations should start fresh
        reset(mockChatModel);
        when(mockChatModel.call(any(Prompt.class)))
            .thenReturn(mockChatResponse("Fresh response"));
        when(mockChatModel.getOptions())
            .thenReturn(OpenAiChatOptions.builder().build());
        
        promptService.continueConversation("New message 1", "session-1");
        
        verify(mockChatModel).call(promptCaptor.capture());
        List<Message> newMessages = promptCaptor.getValue().getInstructions();
        
        // Should start fresh with only system + new message
        assertThat(newMessages.size()).isLessThanOrEqualTo(3);
    }

    @Test
    @DisplayName("Should validate all GPT-5 prompting patterns are present")
    void shouldContainAllGpt5Patterns() {
        // Test that key GPT-5 patterns are used throughout the service
        
        // 1. Low eagerness
        promptService.solveFocused("test");
        verify(mockChatModel, times(1)).call(promptCaptor.capture());
        assertThat(getPromptText(promptCaptor.getValue())).contains("context_gathering");
        
        // 2. Self-reflection (simplified in our implementation)
        reset(mockChatModel);
        when(mockChatModel.call(any(Prompt.class))).thenReturn(mockChatResponse("response"));
        when(mockChatModel.getOptions()).thenReturn(OpenAiChatOptions.builder().build());
        promptService.generateCodeWithReflection("test");
        verify(mockChatModel, times(1)).call(promptCaptor.capture());
        assertThat(getPromptText(promptCaptor.getValue())).contains("production-quality");
        
        // 3. Structured output
        reset(mockChatModel);
        when(mockChatModel.call(any(Prompt.class))).thenReturn(mockChatResponse("response"));
        when(mockChatModel.getOptions()).thenReturn(OpenAiChatOptions.builder().build());
        promptService.analyzeCode("test");
        verify(mockChatModel, times(1)).call(promptCaptor.capture());
        assertThat(getPromptText(promptCaptor.getValue())).contains("analysis_framework");
    }

    /**
     * Extract the text content from a Prompt's first message.
     */
    private String getPromptText(Prompt prompt) {
        List<Message> messages = prompt.getInstructions();
        if (messages.isEmpty()) return "";
        // For single-message prompts, return the first (and only) message text
        // For multi-message prompts (chat), concatenate all message texts
        StringBuilder sb = new StringBuilder();
        for (Message msg : messages) {
            sb.append(msg.getText()).append("\n");
        }
        return sb.toString();
    }

    /**
     * Helper method to set private field using reflection
     * (Simple alternative to @InjectMocks for @Autowired fields)
     */
    private void setField(Object target, String fieldName, Object value) {
        try {
            java.lang.reflect.Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set field " + fieldName, e);
        }
    }

    private static class TestableStreamingPromptService extends Gpt5PromptService {

        private final Queue<Flux<String>> responses = new ArrayDeque<>();
        private final List<String> prompts = new ArrayList<>();
        private final List<ReasoningEffort> efforts = new ArrayList<>();

        @SafeVarargs
        TestableStreamingPromptService(Flux<String>... responses) {
            this.responses.addAll(List.of(responses));
        }

        // Every streaming path funnels through this overload, so one override covers them all.
        @Override
        protected Flux<String> streamResponse(String prompt, ReasoningEffort effort) {
            prompts.add(prompt);
            efforts.add(effort);
            Flux<String> response = responses.poll();
            if (response == null) {
                return Flux.error(new IllegalStateException("No streaming response configured"));
            }
            return response;
        }

        List<String> prompts() {
            return prompts;
        }

        List<ReasoningEffort> efforts() {
            return efforts;
        }
    }
}
