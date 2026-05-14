# AI Advice Chat Development Plan

## Product Goal

KTA should evolve from a static AI report into a continuing investment consultation flow. After a user selects a stock and runs an analysis, they should be able to optionally enter their own average purchase price and share count, then freely ask follow-up questions in chat. The assistant should answer using the same selected stock, the latest AI analysis decision, current market snapshot, and the user's personal position context.

This feature is not an order execution surface and must not promise returns. It is a contextual decision-support experience.

## Target User Flow

1. User selects a ticker.
2. User runs the existing multi-agent analysis.
3. Result panel shows the decision, confidence, risk, entry/exit reasoning, and a new consultation entry point.
4. User optionally enters:
   - average purchase price
   - share quantity
5. User starts an advice chat connected to the current analysis session.
6. Chat answers can reference:
   - selected ticker and company name
   - latest stock/technical data
   - final AI decision and agent summaries
   - user position, estimated cost basis, current P/L when price is available
   - prior messages in the same chat
7. User can continue asking situational questions such as:
   - 지금 평단 기준으로 손절/분할매도 기준을 어떻게 잡아야 해?
   - 추가매수해도 될까?
   - 이 종목을 계속 들고 갈 때 가장 먼저 봐야 할 리스크는 뭐야?

## UX Principles

- The consultation should feel like the next step after analysis, not a separate feature.
- Position input is optional and lightweight. A user without holdings should still be able to ask questions.
- Answers should be conversational, concrete, and scenario-based.
- The UI should keep the selected stock and latest AI recommendation visible.
- The assistant should explicitly distinguish analysis-based insight from financial advice.
- Trading/order actions remain in the trading tab. Advice chat can suggest considerations but should not place orders.

## Information Architecture

### Desktop

- Add an advice card directly below the analysis result summary.
- The card contains compact position inputs and a chat thread.
- A primary button starts or continues a chat for the currently loaded analysis result.
- Existing result actions remain available: trading, backtest, auto loop, settings.

### Mobile

- The AI tab remains the natural home for advice after analysis.
- The chat panel appears below the decision/result block.
- Inputs use large touch targets and avoid nested dense panels.
- The bottom tab bar remains unchanged; advice is a deeper layer of AI analysis, not a new top-level tab.

## Backend Architecture

### New Collection: `advice_chats`

Each document represents one user-owned conversation.

Fields:

- `chat_id`: public UUID string
- `owner_user_id`: ObjectId
- `ticker`: normalized six-digit ticker
- `ticker_name`: optional display name
- `analysis_session_id`: optional runtime analysis session id
- `position`: optional average price and quantity
- `context`: snapshot captured at chat creation
- `messages`: embedded chat turns, capped in responses
- `created_at`, `updated_at`, `last_message_at`
- `message_count`

Indexes:

- unique `chat_id`
- owner recency: `(owner_user_id, updated_at desc)`
- owner/ticker recency: `(owner_user_id, ticker, updated_at desc)`
- optional TTL by `purge_after` for future retention policy

### API Endpoints

- `POST /api/advice-chats`
  - Creates a chat from ticker, optional analysis session, optional position.
  - Verifies analysis session ownership when provided.
  - Captures stock and analysis context.

- `GET /api/advice-chats`
  - Lists recent chats for the current user, optionally filtered by ticker.

- `GET /api/advice-chats/{chat_id}`
  - Returns full chat detail if owned by user.

- `POST /api/advice-chats/{chat_id}/messages`
  - Appends a user question, builds a grounded prompt, calls the configured LLM, appends the assistant answer, and returns the updated chat.
  - Optionally updates position before answering.

### Prompt Contract

The assistant receives:

- role and safety instructions
- current stock snapshot
- latest analysis decision and risk summary
- user's optional position
- recent chat history
- current user question

The response should:

- answer in Korean
- be practical and personalized to the user's situation
- use scenario framing and risk boundaries
- avoid guaranteed returns or definitive buy/sell orders
- ask for missing information when necessary

## Frontend Architecture

### API Client

Add typed functions:

- `createAdviceChat`
- `listAdviceChats`
- `getAdviceChat`
- `sendAdviceChatMessage`

### Types

Add:

- `AdvicePosition`
- `AdviceChatMessage`
- `AdviceChat`

### UI Components

Add `AdviceChatPanel`:

- position inputs
- chat bootstrap state
- message list
- freeform question input
- loading/error states
- contextual chips for starter questions

Props:

- `ticker`
- `tickerName`
- `analysisSessionId`
- `decision`
- optional `compact`

### Integration Points

- Analysis result panel receives `analysisSessionId` and renders `AdviceChatPanel` after the conclusion/action block.
- Mobile AI view reuses the same result path, so no duplicate mobile-only implementation is required.

## Data and Privacy

- Chats are scoped by authenticated user.
- The server checks ownership for both chat and analysis session.
- Position data is optional and stored only in the user's chat document.
- No chat endpoint is public.

## Validation Plan

1. Backend imports and type checks through `python -m py_compile backend/main.py backend/core/mongodb.py`.
2. API smoke test with authenticated local session:
   - create advice chat
   - send message
   - list chats
3. Frontend lint for modified files.
4. Production build.
5. Browser validation:
   - run or open an analysis result
   - input position
   - send a question
   - verify assistant response appears
   - verify mobile AI tab remains usable

## Future Enhancements

- SSE streaming assistant tokens.
- Suggested follow-up questions derived from the actual answer.
- Chat history drawer per ticker.
- Import holdings from KIS balance when available.
- Structured recommendations for stop-loss, partial sell, and rebalancing ranges.
- Human-readable audit trail explaining which analysis session and market snapshot grounded the answer.
