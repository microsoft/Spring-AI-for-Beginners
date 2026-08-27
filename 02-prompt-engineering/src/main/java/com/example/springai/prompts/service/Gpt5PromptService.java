package com.example.springai.prompts.service;

import com.openai.client.OpenAIClientAsync;
import com.openai.models.Reasoning;
import com.openai.models.ReasoningEffort;
import com.openai.models.responses.ResponseCreateParams;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Gpt5PromptService - gpt-5.6-luna Prompting Best Practices
 * Run: ./start.sh (from module directory, after deploying Azure resources with azd up)
 * 
 * Service demonstrating gpt-5.6-luna prompting best practices with Spring AI.
 * 
 * Based on OpenAI's GPT-5 Prompting Guide:
 * https://github.com/openai/openai-cookbook/blob/main/examples/gpt-5/gpt-5_prompting_guide.ipynb
 * 
 * Key Concepts:
 * - Low vs high eagerness (reasoning depth control)
 * - Task execution with progress updates
 * - Self-reflecting code generation with quality rubrics
 * - Structured analysis frameworks
 * - Multi-turn conversations with context
 * - Constrained output generation
 * - Explicit step-by-step reasoning
 * 
 * 💡 Ask GitHub Copilot:
 * - "What's the difference between low eagerness and high eagerness prompting patterns?"
 * - "How do the XML tags in prompts help structure the AI's response?"
 * - "When should I use self-reflection patterns vs direct instruction?"
 * - "How can I adapt these patterns for non-GPT-5 models like GPT-4?"
 */
@Service
public class Gpt5PromptService {

    private static final Logger log = LoggerFactory.getLogger(Gpt5PromptService.class);

    @Autowired
    private ChatClient chatClient;

    @Autowired
    private OpenAIClientAsync openAIClientAsync;

    @Value("${AZURE_OPENAI_DEPLOYMENT}")
    private String deploymentName;

    private final ChatMemory chatMemory = MessageWindowChatMemory.builder()
            .maxMessages(10)
            .build();
    private final Set<String> activeSessionIds = ConcurrentHashMap.newKeySet();

    // ==================== STREAMING HELPER ====================

    /**
     * Streams tokens directly from the OpenAI async client, bypassing the
     * Spring AI SDK's collectList() which buffers the entire response.
     * Each token is emitted as it arrives from the API for real-time display.
     *
     * Uses the Responses API rather than Chat Completions: on Chat Completions a
     * gpt-5.6 model finishes all of its reasoning before emitting the first text
     * token (~58s of blank screen), while the Responses API streams from ~3s.
     */
    protected Flux<String> streamResponse(String prompt) {
        return streamResponse(prompt, ReasoningEffort.LOW);
    }

    /**
     * Streaming with an explicit reasoning budget. {@code effort} is a real API
     * parameter here, so the eagerness demos can show the model actually thinking
     * more or less rather than only being asked to.
     */
    protected Flux<String> streamResponse(String prompt, ReasoningEffort effort) {
        log.info("[STREAM] Starting streaming request (reasoning effort: {})", effort);
        log.debug("[STREAM] Prompt length: {} chars", prompt.length());

        ResponseCreateParams params = ResponseCreateParams.builder()
                .model(deploymentName)
                .input(prompt)
                .reasoning(Reasoning.builder().effort(effort).build())
                .build();

        return Flux.create(sink -> {
            openAIClientAsync.responses().createStreaming(params)
                    .subscribe(event -> {
                        try {
                            event.outputTextDelta().ifPresent(delta -> {
                                String text = delta.delta();
                                if (!text.isEmpty()) {
                                    sink.next(text);
                                }
                            });
                        } catch (Exception e) {
                            sink.error(e);
                        }
                    })
                    .onCompleteFuture()
                    .whenComplete((unused, throwable) -> {
                        if (throwable != null) {
                            sink.error(throwable);
                        } else {
                            sink.complete();
                        }
                    });
        });
    }

    /**
     * Collects a Responses API stream into one string.
     * Spring AI's own client is pinned to a 60s timeout here (its timeout properties are
     * ignored), so the demos whose prompts run longer than that use this instead of
     * {@code chatClient}. The short demos still use chatClient's fluent API.
     */
    private String blockingResponse(String prompt, ReasoningEffort effort) {
        return streamResponse(prompt, effort)
                .collect(StringBuilder::new, StringBuilder::append)
                .map(StringBuilder::toString)
                .block();
    }

    // ==================== EXAMPLE 1: LOW EAGERNESS ====================

