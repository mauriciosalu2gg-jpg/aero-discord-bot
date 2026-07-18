## AI Provider Isolation (Memory Engine)
- **Chat Engine vs Memory Engine**: The bot must have two completely independent AI ecosystems. The Chat Engine handles user interactions, while the Memory Engine asynchronously handles summarization and topic detection.
- **Credential Separation**: `Chat Engine` and `Memory Engine` must always use independent providers or credentials. Chat API keys (`CHAT_API_KEY`) must never be used for memory processing, and Memory API keys (`MEMORY_API_KEY`) must never handle user-facing responses. Even if both systems use the same AI provider (e.g., Groq), their rate limits and quotas must remain completely isolated using separate keys.
- **Memory Router Failover**: The Memory Engine must implement a specialized router to fall back between multiple dedicated memory keys (e.g., `MEMORY_GROQ_KEY_1` -> `MEMORY_GROQ_KEY_2` -> `MEMORY_GEMINI_KEY` -> Local Ollama) without ever touching the primary chat keys.
- **Specialized Task Models**: Assign different models to different memory tasks based on required capability (e.g., fast model for Topic Detection, reasoning model for Summarization, precise model for Profile Extraction).

## Memory Architecture
- **Semantic Boundaries**: Detect topic boundaries before compacting memory instead of relying on message counts.
- **Rich Metadata**: Store semantic summaries with keywords, entities, and importance scoring.
- **Strict Separation**: Separate collections for `User Profile` and `Conversation Memory`.
- **Intelligent Retrieval**: Retrieve only TOP 5 related memories before answering.

## Discord UI
- **Auto-Cleanup**: Status messages must auto-delete after completion to prevent cluttering the chat history.
- **Custom Emojis**: Use custom animated/static emojis whenever available for a premium feel.
- **Progressive States**: Show progressive status steps using `-# ` formatting.
