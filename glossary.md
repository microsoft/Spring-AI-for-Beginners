# Glossary

A reference of the key terms, Spring AI abstractions, and AI/ML concepts used throughout this course. Terms are grouped by the module that introduces them; concepts that reappear later are defined where they are first taught.

## Table of Contents

- [Module 01: Introduction](#module-01-introduction)
- [Module 02: Prompt Engineering](#module-02-prompt-engineering)
- [Module 03: RAG (Retrieval-Augmented Generation)](#module-03-rag-retrieval-augmented-generation)
- [Module 04: Tools](#module-04-tools)
- [Module 05: MCP (Model Context Protocol)](#module-05-mcp-model-context-protocol)
- [Module 06: Agents](#module-06-agents)
- [Cross-Cutting Terms](#cross-cutting-terms)

---

## Module 01: Introduction

- **Microsoft Foundry** — Microsoft's enterprise hosting of OpenAI models on Azure, used by modules 1–6. You configure a custom endpoint, deployment name, and API key.
- **Spring Boot Auto-configuration** — Spring Boot's mechanism for creating beans (such as `OpenAiChatModel`) automatically from `application.yaml` properties when the matching starter is on the classpath.
- **`spring-ai-starter-model-openai`** — The Spring AI starter that auto-configures the OpenAI SDK–based `ChatModel`.
- **ChatClient.Builder Bean** — The builder Spring Boot exposes for creating `ChatClient` instances that share the auto-configured model, advisors, and default options.
- **Stateless Chat** — A chat pattern where each request is independent and the model has no memory of prior turns.
- **Stateful Conversation** — A chat pattern where prior turns are stored in `ChatMemory` and replayed so the model can reason about earlier context.
- **ChatMemoryRepository** — The storage layer behind `ChatMemory`; implementations decide where conversation messages are persisted.
- **InMemoryChatMemoryRepository** — A simple `ChatMemoryRepository` implementation that keeps messages in process memory; useful for demos, but lost on restart.
- **Sliding Window Memory** — A memory strategy that keeps only the newest messages so conversation context stays useful without overflowing the model's token limit.
- **Token** — The basic unit of text the model processes; words, subwords, and punctuation are split into tokens, and models impose limits on how many tokens fit in a request.
- **Context Window** — The maximum number of tokens the model can consider in a single call (input plus output).
- **Token Usage / Metadata** — Information returned in `ChatResponse` about how many input and output tokens the call consumed; useful for cost and limit monitoring.

## Module 02: Prompt Engineering

- **Prompt Engineering** — The practice of designing model inputs (instructions, examples, structure) to produce reliable, high-quality outputs.
- **Zero-Shot Prompting** — Giving the model a direct instruction with no examples and relying on its training to perform the task.
- **Few-Shot Prompting** — Including a small number of input/output examples in the prompt so the model learns the desired pattern.
- **Chain-of-Thought (CoT) Prompting** — Asking the model to show its reasoning step by step, which improves accuracy on multi-step or arithmetic problems.
- **Role-Based Prompting** — Setting a persona (e.g., "act as a senior security auditor") to shape tone, depth, and expertise of the response.
- **Reasoning Control** — A GPT-5.2 capability that lets you tell the model how much to think before answering.
- **Low Eagerness** — A reasoning-control setting for fast, direct answers; suitable for lookups and simple calculations.
- **High Eagerness** — A reasoning-control setting for thorough, deep analysis; suitable for design and research tasks.
- **Task Execution Pattern** — A prompt pattern in which the model restates the goal, plans steps, executes them, then summarizes the result.
- **Self-Reflection Pattern** — A prompt pattern in which the model critiques and refines its own draft answer.
- **Tool Preambles** — Structured (often XML-style) prompt sections such as `<task_execution>` or `<context_gathering>` that organize the model's reasoning and behavior.
- **Structured Prompt** — A prompt organized into explicit sections (for example `<system>`, `<instructions>`, `<context>`, `<constraints>`) so the model can follow complex instructions reliably.
- **Structured Analysis Pattern** — A review prompt that evaluates output against fixed categories such as correctness, best practices, performance, security, and maintainability.
- **Constrained Output** — Prompting that requires a specific response format, length, vocabulary, or schema, such as exactly 100 words or bullet points only.
- **Streaming Response** — A response mode where generated text is delivered incrementally instead of waiting for the full answer; useful for slower reasoning prompts.
- **Server-Sent Events (SSE)** — An HTTP streaming format used by this module's endpoints (`text/event-stream`) to send model tokens or logs to the browser as they arrive.
- **Fetch Streams API** — The browser API (`response.body.getReader()`) used by the prompt-engineering UI to read streamed response chunks from the server.
- **Conversational Memory** — Using `MessageWindowChatMemory` so multi-turn prompt patterns remember earlier user and assistant messages.

## Module 03: RAG (Retrieval-Augmented Generation)

- **RAG (Retrieval-Augmented Generation)** — A pattern where relevant documents are retrieved from a knowledge base and inserted into the prompt so the model answers using your data instead of its training alone.
- **Native RAG** — A manual RAG implementation where your code searches the vector store, assembles context, builds the prompt, and calls the model step by step.
- **Advisor-based RAG** — A higher-level RAG implementation where `QuestionAnswerAdvisor` handles retrieval and context injection for a `ChatClient` call.
- **ETL Pipeline RAG** — A structured ingestion approach where documents are read, transformed into chunks, embedded, and stored before advisor-based retrieval answers questions.
- **Advisor** — A Spring AI extension point that runs before and/or after a chat call to modify the prompt or response (e.g., to inject retrieved context or apply guardrails).
- **QuestionAnswerAdvisor** — A built-in advisor that performs RAG automatically: it queries the vector store for relevant chunks and adds them to the prompt as context.
- **SearchRequest** — Spring AI's vector-search configuration object; it can include the user query, `topK`/max results, similarity threshold, and filters.
- **topK / Max Results** — The maximum number of matching chunks returned from vector search and made available to the model.
- **Similarity Threshold** — The minimum relevance score a chunk must meet before it is treated as useful context.
- **Embedding** — A numerical vector representation of text where semantically similar texts produce vectors that are close together.
- **EmbeddingModel** — A Spring AI abstraction for a model that converts text into embeddings (used for search and retrieval, not for generating text).
- **VectorStore** — A storage and search abstraction for embeddings; supports adding documents and querying for the most similar ones.
- **SimpleVectorStore** — Spring AI's in-memory `VectorStore` implementation, useful for small-to-medium datasets and demos without external infrastructure.
- **Document** — Spring AI's representation of a piece of text plus metadata (source, ID, etc.) that can be embedded and stored.
- **Chunking** — Splitting larger documents into smaller, overlapping pieces that fit in the context window and embed meaningfully.
- **TokenTextSplitter** — A Spring AI splitter that chunks text by token count, with configurable chunk size and overlap.
- **Semantic Search** — Searching by meaning rather than keywords by embedding the query and finding the nearest document vectors.
- **Cosine Similarity** — The mathematical measure (0.0–1.0) used to rank how close two embedding vectors are; the basis for relevance scores in the vector store.
- **Context Assembly** — The RAG step that combines retrieved chunks, instructions, and the user's question into the prompt sent to the chat model.
- **Source Reference** — Metadata returned with an answer that points back to the retrieved document chunk and its similarity score, helping users verify grounding.
- **Hallucination** — A model answer that sounds plausible but is unsupported or false; RAG reduces this risk by grounding answers in retrieved context.

## Module 04: Tools

- **Tool** — A Java method exposed to the LLM as a callable capability so the model can take actions, not just produce text.
- **In-process Tool** — A tool implemented in the same application and JVM as the AI code, usually by annotating a Java method with `@Tool`.
- **`@Tool` Annotation** — Marks a Java method as available to the model and supplies the natural-language description the model uses to decide when to call it.
- **`@ToolParam` Annotation** — Describes a tool's parameters (name and meaning) so the model can fill them in correctly.
- **Tool Schema** — The machine-readable name, description, parameter list, and parameter types sent to the model so it can produce valid tool calls.
- **Tool Calling / Function Calling** — The full request/response cycle in which the LLM proposes a tool and arguments, the framework executes the Java method, and the result is returned to the model to continue the conversation.
- **Tool Execution Loop** — The model → tool → model cycle Spring AI manages automatically until the model has enough tool results to return a final answer.
- **Tool Description** — The natural-language explanation of a tool (typically supplied via `@Tool`); precise descriptions are critical for the model to pick the right tool.
- **Tool Selection** — The model's decision process for matching the user's intent to the most relevant available tool and filling in the arguments.
- **ReAct (Reason + Act)** — The agent loop the model follows when using tools: reason about what's needed, act by calling a tool, observe the result, then repeat or respond.
- **Tool Chaining** — When the model autonomously calls multiple tools in sequence within a single user turn (e.g., fetch weather, then convert units).
- **Multi-Turn Orchestration** — Spring AI's automatic management of the back-and-forth between the model and tool executions across one or more turns.
- **Per-request Tools (`.tools(...)`)** — Tools attached to a single `ChatClient` prompt call, useful when each request should expose a different tool set.
- **Default Tools (`defaultTools(...)`)** — Tools attached when building a `ChatClient`, making them available on every call made through that client.
- **Tool Execution Metadata** — Application-recorded information about which tools actually ran, useful for showing "Tools run" details in a UI or audit log.
- **Stateless Agent** — An agent that handles each request independently, with no memory of prior interactions.
- **Stateful Agent** — An agent that uses `ChatMemory` to remember earlier interactions across turns.
- **Graceful Failure** — A tool error-handling style where exceptions are caught and returned as informative messages so the agent can recover and respond helpfully.

## Module 05: MCP (Model Context Protocol)

- **Model Context Protocol (MCP)** — An open, language-agnostic standard for letting AI clients discover and call tools that live in separate server processes.
- **JSON-RPC** — The structured request/response message format MCP uses for discovery, tool invocation, and other protocol operations.
- **MCP Server** — An application that exposes tools through MCP so any compatible client can use them.
- **MCP Client** — An application that connects to one or more MCP servers, discovers their tools, and invokes them (often on behalf of an LLM).
- **`@McpTool` Annotation** — Spring AI annotation that exposes a Java method as an MCP-discoverable tool on a server.
- **`@McpToolParam` Annotation** — Spring AI annotation (from `org.springframework.ai.mcp.annotation`) that describes an MCP tool's parameters so clients and LLMs can understand what to pass; the MCP equivalent of `@ToolParam`.
- **ToolCallbackProvider** — A Spring AI interface used by MCP clients to discover remote tools and present them to a `ChatClient` like local tools.
- **Tool Discovery** — The MCP step in which a client asks a server for its list of tools, including names, descriptions, and parameter schemas.
- **Tool Invocation** — The MCP step in which a client sends a structured call (tool name + arguments) to the server and receives the result.
- **Streamable HTTP** — The recommended modern MCP transport for web-deployed servers, using HTTP streaming (preferred over stdio for networked services).
- **Stateful Streamable HTTP** — A Streamable HTTP mode with a long-lived stream that supports server-to-client callbacks such as sampling, elicitation, progress, and logging.
- **Stateless Streamable HTTP** — A request/response Streamable HTTP mode where each tool call is independent, making horizontal scaling simpler when callbacks are not needed.
- **stdio Transport** — An alternative MCP transport that communicates over standard input/output, useful for locally launched server processes.
- **`spring-ai-starter-mcp-server-webmvc`** — Starter that turns a Spring MVC application into an MCP server exposing `@McpTool` methods over HTTP.
- **`spring-ai-starter-mcp-client-webflux`** — Starter that lets a Spring application act as an MCP client, connecting to remote MCP servers over HTTP.
- **Direct Tool Calls vs. LLM-Orchestrated Calls** — You can either invoke MCP tools directly from code or let the LLM choose and call them via `ChatClient`; this module shows both styles.
- **ToolContext** — A Spring AI metadata map passed along with a tool invocation; this module uses it to carry the conversation ID into MCP tool-callback decorators.
- **Board Snapshot** — A fresh assistant-memory message containing live server game state, used to keep the visual Tic-Tac-Toe board and the agent chat synchronized.
- **MCP Resource** — A read-only piece of data exposed by an MCP server and fetched by URI, separate from callable tools.
- **MCP Prompt** — A named prompt template exposed by an MCP server for clients to request and reuse.
- **MCP Sampling** — An MCP client-side primitive where the server asks the client's LLM to generate a completion during a tool workflow.
- **MCP Elicitation** — An MCP client-side primitive where the server asks the client to collect structured input from the user while a tool call is in progress.
- **MCP Progress / MCP Logging** — MCP notifications that let a server send progress updates or structured log events back to the client.
- **Service Separation** — The architectural benefit of MCP: tools live in their own services, with independent deployment, scaling, and lifecycle from the AI application.

## Module 06: Agents

- **Agentic Workflow** — A system that orchestrates multiple LLM calls — chained, parallelized, routed, delegated, or looped — to handle tasks that a single call can't solve well.
- **Single LLM Call** — The baseline pattern where one prompt produces one response with no orchestration across multiple calls.
- **Enhanced LLM** — An LLM augmented with retrieval (RAG), tools, memory, and guardrails so it becomes substantially more capable than a plain chat model.
- **Workflow vs. Agent** — A *workflow* follows a predefined orchestration of LLM calls; an *agent* dynamically decides its own next step and tool usage at runtime.
- **Chain Workflow** — A sequential pattern where each LLM call's output feeds the next (e.g., extract → standardize → sort → format).
- **Parallelization Workflow** — A pattern that runs the same or similar prompts over many inputs concurrently, or aggregates multiple parallel attempts (e.g., voting).
- **Sectioning** — A parallelization variant where a larger job is split into independent sections that can be processed concurrently.
- **Voting** — A parallelization variant where multiple independent model responses are generated and then compared or aggregated for a more reliable answer.
- **Routing Workflow** — A pattern where a classifier LLM inspects the input and dispatches it to the most appropriate specialized handler.
- **Classifier LLM** — An LLM call used primarily to choose a category, route, or handler rather than to produce the final user-facing answer.
- **Orchestrator-Workers Pattern** — A pattern where one LLM decomposes a complex task into subtasks and delegates each to worker LLMs that run independently.
- **Worker LLM** — A specialized LLM call that handles one subtask assigned by an orchestrator and returns a partial result.
- **Evaluator-Optimizer Pattern** — An iterative loop where a generator LLM produces output, an evaluator LLM grades it (e.g., PASS / NEEDS_IMPROVEMENT / FAIL), and feedback drives the next iteration.
- **Generator LLM** — The model call that drafts a candidate solution in an evaluator-optimizer loop.
- **Evaluator LLM** — The model call that grades a candidate solution against criteria and returns feedback for the next iteration.
- **Autonomous Agent** — An LLM system that chooses its own actions and tools dynamically rather than following a fixed code path.
- **Quality Criteria** — Explicit rules an evaluator uses to decide whether a generated answer is acceptable or needs another iteration.
- **Max Iterations** — A cap on refinement loops that prevents evaluator-optimizer workflows from running indefinitely.
- **Native Structured Output** — Spring AI's ability to ask the model for output that can be parsed directly into a Java record or class, enabled in this module with `AdvisorParams.ENABLE_NATIVE_STRUCTURED_OUTPUT`.
- **Advisor Log Stream** — The Module 06 UI stream that sends `MyLoggingAdvisor` request/response logs to the browser through `SseEmitter`.
- **Latency vs. Accuracy Trade-off** — Simple workflows are faster but less thorough; multi-step agentic workflows are slower but typically produce higher-quality results.
- **`MyLoggingAdvisor`** — The custom Spring AI advisor used in this module to log every LLM request/response (system prompt, user input, available tools, generated output) so you can see exactly what each step in a workflow sends to the model.

## Cross-Cutting Terms

These terms appear in multiple modules and are worth knowing throughout the course.

- **LLM (Large Language Model)** — A neural network trained on large amounts of text that can generate and reason about natural language.
- **Provider** — The service that hosts the LLM (Microsoft Foundry, OpenAI, etc.); Spring AI lets you switch providers without changing application code.
- **gpt-5.2** — A Microsoft Foundry reasoning model with adjustable thinking effort. Used by Module 02 only, to demonstrate prompt engineering with reasoning controls.
- **gpt-4o-mini** — A fast, low-latency non-reasoning model. Used by Modules 01, 03, 04, 05, and 06 to keep demos responsive while focusing on Spring AI patterns rather than model latency.
- **text-embedding-3-small** — A Microsoft Foundry embedding model that converts text into 1,536-dimensional vectors. Used by Module 03 only, to power the RAG pipeline's vector store and semantic search.
- **azd (Azure Developer CLI)** — The command-line tool that provisions the Microsoft Foundry resource and model deployments for modules 1–6 (`azd up`); see [01-introduction/infra/README.md](01-introduction/infra/README.md).
- **Bicep** — Azure's infrastructure-as-code language used by Module 01 to define the Microsoft Foundry resource and model deployments.
- **Azure CLI** — The `az` command-line tool used for Azure account, resource, and Bicep operations alongside `azd`.
- **Dev Container / Codespaces** — The pre-configured development environment for this course (Java 25, Maven 3.9+, Copilot) that you can launch as a GitHub Codespace. Spring AI itself runs on Java 17+, but this repo targets Java 25 because it builds on Spring Boot 4.
- **Maven** — The Java build tool used to compile and run every example (`mvn compile exec:java -Dexec.mainClass=...`).
- **Spring AI BOM** — The Maven bill of materials (`spring-ai-bom`) that pins Spring AI dependency versions consistently across all modules.
- **Spring Milestones Repository** — A Maven repository (`repo.spring.io/milestone`) that hosts pre-release Spring AI versions (milestones and release candidates). This course now uses the Spring AI `2.0.0` GA release from Maven Central, so this repository is no longer required.
- **`application.yaml`** — The Spring Boot configuration file used by modules 1–6 to wire up Microsoft Foundry credentials, model names, and other settings.
- **`microsoft-deployment-name`** — The `spring.ai.openai` property that tells the OpenAI SDK to route requests to a named Azure deployment (instead of the OpenAI public model name).
- **TPM (Tokens per Minute)** — An Azure model-deployment quota/capacity unit that limits how many tokens your deployment can process per minute.
- **Environment variables** — The shared `.env` file at the repo root provides credentials to every module:
  - `AZURE_OPENAI_ENDPOINT` — Microsoft Foundry resource URL.
  - `AZURE_OPENAI_API_KEY` — Foundry API key.
  - `AZURE_OPENAI_DEPLOYMENT` — reasoning chat deployment name (`gpt-5.2`), used by Module 02.
  - `AZURE_OPENAI_FAST_DEPLOYMENT` — fast chat deployment name (`gpt-4o-mini`), used by Modules 01, 03, 04, 05, 06.
  - `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` — embedding deployment name (`text-embedding-3-small`), used by Module 03.