    /**
     * Example 1: Low Eagerness - Quick, focused responses
     * Use when you want fast, direct answers without deep exploration.
     */
    public String solveFocused(String problem) {
        String prompt = """
            <context_gathering>
            - Search depth: very low
            - Bias strongly towards providing a correct answer as quickly as possible
            - Usually, this means an absolute maximum of 2 reasoning steps
            - If you think you need more time, state what you know and what's uncertain
            </context_gathering>
            
            Problem: %s
            
            Provide your answer:
            """.formatted(problem);

        return chatClient.prompt(prompt).call().content();
    }

    /**
     * Example 1b: Low Eagerness with Streaming
     */
    public Flux<String> solveFocusedStreaming(String problem) {
        String prompt = """
            <context_gathering>
            - Search depth: very low
            - Bias strongly towards providing a correct answer as quickly as possible
            - Usually, this means an absolute maximum of 2 reasoning steps
            - If you think you need more time, state what you know and what's uncertain
            </context_gathering>
            
            Problem: %s
            
            Provide your answer:
            """.formatted(problem);
        return streamResponse(prompt, ReasoningEffort.NONE);
    }

    // ==================== EXAMPLE 2: HIGH EAGERNESS ====================

    /**
     * Example 2: High Eagerness - Thorough, autonomous problem solving
     * Use for complex tasks where you want the model to explore thoroughly.
     */
    public String solveAutonomous(String problem) {
        String prompt = """
            Analyze this problem thoroughly and provide a comprehensive solution.
            Consider multiple approaches, trade-offs, and important details.
            Show your analysis and reasoning in your response.
            
            Problem: %s
            """.formatted(problem);

        // Not chatClient here: this prompt runs past the 60s the Spring AI client is pinned to.
        return blockingResponse(prompt, ReasoningEffort.MEDIUM);
    }

    /**
     * Example 2b: High Eagerness with Streaming
     * Streams tokens as they arrive so you can see progress in real-time.
     * Avoids timeout issues with long-running reasoning.
     */
    public Flux<String> solveAutonomousStreaming(String problem) {
        String prompt = """
            Analyze this problem thoroughly and provide a comprehensive solution.
            Consider multiple approaches, trade-offs, and important details.
            Show your analysis and reasoning in your response.
            
            Problem: %s
            """.formatted(problem);

        log.info("[STREAM] Starting streaming request for high-eagerness prompt");
        log.debug("[STREAM] Prompt: {}", prompt);

        // MEDIUM, not HIGH: HIGH delays the first token to ~46s, which is a blank screen in the demo.
        return streamResponse(prompt, ReasoningEffort.MEDIUM);
    }

    // ==================== EXAMPLE 3: TASK EXECUTION ====================

    /**
     * Example 3: Task Execution with Progress Updates
     * Provides clear preambles and progress updates for better UX.
     */
    public String executeWithPreamble(String task) {
        String prompt = """
            <task_execution>
            1. First, briefly restate the user's goal in a friendly way
            
            2. Create a step-by-step plan:
               - List all steps needed
               - Identify potential challenges
               - Outline success criteria
            
            3. Execute each step:
               - Narrate what you're doing
               - Show progress clearly
               - Handle any issues that arise
            
            4. Summarize:
               - What was completed
               - Any important notes
               - Next steps if applicable
            </task_execution>
            
            <tool_preambles>
            - Always begin by rephrasing the user's goal clearly
            - Outline your plan before executing
            - Narrate each step as you go
            - Finish with a distinct summary
            </tool_preambles>
            
            Task: %s
            
            Begin execution:
            """.formatted(task);

        return chatClient.prompt(prompt).call().content();
    }

    /**
     * Example 3b: Task Execution with Streaming
     */
    public Flux<String> executeWithPreambleStreaming(String task) {
        String prompt = """
            <task_execution>
            1. First, briefly restate the user's goal in a friendly way
            
            2. Create a step-by-step plan:
               - List all steps needed
               - Identify potential challenges
               - Outline success criteria
            
            3. Execute each step:
               - Narrate what you're doing
               - Show progress clearly
               - Handle any issues that arise
            
            4. Summarize:
               - What was completed
               - Any important notes
               - Next steps if applicable
            </task_execution>
            
            <tool_preambles>
            - Always begin by rephrasing the user's goal clearly
            - Outline your plan before executing
            - Narrate each step as you go
            - Finish with a distinct summary
            </tool_preambles>
            
            Task: %s
            
            Begin execution:
            """.formatted(task);
        return streamResponse(prompt);
    }

    // ==================== EXAMPLE 4: CODE GENERATION ====================

    /**
     * Example 4: Self-Reflecting Code Generation
     * Generates high-quality code using internal quality rubrics.
     */
    public String generateCodeWithReflection(String requirement) {
        String prompt = """
            Generate Java code with production-quality standards: %s
            Keep it simple and include basic error handling.
            """.formatted(requirement);

        return chatClient.prompt(prompt).call().content();
    }

