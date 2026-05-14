# KTA Mobile UX Rebuild

## Goal

Mobile KTA must not be a squeezed desktop split view. It should behave like a focused investing app: one stock context, one primary action, clear drill-down paths, and bottom navigation that can be used with one thumb.

## Benchmarked Product Patterns

This direction follows common patterns from high-quality Korean finance apps such as Toss Securities and large banking/investing super-apps.

- The first screen is a quote surface, not a dashboard collage.
- The selected instrument remains visible while the user moves between quote, chart, AI analysis, simulation, trading, and portfolio flows.
- Mobile navigation uses a bottom tab bar for primary destinations. Secondary actions live as chips or cards in the home surface.
- The first viewport carries only decision-grade information: name, ticker, price, change, market state, volume, one momentum signal, and one trend signal.
- Charts are previewed on home, but expanded in their own destination.
- AI or strategy outputs are progressive: status first, result card second, long logs and meeting rooms below.
- Trading actions are separated from analysis and simulation to avoid accidental order intent.
- Touch targets should be at least 44px high, with 8-12px spacing around dense controls.

## Mobile Information Architecture

### Persistent Context

The sticky mobile header owns the active stock context:

- Brand and current user
- Market status
- Settings entry
- Search input
- Selected company and ticker
- Current price
- Daily percentage change
- Volume
- RSI
- MA20 trend proxy

This header replaces the desktop left/right split. It makes every destination feel connected to the same selected stock.

### Bottom Navigation

The bottom navigation has six compact destinations:

- Home: snapshot, watchlist, preview chart, recent AI judgement
- Chart: dedicated chart surface
- AI: run analysis, status, decision, meeting room
- Simulation: configure and run backtests
- Trading: KIS order and auto loop
- Portfolio: portfolio loop

The labels are intentionally short so they fit on 320-430px screens without truncation.

### Home Screen

Home is a command center, not a report page.

Visible content order:

1. Selected stock quote in the sticky header
2. Four large action tiles: AI analysis, chart, simulation, trading
3. Chart preview
4. Watchlist/recent/popular chips
5. Recent AI judgement

The home screen should answer: what am I looking at, what changed, and what should I do next?

### Chart Screen

The chart screen uses the existing full chart component but gives it its own destination. This avoids forcing users to inspect dense chart controls inside a half-height split panel.

### AI Screen

The AI screen prioritizes action and status:

- Sticky run/cancel control
- Pipeline progress
- Error state
- Decision result if available
- Empty state if no result
- Agent meeting room below the decision layer

### Simulation Screen

Simulation is reduced to the minimum viable mobile setup:

- Strategy selector
- Start/end date
- Initial capital
- Decision interval
- Run button
- Loading/result/error states

The advanced desktop-style explanation remains available through the result panel and tooltips, but the entry path is short.

### Trading and Portfolio Screens

Trading and portfolio reuse the existing functional panels because those contain broker/account-specific workflows. The mobile shell gives them a proper single-column destination instead of squeezing them into a 44vh lower pane.

## Visual Rules

- No desktop split on mobile.
- Use sticky quote context and bottom navigation.
- Keep primary touch targets 44-52px high.
- Avoid nested decorative cards. Cards are for actionable clusters or repeated records.
- Use restrained density: three quote metrics in the header, four action tiles on home.
- Full chart/AI/trading flows live in separate destinations.
- Do not place explanatory instruction text above the primary task.

## Implementation Notes

- `frontend/src/app/page.tsx` now keeps the desktop layout for larger screens.
- At `max-width: 760px`, it renders a dedicated mobile shell with `MobileView` navigation.
- The mobile shell reuses production data and existing panels rather than creating mock-only UI.
- The selected stock, user settings, AI state, backtest state, and trading state remain shared with the desktop app.