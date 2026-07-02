# Module 01: Getting Started with Spring AI

## Table of Contents

- [What You'll Learn](#what-youll-learn)
- [Prerequisites](#prerequisites)
- [Understanding the Core Problem](#understanding-the-core-problem)
- [Understanding Tokens](#understanding-tokens)
- [How Memory Works](#how-memory-works)
- [How This Uses Spring AI](#how-this-uses-spring-ai)
- [Deploy Microsoft Foundry Infrastructure](#deploy-microsoft-foundry-infrastructure)
- [Run the Application](#run-the-application)
- [Using the Application](#using-the-application)
  - [Stateless Chat (Left Panel)](#stateless-chat-left-panel)
  - [Stateful Chat (Right Panel)](#stateful-chat-right-panel)
- [Summary](#summary)
- [Next Steps](#next-steps)

## What You'll Learn

This first module introduces Microsoft Foundry and starts building production-style applications. It focuses on conversational AI that remembers context and maintains state.

We'll use Microsoft Foundry's `gpt-4o-mini` throughout this guide. It's fast and cheap, which keeps the focus on the patterns rather than waiting for responses. When you add memory, you'll clearly see the difference between stateless and stateful behavior. (Module 02 will switch to GPT-5.2 specifically to explore reasoning controls.)

You'll build one application that demonstrates both patterns:

**Stateless Chat** - Each request is independent. The model has no memory of previous messages.

**Stateful Conversation** - Each request includes conversation history managed by Spring AI's `MessageWindowChatMemory`. The model maintains context across multiple turns with automatic sliding-window trimming. This is what production applications require.

## Prerequisites

- Azure subscription with Microsoft Foundry access
- Java 25, Maven 3.9+ (Spring AI itself supports Java 17+, but this repo targets Java 25 via Spring Boot 4)
- Azure CLI (https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- Azure Developer CLI (azd) (https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/install-azd)

> **Note:** Java, Maven, Azure CLI and Azure Developer CLI (azd) are pre-installed in the provided devcontainer.

> **Note:** This module uses `gpt-4o-mini` on Microsoft Foundry (via `AZURE_OPENAI_FAST_DEPLOYMENT`). The deployment is configured automatically via `azd up`.

## Understanding the Core Problem

Language models are stateless. Each API call is independent. If you send "My name is John" and then ask "What's my name?", the model has no idea you just introduced yourself. It treats every request as if it's the first conversation you've ever had.

This is fine for simple Q&A but useless for real applications. Customer service bots need to remember what you told them. Personal assistants need context. Any multi-turn conversation requires memory.

The following diagram contrasts the two approaches — on the left, a stateless call that forgets your name; on the right, a stateful call backed by conversation memory that remembers it.

<img src="images/stateless-vs-stateful.png" alt="Stateless vs Stateful Conversations" width="800"/>

*The difference between stateless (independent calls) and stateful (context-aware) conversations*

## Understanding Tokens

Before diving into conversations, it's important to understand tokens - the basic units of text that language models process:

<img src="images/token-explanation.png" alt="Token Explanation" width="800"/>

*Example of how text is broken into tokens - "I love AI!" becomes 4 separate processing units*

Tokens are how AI models measure and process text. Words, punctuation, and even spaces can be tokens. Your model has a limit of how many tokens it can process at once (400,000 for GPT-5.2, with up to 272,000 input tokens and 128,000 output tokens). Understanding tokens helps you manage conversation length and costs.

## How Memory Works

Chat memory solves the stateless problem by maintaining conversation history. Before sending your request to the model, the framework prepends relevant previous messages. When you ask "What's my name?", the system actually sends the entire conversation history, allowing the model to see you previously said "My name is John."

Spring AI provides conversation management through its `ChatMemory` abstraction. `MessageWindowChatMemory` maintains a sliding window of recent messages per conversation, automatically dropping old ones when the window is full. The diagram below shows how a sliding window of messages maintains recent conversation context.

<img src="images/memory-window.png" alt="Memory Window Concept" width="800"/>

*A sliding message window maintains recent messages, automatically dropping old ones*

## How This Uses Spring AI

Now that you understand the problem (stateless models), the cost dimension (tokens), and the solution (a sliding memory window), here's how Spring AI implements all three. This module uses two core Spring AI capabilities — **ChatModel** for sending prompts and **Chat Memory** for maintaining conversation history. Here's how the pieces fit together:

**Dependencies** - In the previous module you added `spring-ai-openai` — the plain SDK integration — because those demos built `OpenAiChatModel` by hand inside a `main()` method (calling `OpenAiChatModel.builder()...build()` directly). This module is a Spring Boot web app, so we swap to the **starter** variant, which pulls in the same OpenAI SDK *plus* Spring Boot auto-configuration: `OpenAiChatModel` is constructed for you from properties in `application.yaml` and injected wherever you need it. This is the standard pattern for Spring Boot applications, and it keeps your code clean and focused on business logic rather than boilerplate setup.

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-openai</artifactId> <!-- Version managed by Spring AI BOM in root pom.xml -->
</dependency>
```

> Rule of thumb: use `spring-ai-<provider>` for plain Java apps, and `spring-ai-starter-model-<provider>` when running inside Spring Boot.

**Chat Model** - The starter auto-configures `OpenAiChatModel` from properties in `application.yaml`, and Spring AI also provides a ready-to-use `ChatClient.Builder` bean that wraps the model with a fluent API. The rest of this module uses `ChatClient` rather than calling `OpenAiChatModel` directly ([SpringAiConfig.java](src/main/java/com/example/springai/config/SpringAiConfig.java)):

```yaml
spring:
  ai:
    openai:
      base-url: ${AZURE_OPENAI_ENDPOINT}
      api-key: ${AZURE_OPENAI_API_KEY}
      microsoft-deployment-name: ${AZURE_OPENAI_FAST_DEPLOYMENT}
      chat:
        model: ${AZURE_OPENAI_FAST_DEPLOYMENT}
```

Credentials come from environment variables set by `azd up`. Microsoft Foundry mode is detected automatically when the base URL contains `openai.azure.com`.

**Conversation Memory** - Spring AI's `MessageChatMemoryAdvisor` adds chat memory transparently to a `ChatClient`. It loads prior turns from a `ChatMemory` (here a `MessageWindowChatMemory` backed by an `InMemoryChatMemoryRepository`) before every call and writes the new exchange back afterward — you never touch the message list yourself ([ConversationService.java](src/main/java/com/example/springai/service/ConversationService.java)):

```java
// In SpringAiConfig.java — wire the memory once:
@Bean
ChatMemoryRepository chatMemoryRepository() {
    return new InMemoryChatMemoryRepository();
}

@Bean
ChatMemory chatMemory(ChatMemoryRepository repository) {
    return MessageWindowChatMemory.builder()
            .chatMemoryRepository(repository)
            .maxMessages(10)
            .build();
}

// In ConversationService.java — build a memory-aware ChatClient:
this.chatClient = chatClientBuilder
        .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
        .build();

String answer = chatClient.prompt()
        .user(message)
        .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversationId))
        .call()
        .content();
```

`MessageWindowChatMemory` keeps the last 10 messages per conversation ID, automatically trimming older messages. The `CONVERSATION_ID` advisor parameter scopes memory per user so multiple chats stay isolated. No manual list management — the advisor handles the sliding window for you.

> **🤖 Try with [GitHub Copilot](https://github.com/features/copilot) Chat:** Open [`ConversationService.java`](src/main/java/com/example/springai/service/ConversationService.java) and ask:
> - "How does MessageWindowChatMemory decide which messages to drop when it's full?"
> - "Can I implement custom memory storage using a database instead of in-memory?"
> - "How does MessageChatMemoryAdvisor interact with the ChatClient request lifecycle?"

The stateless chat endpoint skips memory entirely — it builds its own `ChatClient` without the advisor and calls `chatClient.prompt(prompt).call().content()`. The stateful endpoint delegates everything to the memory-aware client. Same model configuration, different patterns.

> **🤖 Try with [GitHub Copilot](https://github.com/features/copilot) Chat:** Open [`ChatController.java`](src/main/java/com/example/springai/app/ChatController.java) and ask:
> - "Why is this controller stateless — what would change if I added MessageChatMemoryAdvisor here?"
> - "How would I stream responses back to the client instead of waiting for the full completion?"
> - "When would I drop ChatClient and call OpenAiChatModel directly?"

## Deploy Microsoft Foundry Infrastructure

**Bash:**
```bash
cd 01-introduction
azd up  # Select subscription and location (eastus2 recommended)
```

**PowerShell:**
```powershell
cd 01-introduction
azd up  # Select subscription and location (eastus2 recommended)
```

> **Note:** If you encounter a timeout error (`RequestConflict: Cannot modify resource ... provisioning state is not terminal`), simply run `azd up` again. Azure resources may still be provisioning in the background, and retrying allows the deployment to complete once resources reach a terminal state.

This will:
1. Deploy Microsoft Foundry resource with GPT-5.2, gpt-4o-mini, and text-embedding-3-small models
2. Automatically generate `.env` file in project root with credentials
3. Set up all required environment variables

**Having deployment issues?** See the [Infrastructure README](infra/README.md) for detailed troubleshooting including subdomain name conflicts, manual Azure Portal deployment steps, and model configuration guidance.

**Verify deployment succeeded:**

**Bash:**
```bash
cat ../.env  # Should show AZURE_OPENAI_ENDPOINT, API_KEY, etc.
```

**PowerShell:**
```powershell
Get-Content ..\.env  # Should show AZURE_OPENAI_ENDPOINT, API_KEY, etc.
```

> **Note:** The `azd up` command automatically generates the `.env` file. If you need to update it later, you can either edit the `.env` file manually or regenerate it by running:
>
> **Bash:**
> ```bash
> cd ..
> bash .azd-env.sh
> ```
>
> **PowerShell:**
> ```powershell
> cd ..
> .\.azd-env.ps1
> ```

## Run the Application

**Verify deployment:**

Ensure the `.env` file exists in the root directory with Azure credentials. Run this from the module directory (`01-introduction/`):

**Bash:**
```bash
cat ../.env  # Should show AZURE_OPENAI_ENDPOINT, API_KEY, DEPLOYMENT
```

**PowerShell:**
```powershell
Get-Content ..\.env  # Should show AZURE_OPENAI_ENDPOINT, API_KEY, DEPLOYMENT
```

**Start the applications:**

**Option 1: Using Spring Boot Dashboard (Recommended for VS Code users)**

The dev container includes the Spring Boot Dashboard extension, which provides a visual interface to manage all Spring Boot applications. You can find it in the Activity Bar on the left side of VS Code (look for the Spring Boot icon).

From the Spring Boot Dashboard, you can:
- See all available Spring Boot applications in the workspace
- Start/stop applications with a single click
- View application logs in real-time
- Monitor application status

Simply click the play button next to "spring-ai-introduction" to start this module, or start all modules at once.

<img src="images/dashboard.png" alt="Spring Boot Dashboard" width="300"/>

**Option 2: Using shell scripts**

Start all web applications (all modules 01-06):

**Bash:**
```bash
cd ..  # Go to root directory
./start-all.sh
```

**PowerShell:**
```powershell
cd ..  # Go to root directory
.\start-all.ps1
```

Or start just this module:

**Bash:**
```bash
# From this module directory
./start.sh
```

**PowerShell:**
```powershell
# From this module directory
.\start.ps1
```

Both scripts automatically load environment variables from the root `.env` file and will build the JARs if they don't exist.

> **Note:** If you prefer to build all modules manually before starting:
>
> **Bash:**
> ```bash
> cd ..  # Go to root directory
> mvn clean package -DskipTests
> ```
>
> **PowerShell:**
> ```powershell
> cd ..  # Go to root directory
> mvn clean package -DskipTests
> ```

Open http://localhost:8080 in your browser.

**To stop:**

**Bash:**
```bash
./stop.sh  # This module only
# Or
cd .. && ./stop-all.sh  # All modules
```

**PowerShell:**
```powershell
.\stop.ps1  # This module only
# Or
cd ..; .\stop-all.ps1  # All modules
```

## Using the Application

The application provides a web interface with two chat implementations side-by-side.

<img src="images/home-screen.png" alt="Application Home Screen" width="800"/>

*Dashboard showing both Simple Chat (stateless) and Conversational Chat (stateful) options*

### Stateless Chat (Left Panel)

Try this first. Ask "My name is John" and then immediately ask "What's my name?" The model won't remember because each message is independent. This demonstrates the core problem with basic language model integration - no conversation context.

<img src="images/simple-chat-stateless-demo.png" alt="Stateless Chat Demo" width="800"/>

*AI doesn't remember your name from the previous message*

### Stateful Chat (Right Panel)

Now try the same sequence here. Ask "My name is John" and then "What's my name?" This time it remembers. The difference is the sliding message window - it maintains conversation history and includes it with each request. This is how production conversational AI works.

<img src="images/conversational-chat-stateful-demo.png" alt="Stateful Chat Demo" width="800"/>

*AI remembers your name from earlier in the conversation*

Both panels use the same `gpt-4o-mini` model. The only difference is memory. This makes it clear what memory brings to your application and why it's essential for real use cases.

## Summary

In this module you built your first production-style Spring AI application on Microsoft Foundry. You saw why language models are inherently stateless, and how Spring AI's `MessageWindowChatMemory` adds stateful, multi-turn conversations with automatic sliding-window trimming. The side-by-side stateless vs. stateful demo made it clear why memory is essential for real applications. Next, you'll focus on the prompts themselves and how their structure shapes response quality.

## Next Steps

**Next Module:** [02-prompt-engineering - Prompt Engineering with GPT-5.2](../02-prompt-engineering/README.md)

---

**Navigation:** [Back to Main](../README.md) | [Next: Module 02 - Prompt Engineering →](../02-prompt-engineering/README.md)


