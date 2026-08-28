# Module 05: Model Context Protocol (MCP)

## Table of Contents

- [What You'll Learn](#what-youll-learn)
- [Prerequisites](#prerequisites)
- [Understanding MCP](#understanding-mcp)
- [How MCP Works](#how-mcp-works)
- [How This Uses Spring AI](#how-this-uses-spring-ai)
- [How This Demo Works](#how-this-demo-works)
- [Run the Application](#run-the-application)
- [Using the Application](#using-the-application)
- [Code Walkthrough](#code-walkthrough)
- [Key Concepts](#key-concepts)
- [MCP vs Tools (Module 04)](#mcp-vs-tools-module-04)
- [Summary](#summary)
- [Next Steps](#next-steps)

## What You'll Learn

In the previous modules, you learned about chat, prompt engineering, RAG, and tool calling. But all of those tools lived *inside* the same application. What if your tools live in a different service? What if you want a universal protocol for AI applications to discover and call tools across service boundaries?

That's what the **Model Context Protocol (MCP)** provides. MCP is an open protocol for connecting AI applications to external tool providers — a standard way for AI clients to discover and invoke tools hosted on remote servers.

<img src="images/mcp-architecture.png" alt="MCP Architecture Overview" width="800"/>

*MCP provides a universal protocol for AI applications to discover and invoke tools on remote servers — decoupling AI logic from tool implementations.*

In this module, you'll build a **Tic-Tac-Toe game** that demonstrates MCP in action:
- An **MCP Server** exposes game-engine tools *and* an AI move tool powered by Microsoft Foundry
- An **MCP Client** discovers those tools and invokes them in **two ways**:
  - **Direct calls** (`ToolCallback.call()`) — the client picks the tool, used by the board UI
  - **Agent-style calls** (`ChatClient` + the same tool callbacks) — the LLM picks the tool, used by the chat panel
- The server's own move strategy uses **Spring AI's ChatClient** internally
- All client–server communication flows through the **MCP Streamable HTTP protocol**

## Prerequisites

- Completed [Module 01 - Introduction](../01-introduction/README.md) (Microsoft Foundry resources deployed)
- Completed previous modules recommended (this module builds on [tool calling from Module 04](../04-tools/README.md))
- `.env` file in root directory with Azure credentials (created by `azd up` in Module 01)

> **Note:** If you haven't completed Module 01, follow the deployment instructions there first.

## Understanding MCP

In Module 04, you used `@Tool` annotations to define tools *inside* your application. That works well when tools are tightly coupled to your app, but in practice tools often live in separate services — microservices, third-party APIs, or shared infrastructure.

MCP gives you:

- **Universal protocol** — a standard way for any AI app to discover and call tools
- **Service separation** — tools run in their own process and can be deployed independently
- **Auto-discovery** — clients learn what tools are available at connect time
- **Cross-language support** — MCP servers and clients can be written in any language

A growing ecosystem of MCP servers also ships pre-built integrations for databases, APIs, and cloud services, so your AI app can connect to *anyone's* MCP server using the same protocol.

<img src="images/custom-vs-mcp-tools.png" alt="Custom Tools vs MCP Tools" width="800"/>

*Custom `@Tool` methods run in-process; `@McpTool` methods run on a separate server and are discovered over the network.*

## How MCP Works

MCP follows a client–server model. The **MCP client** (your AI application) connects to one or more **MCP servers**, asks each for its tool catalog at startup, and then invokes those tools by name over the transport. Spring AI's `ToolCallbackProvider` handles the connect, discover, and invoke steps automatically — you receive ready-to-use `ToolCallback` objects.

<img src="images/mcp-protocol-detail.png" alt="MCP Protocol Detail" width="800"/>

*Clients send JSON-RPC requests; servers return structured results. Tool schemas are exchanged during the discovery phase.*

This module uses **Streamable HTTP**, the modern recommended MCP transport (it replaces legacy SSE). MCP also supports stdio for local process-based servers.

> **📝 Advanced — Stateful vs Stateless Streamable HTTP.** Streamable HTTP has two flavours, selected with one property. **Stateful** (the default in this module) keeps a long-lived stream so the server can push sampling, elicitation, and progress events back to the client; it needs sticky sessions behind a load balancer. **Stateless** is pure request/response — each tool call is independent, no server-push, scales horizontally without affinity. Switch with `spring.ai.mcp.server.protocol: STATELESS`. Pick stateful if you need server→client callbacks (see [Beyond `@McpTool`](#key-concepts)); pick stateless for high-throughput tool servers and serverless deployments.

## How This Uses Spring AI

Now that you understand what MCP is and how the client–server protocol works, here's how Spring AI implements both sides. This module is two Spring Boot applications. The **server** uses the Web MVC MCP server starter to expose `@McpTool` endpoints over Streamable HTTP, plus the OpenAI starter so it can call Microsoft Foundry from inside the `aiMove` tool. The **client** uses the matching MCP client starter to discover those tools, plus the OpenAI starter so the agent path can hand the discovered tools to a `ChatClient`.

Both applications inherit `spring-ai-starter-model-openai` and `spring-ai-client-chat` from the root [pom.xml](../pom.xml) (see [Module 01](../01-introduction/README.md#how-this-uses-spring-ai)), so each application's POM declares only what is unique to it.

**Server dependencies** ([mcp-server/pom.xml](mcp-server/pom.xml)):

```xml
<!-- Exposes @McpTool methods over Streamable HTTP -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-server-webmvc</artifactId>
</dependency>
```

**Client dependencies** ([mcp-client/pom.xml](mcp-client/pom.xml)) mirror that, swapping in `spring-ai-starter-mcp-client-webflux` and adding Thymeleaf for the web UI. The inherited OpenAI starter and `spring-ai-client-chat` are only needed for the agent path; the direct-call path doesn't use them.

**Server configuration** ([application.yaml](mcp-server/src/main/resources/application.yaml)) wires Microsoft Foundry credentials and declares the MCP server:

```yaml
spring:
  ai:
    openai:
      base-url: ${AZURE_OPENAI_ENDPOINT}
      api-key: ${AZURE_OPENAI_API_KEY}
      microsoft-deployment-name: ${AZURE_OPENAI_FAST_DEPLOYMENT}
      chat:
        model: ${AZURE_OPENAI_FAST_DEPLOYMENT}
    mcp:
      server:
        name: tictactoe-server
        protocol: STREAMABLE
```

**Client configuration** ([application.yaml](mcp-client/src/main/resources/application.yaml)) reuses the same OpenAI block and points at the server URL:

```yaml
spring:
  ai:
    mcp:
      client:
        streamable-http:
          connections:
            tictactoe-server:
              url: http://localhost:8085
```

The direct-call path only needs the `mcp.client` block; the agent path also needs the `openai` block.

## How This Demo Works

### MCP Server — Game Engine + AI Strategy

[TicTacToeTools.java](mcp-server/src/main/java/com/example/springai/mcp/server/TicTacToeTools.java) | [GameEngine.java](mcp-server/src/main/java/com/example/springai/mcp/server/GameEngine.java)

The MCP server is the game engine **and** the AI strategist. It connects to Microsoft Foundry to power the `aiMove` tool, and exposes five tools via `@McpTool`:

| Tool | Description |
|------|-------------|
| `startNewGame()` | Creates a new game with an empty 3×3 board |
| `makeMove(gameId, position, player)` | Places X or O at a position (0–8), validates the move, checks for wins |
| `aiMove(gameId)` | **LLM-powered** — Analyzes the board via ChatClient, picks the best position, and executes the move as O |
| `getBoardState(gameId)` | Returns the current board, status, and whose turn it is |
| `getAvailableMoves(gameId)` | Returns the list of empty positions |

### MCP Client — Two Paths to the Same Tools

[GameService.java](mcp-client/src/main/java/com/example/springai/mcp/client/GameService.java) | [AgentService.java](mcp-client/src/main/java/com/example/springai/mcp/client/AgentService.java)

The client discovers the server's tools once at startup and exposes them through two patterns side by side, sharing the **same** `ToolCallbackProvider` bean:

1. **Direct MCP tool calls** (`GameService`) — Board actions call a specific `ToolCallback` via `ToolCallback.call()`. The client picks the tool. Powers the board UI.
2. **Agent-style tool calls** (`AgentService`) — The same provider is handed to a `ChatClient`. The user types a natural-language request, the LLM reads the discovered tool descriptions, and the model decides which tools to invoke. A `MessageChatMemoryAdvisor` (same pattern as [Module 01](../01-introduction/README.md)) holds the active `gameId` so follow-ups don't have to repeat it.

The only difference between the two paths is **who's making the decision** — your code, or the model.

### Game Flow

<img src="images/client-server-sequence.png" alt="MCP Tic-Tac-Toe client-server sequence diagram showing both the direct board path and the agent chat path" width="800"/>

Clicking the board calls `makeMove` then `aiMove` directly. Typing in the chat panel sends the message plus the visual board's `gameId` to the LLM, which picks the same MCP tools through the agent path. Either way, both paths drive the same MCP server, so the visual board and the chat always agree on the game state. (PlantUML source: [`images/client-server-sequence.puml`](images/client-server-sequence.puml).)

## Run the Application

This module needs **two Spring Boot applications running side by side** — start the server first, then the client.

**Verify your `.env` exists in the repo root** (created by `azd up` in Module 01):

```bash
# Bash
cat ../.env

# PowerShell
Get-Content ..\.env
```

**Option 1: Spring Boot Dashboard (VS Code)**

The dev container ships the Spring Boot Dashboard extension. Open it from the Activity Bar, start `mcp-server` (wait until it's listening on 8085), then start `mcp-client`.

<img src="images/dashboard.png" alt="Spring Boot Dashboard" width="300"/>

**Option 2: Start scripts**

From the `05-mcp/` directory, open two terminals — one per app:

```bash
# Terminal 1 — Bash
cd 05-mcp && ./start-server.sh

# Terminal 2 — Bash
cd 05-mcp && ./start-client.sh
```

```powershell
# Terminal 1 — PowerShell
cd 05-mcp; .\start-server.ps1

# Terminal 2 — PowerShell
cd 05-mcp; .\start-client.ps1
```

Server listens on **http://localhost:8085**, client on **http://localhost:8082**. Both scripts pick up Foundry credentials from the root `.env`.

To start **every** module at once (01–06), run `./start-all.sh` (or `.\start-all.ps1`) from the repo root; use the matching `stop-all` script to tear everything down.

Open **http://localhost:8082** in your browser.

## Using the Application

<img src="images/game-and-architecture.png" alt="Tic-Tac-Toe Game UI" width="800"/>

You play as **X** against an AI playing **O**. Every action — yours and the AI's — flows through MCP tools on the server.

- **Click New Game** to call `startNewGame` and get a fresh board.
- **Click any empty cell** to place your X. The client invokes `makeMove` directly (no LLM for human moves).
- **Watch the AI respond.** The client then calls `aiMove`; the server asks Microsoft Foundry which position to play and executes the move.
- **Try the Agent Chat panel** below the board. This is the LLM-orchestrated path — describe what you want and the model picks the tool: *"Start a new game"*, *"Place my X at position 4"*, *"What positions are still open?"*. Chat memory holds the active `gameId`, so follow-ups don't need to repeat it. Click **🧹 Reset Chat** to start over with a fresh conversation.
- **The board and the chat share one game.** The visual board updates whenever the agent moves a piece, and clicks on the board continue the same game the agent is playing.
- **Track your score** at the top — wins, draws, and losses persist in `localStorage`. **Reset Scores** clears them.

## Code Walkthrough

### Server: @McpTool Definitions

[TicTacToeTools.java](mcp-server/src/main/java/com/example/springai/mcp/server/TicTacToeTools.java)

The server uses `@McpTool` and `@McpToolParam` to expose game operations. Spring AI registers these automatically so any MCP client can discover and invoke them:

```java
@Service
public class TicTacToeTools {
    // ... gameEngine + chatClient fields ...

    @McpTool(description = "Make a move on the tic-tac-toe board. "
            + "Returns the updated board state, game status "
            + "(IN_PROGRESS, WON, or DRAW), and the winner if applicable.")
    public String makeMove(
            @McpToolParam(description = "The game ID returned by startNewGame") String gameId,
            @McpToolParam(description = "Board position 0-8 (top-left=0, bottom-right=8)") int position,
            @McpToolParam(description = "Player symbol: X for human, O for AI") String player) {
        return gameEngine.makeMove(gameId, position, player);
    }
}
```

Descriptions are written **for AI consumption** — they explain *what* the tool does, *what it returns*, and *how to use it*. MCP clients and LLMs rely on them to choose tools. The other four `@McpTool` methods (`startNewGame`, `aiMove`, `getBoardState`, `getAvailableMoves`) follow the same pattern.

### Server: AI Strategy via ChatClient

[TicTacToeTools.java](mcp-server/src/main/java/com/example/springai/mcp/server/TicTacToeTools.java)

The `aiMove` tool is where the LLM meets MCP. The server fetches the board, asks Microsoft Foundry for the best move via `ChatClient`, validates it, and executes — all inside one MCP tool call:

```java
@McpTool(description = "AI makes a strategic move as player O using LLM-powered analysis...")
public String aiMove(@McpToolParam(description = "The game ID") String gameId) {
    String boardState = gameEngine.getBoardState(gameId);
    Set<Integer> available = parseAvailableMoves(gameEngine.getAvailableMoves(gameId));

    String aiResponse = chatClient.prompt()
            .system(AI_STRATEGY_PROMPT)
            .user("Board: " + boardState + "\nAvailable: " + available + "\nChoose:")
            .call()
            .content();

    int position = selectMove(aiResponse, available);   // validates + falls back if needed
    return gameEngine.makeMove(gameId, position, "O");
}
```

Game logic and LLM reasoning live together on the server, so the client stays thin — any MCP client can call `aiMove` without its own LLM configuration. `selectMove` extracts the first digit from the model's reply and falls back to a strategic order (center → corners → edges) if the model returns something invalid or already played — a small but important guardrail when you let an LLM pick from a constrained set.

### Client: Tool Discovery via ToolCallbackProvider

[GameService.java](mcp-client/src/main/java/com/example/springai/mcp/client/GameService.java)

At startup, Spring AI's `ToolCallbackProvider` connects to every configured MCP server and discovers its tools. The client just stores them in a map:

```java
@Service
public class GameService {
    private final Map<String, ToolCallback> mcpTools;

    public GameService(ToolCallbackProvider toolCallbackProvider) {
        this.mcpTools = new HashMap<>();
        for (ToolCallback cb : toolCallbackProvider.getToolCallbacks()) {
            mcpTools.put(cb.getToolDefinition().name(), cb);
        }
    }
}
```

`ToolCallbackProvider` is injected automatically — Spring Boot discovers the server connection from `application.yaml`. **The same provider is reused by both the direct-call path and the agent path** below.

### Client: Direct MCP Tool Invocation

[GameService.java](mcp-client/src/main/java/com/example/springai/mcp/client/GameService.java)

For deterministic actions, the client calls MCP tools directly — no LLM involved:

```java
public String playerMove(String gameId, int position) {
    return callTool("makeMove",
        String.format("{\"gameId\":\"%s\",\"position\":%d,\"player\":\"X\"}",
                      gameId, position));
}

public String aiMove(String gameId) {
    return callTool("aiMove",
        String.format("{\"gameId\":\"%s\"}", gameId));
}
```

The `aiMove` call is just another MCP tool invocation — the client doesn't know or care that the server uses an LLM internally. That's MCP's abstraction in action: AI complexity stays behind the tool interface.

### Client: Agent-style Tool Calling with ChatClient

[AgentService.java](mcp-client/src/main/java/com/example/springai/mcp/client/AgentService.java)

The agent path takes the **same** `ToolCallbackProvider` that `GameService` uses and hands it to a `ChatClient`. The LLM reads the tool descriptions discovered from the server and decides which to call. A `MessageChatMemoryAdvisor` (same pattern as [Module 01](../01-introduction/README.md)) keeps the conversation stateful so the agent remembers the active `gameId` across turns:

```java
this.chatClient = builder
        .defaultSystem(SYSTEM_PROMPT)
        .defaultTools((Object[]) mcpToolCallbacks.getToolCallbacks())    // tools
        .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())   // memory
        .build();
```

When the LLM emits a `tool_calls` response, Spring AI looks up the callback, executes the underlying MCP call over Streamable HTTP, feeds the result back to the model, and loops until the model produces a final answer — no extra code on your side.

**Cross-path sync.** `AgentService` exposes a three-arg `chat(conversationId, userMessage, boardGameId)` overload so a user who started a game by clicking the board can keep playing it through chat. Before every turn it appends a fresh `[Board snapshot]` `AssistantMessage` (built from a real `getBoardState` tool call) to chat memory, and the system prompt tells the model to treat the most recent snapshot as ground truth. To keep state flowing the other way — from chat back to the board — each discovered `ToolCallback` is wrapped with a small decorator that captures any `gameId` returned by `startNewGame`, using Spring AI's `ToolContext` to carry the conversation id. See [`AgentService.java`](mcp-client/src/main/java/com/example/springai/mcp/client/AgentService.java) for the full implementation.

> **🤖 Try with [GitHub Copilot](https://github.com/features/copilot) Chat:** Open any of the files above and ask:
> - *"How does ToolCallbackProvider auto-discover tools from the MCP server?"*
> - *"What's the difference between `ToolCallback.call()` and passing tools to `ChatClient`?"*
> - *"How would I restrict which discovered MCP tools the agent is allowed to call?"*

## Key Concepts

### Direct Tool Calls vs LLM-Orchestrated Calls

Both patterns live on the client and share the same `ToolCallbackProvider`. The only thing that changes is **who picks the tool**:

| Pattern | Who decides | Spring AI API | When to use |
|---------|-------------|---------------|-------------|
| **Direct calls** | Your code | `ToolCallback.call(input)` | Deterministic actions — button clicks, scheduled jobs, anything where you already know which tool to invoke. Used by the board UI. |
| **Agent-style calls** | The LLM | `ChatClient.prompt(...).call()` with the tool callbacks attached | Free-form requests where intelligence is needed to choose, sequence, or combine tools. Used by the chat panel. |

A common production setup uses both: deterministic UI actions go through direct calls (cheap, predictable, no model call), and free-form user requests go through the agent path (flexible, but you pay one LLM round-trip per turn).

### Beyond @McpTool — Other MCP Primitives

This module focuses on `@McpTool`, but Spring AI 2.0 exposes the full MCP primitive set:

| Side | Annotation | What it does |
|------|------------|--------------|
| Server | `@McpTool` | Exposes a method as an MCP tool (this module). |
| Server | `@McpResource` | Exposes read-only data clients can fetch by URI. |
| Server | `@McpPrompt` | Exposes named prompt templates clients can request. |
| Client | `@McpSampling` | The **server** asks the **client's** LLM to generate a completion. |
| Client | `@McpElicitation` | The server asks the client to collect structured input from the user mid-tool-call. |
| Client | `@McpProgress` / `@McpLogging` | Receives progress notifications and structured log events from the server. |

`@McpSampling` and `@McpElicitation` are what make MCP genuinely different from a typed REST or RPC API — they let the **server initiate** a call back into the client's LLM or user, which has no equivalent in plain tool calling. Both require the stateful Streamable HTTP transport.

### AI Strategy with ChatClient

The AI opponent uses a priority-based strategy prompt: **win → block → center → corners → edges**. The system prompt also constrains the model to return a single digit, keeping the round-trip fast and reliable — a prompt engineering technique from [Module 02](../02-prompt-engineering/README.md).

## MCP vs Tools (Module 04)

Modules 04 and 05 both give AI applications access to tools, but in fundamentally different ways. Module 04's `@Tool` methods run **in-process** — they're Java methods in the same application. Module 05's `@McpTool` methods run on a **separate server** and are accessed over the network via MCP:

| Aspect | Module 04 (`@Tool`) | Module 05 (`@McpTool`) |
|--------|---------------------|------------------------|
| **Location** | In-process, same JVM | Separate server, different process |
| **Discovery** | Spring Boot component scan | MCP protocol auto-discovery |
| **Transport** | Direct method call | Streamable HTTP / stdio |
| **Sharing** | App-specific | Any MCP-compatible client |
| **Deployment** | Single deployment unit | Independent services |

In practice, many production systems combine both: `@Tool` for app-specific logic and `@McpTool` for shared services.

## Summary

In this module you took tool calling across service boundaries with the Model Context Protocol. You built a Tic-Tac-Toe game where an MCP server exposes game-engine and AI-move tools, and an MCP client discovers and invokes them both via direct calls and agent-style `ChatClient` calls — all over the MCP Streamable HTTP transport. The key takeaway is that MCP decouples AI logic from tool implementations, letting any MCP-compatible client reuse tools hosted as independent services. Next, you'll combine everything into agentic patterns.

## Next Steps

**Next Module:** [06-agents - Agentic Patterns](../06-agents/README.md)

---

**Navigation:** [← Previous: Module 04 - Tools](../04-tools/README.md) | [Back to Main](../README.md) | [Next: Module 06 - Agents →](../06-agents/README.md)