    /**
     * Example 4b: Code Generation with Streaming
     */
    public Flux<String> generateCodeWithReflectionStreaming(String requirement) {
        String prompt = """
            Generate Java code with production-quality standards: %s
            Keep it simple and include basic error handling.
            """.formatted(requirement);
        return streamResponse(prompt);
    }

    // ==================== EXAMPLE 5: CODE ANALYSIS ====================

    /**
     * Example 5: Structured Analysis with Clear Instructions
     * Analyzes code with specific criteria and structured output.
     */
    public String analyzeCode(String code) {
        String prompt = """
            <analysis_framework>
            You are an expert code reviewer. Analyze the code for:
            
            1. Correctness
               - Does it work as intended?
               - Are there logical errors?
            
            2. Best Practices
               - Follows language conventions?
               - Appropriate design patterns?
            
            3. Performance
               - Any inefficiencies?
               - Scalability concerns?
            
            4. Security
               - Potential vulnerabilities?
               - Input validation?
            
            5. Maintainability
               - Code clarity?
               - Documentation?
            
            <output_format>
            Provide your analysis in this structure:
            - Summary: One-sentence overall assessment
            - Strengths: 2-3 positive points
            - Issues: List any problems found with severity (High/Medium/Low)
            - Recommendations: Specific improvements
            </output_format>
            </analysis_framework>
            
            Code to analyze:
            ```
            %s
            ```
            
            Provide your structured analysis:
            """.formatted(code);

        return chatClient.prompt(prompt).call().content();
    }

    /**
     * Example 5b: Structured Analysis with Streaming
     */
    public Flux<String> analyzeCodeStreaming(String code) {
        String prompt = """
            <analysis_framework>
            You are an expert code reviewer. Analyze the code for:
            
            1. Correctness
               - Does it work as intended?
               - Are there logical errors?
            
            2. Best Practices
               - Follows language conventions?
               - Appropriate design patterns?
            
            3. Performance
               - Any inefficiencies?
               - Scalability concerns?
            
            4. Security
               - Potential vulnerabilities?
               - Input validation?
            
            5. Maintainability
               - Code clarity?
               - Documentation?
            
            <output_format>
            Provide your analysis in this structure:
            - Summary: One-sentence overall assessment
            - Strengths: 2-3 positive points
            - Issues: List any problems found with severity (High/Medium/Low)
            - Recommendations: Specific improvements
            </output_format>
            </analysis_framework>
            
            Code to analyze:
            ```
            %s
            ```
            
            Provide your structured analysis:
            """.formatted(code);
        return streamResponse(prompt);
    }

    // ==================== EXAMPLE 6: MULTI-TURN CONVERSATION ====================

    private static final SystemMessage CONVERSATION_SYSTEM_MESSAGE = new SystemMessage("""
            You are a helpful assistant in an ongoing conversation.
            
            <conversation_guidelines>
            - Remember previous context from this session
            - Build on earlier discussion points naturally
            - Ask clarifying questions when truly needed
            - Maintain consistent personality and tone throughout
            - Reference prior exchanges when relevant
            </conversation_guidelines>
            
            <response_style>
            - Be concise but complete
            - Use examples when they help understanding
            - Format responses clearly with proper structure
            - Acknowledge the user's previous messages when relevant
            - Show that you understand the conversation flow
            </response_style>
            
            <tool_preambles>
            - If you need to perform multiple steps, outline your plan first
            - Provide updates as you work through complex requests
            - Summarize what you've done at the end
            </tool_preambles>
            """);

    /**
     * Example 6: Multi-Turn Conversation with Context Preservation
     * Maintains conversation context following GPT-5 patterns.
     */
    public String continueConversation(String userMessage, String sessionId) {
        activeSessionIds.add(sessionId);

        // Add system message on first interaction
        if (chatMemory.get(sessionId).isEmpty()) {
            chatMemory.add(sessionId, CONVERSATION_SYSTEM_MESSAGE);
        }

        // Add user message
        chatMemory.add(sessionId, new UserMessage(userMessage));

        // Generate response using conversation history from ChatMemory
        String responseText = chatClient.prompt()
                .messages(chatMemory.get(sessionId))
                .call()
                .content();

        // Store assistant's response in memory
        chatMemory.add(sessionId, new AssistantMessage(responseText));

        return responseText;
    }

