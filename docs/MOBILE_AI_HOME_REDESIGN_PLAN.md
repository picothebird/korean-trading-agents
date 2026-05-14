# Mobile AI Home Redesign Plan

## Problem

The previous mobile home duplicated bottom-navigation destinations: AI analysis, chart, simulation, and trading. This made the home feel like an extra menu rather than a useful first screen.

## UX Research Takeaways

- Mobile home should prioritize the primary task, not repeat global navigation.
- Chatbot UX works best when free text and selectable shortcuts both exist.
- Users need clear context: what the bot can answer, which stock it is using, and whether prior information is retained.
- Conversations should save context between tasks so users do not repeat themselves.

## Decision

Make mobile home the stock AI conversation hub.

- Home: current-stock AI chat, recent advice threads, and stock-context picker.
- Bottom `AI` tab becomes `분석` to clarify that it runs/opens the multi-agent analysis workflow.
- Chart, simulation, trading, and portfolio remain bottom-nav destinations.

## Data Architecture

The existing `advice_chats` collection supports this design:

- `chat_id`: durable thread id
- `ticker`, `ticker_name`: stock context
- `analysis_session_id`: optional analysis result link
- `messages`: persisted user/assistant turns
- `last_response_id`: OpenAI Responses continuation id
- `position`: optional user holdings

Mobile home uses `GET /api/advice-chats?limit=12` for recent conversations and opens exact threads by `chat_id`.

## Implementation

- Generalize `AdviceChatPanel` with `initialChatId`, `reuseExisting`, and `onChatChange`.
- Mobile home uses `reuseExisting=false` for fresh chats, avoiding accidental attachment to old same-ticker conversations.
- Recent chat rows explicitly open existing threads.
- Bottom nav label changes from `AI` to `분석`.
- Keep current stock chips and small analysis/chart affordances as context actions, not duplicate home tiles.

## Validation

- Type/lint/build for changed frontend files.
- Browser check on mobile viewport: home opens as chat hub, recent conversations appear, bottom tab reads `분석`, fresh chat does not auto-load stale same-ticker thread.