    /**
     * Example 6b: Multi-Turn Conversation with Streaming
     */
    public Flux<String> continueConversationStreaming(String userMessage, String sessionId) {
        activeSessionIds.add(sessionId);

        if (chatMemory.get(sessionId).isEmpty()) {
            chatMemory.add(sessionId, CONVERSATION_SYSTEM_MESSAGE);
        }

        chatMemory.add(sessionId, new UserMessage(userMessage));

        List<Message> messages = chatMemory.get(sessionId);

        log.info("[STREAM] Starting streaming chat, session: {}", sessionId);

        // Build the full conversation as a single prompt string for direct streaming
        StringBuilder fullPrompt = new StringBuilder();
        for (Message msg : messages) {
            if (msg instanceof SystemMessage) {
                fullPrompt.append("[System] ").append(msg.getText()).append("\n\n");
            } else if (msg instanceof UserMessage) {
                fullPrompt.append("[User] ").append(msg.getText()).append("\n\n");
            } else if (msg instanceof AssistantMessage) {
                fullPrompt.append("[Assistant] ").append(msg.getText()).append("\n\n");
            }
        }

        StringBuilder assistantResponse = new StringBuilder();

        return streamResponse(fullPrompt.toString())
                .doOnNext(assistantResponse::append)
                .doOnComplete(() -> {
                    String responseText = assistantResponse.toString();
                    if (!responseText.isBlank()) {
                        chatMemory.add(sessionId, new AssistantMessage(responseText));
                    }
                    log.info("[STREAM] Chat streaming completed for session: {}", sessionId);
                })
                .doOnError(error -> {
                    log.warn("[STREAM] Chat streaming failed for session: {}", sessionId, error);
                });
    }

    // ==================== EXAMPLE 7: CONSTRAINED OUTPUT ====================

    /**
     * Example 7: Constrained Output Generation
     * Generates output that strictly adheres to constraints.
     */
    public String generateConstrained(String topic, String format, int maxWords) {
        String prompt = """
            <strict_constraints>
            You MUST adhere to these constraints:
            - Topic: %s
            - Format: %s
            - Maximum words: %d
            - Do NOT exceed the word limit
            - Do NOT deviate from the specified format
            </strict_constraints>
            
            <quality_requirements>
            Within the constraints:
            - Be informative and accurate
            - Use clear, professional language
            - Organize content logically
            - Include relevant details
            </quality_requirements>
            
            Generate the content:
            """.formatted(topic, format, maxWords);

        return chatClient.prompt(prompt).call().content();
    }

    /**
     * Example 7b: Constrained Output with Streaming
     */
    public Flux<String> generateConstrainedStreaming(String topic, String format, int maxWords) {
        String prompt = """
            <strict_constraints>
            You MUST adhere to these constraints:
            - Topic: %s
            - Format: %s
            - Maximum words: %d
            - Do NOT exceed the word limit
            - Do NOT deviate from the specified format
            </strict_constraints>
            
            <quality_requirements>
            Within the constraints:
            - Be informative and accurate
            - Use clear, professional language
            - Organize content logically
            - Include relevant details
            </quality_requirements>
            
            Generate the content:
            """.formatted(topic, format, maxWords);
        return streamResponse(prompt);
    }

    // ==================== EXAMPLE 8: STEP-BY-STEP REASONING ====================

    /**
     * Example 8: Step-by-Step Reasoning
     * Encourages explicit reasoning process.
     */
    public String solveWithReasoning(String problem) {
        String prompt = """
            Solve this problem by explaining your reasoning step by step in your response.
            
            Show me:
            1. How you understand the problem
            2. Your approach to solving it
            3. Each step of your work
            4. Verification that your answer is correct
            
            Important: Write out your step-by-step thinking in your answer, not just the final result.
            
            Problem: %s
            """.formatted(problem);

        // Measured at ~56s, close enough to the client's 60s ceiling to fail intermittently.
        return blockingResponse(prompt, ReasoningEffort.LOW);
    }

    /**
     * Example 8b: Step-by-Step Reasoning with Streaming
     */
    public Flux<String> solveWithReasoningStreaming(String problem) {
        String prompt = """
            Solve this problem by explaining your reasoning step by step in your response.
            
            Show me:
            1. How you understand the problem
            2. Your approach to solving it
            3. Each step of your work
            4. Verification that your answer is correct
            
            Important: Write out your step-by-step thinking in your answer, not just the final result.
            
            Problem: %s
            """.formatted(problem);
        return streamResponse(prompt);
    }

    // ==================== SESSION MANAGEMENT ====================

    /**
     * Clear session memory for a specific session.
     */
    public void clearSession(String sessionId) {
        chatMemory.clear(sessionId);
        activeSessionIds.remove(sessionId);
    }

    /**
     * Clear all session memories.
     */
    public void clearAllSessions() {
        activeSessionIds.forEach(chatMemory::clear);
        activeSessionIds.clear();
    }
}
