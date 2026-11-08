# Moneta roadmap

A month of features, one built each night by a scheduled Claude Code agent (see
[How the nightly build works](#how-the-nightly-build-works)). Each item lands as its own pull request
and is merged and deployed automatically once every check passes.

Last updated: 2026-11-06.

## Why these features

Research summary (November 2026):

- **Forecasting is now the premium feature.** Origin's Forecast tab projects net worth to a chosen life
  expectancy from income, retirement age and expenses, layers in life events (home purchase, children,
  college, windfalls, custom income/expenses), and reports a success rate from thousands of simulations
  plus a cash-flow timeline. Monarch put forecasting behind its $299/yr Plus tier (April 2026): it uses
  12-month averages of income and spending, adjustable growth rates (savings 3%, investments 7%, real
  estate 3%, vehicles −15%, inflation 3%), life events, debt paydown and a withdrawal order. Monarch's
  is directional only (no probabilities), and dedicated side-by-side scenarios are still "coming".
- **Investment depth is where budgeting apps fall short.** Monarch users say insight into net worth,
  assets and reporting is missing. Empower is still the reference for investments: allocation vs. a
  target with rebalancing hints, holdings by type, and a retirement planner with what-if scenarios.
- **Common gaps across apps:** cash-flow forecasting ("will checking run low before payday?"),
  forward-looking simulations on real data, reliable goals, and reporting.
- **Table stakes Moneta still lacks:** budgets, goals, cash-flow (Sankey) report, split transactions,
  tags, CSV import/export, alerts.

Sources: [Origin forecasting](https://useorigin.com/products/forecasting),
[Origin forecasting guide](https://useorigin.com/resources/blog/planning-your-future-with-origin-a-guide-to-our-forecasting-tool),
[Monarch forecasting](https://www.monarch.com/blog/forecasting),
[Monarch Plus review](https://personal-finance-tools.pages.dev/reviews/monarch-plus-review-299-per-year-worth-it-2026/),
[Empower tools review](https://www.roboadvisorpros.com/a-review-of-empowers-free-tools/),
[Origin: where net worth apps fall short](https://useorigin.com/resources/blog/where-most-net-worth-tracking-apps-fall-short-how-origin-is-different),
[Copilot vs Monarch](https://useorigin.com/resources/blog/copilot-vs-monarch-which-is-better-for-your-financial-life).

## Schedule

One item per night, in this order. The date is the morning it should be live. ✅ = done.

| # | ID | Ships | Feature | Depends on |
|---|----|-------|---------|------------|
| 1 | F1 | ✅ Nov 6 | Net worth forecast: projection, assumptions, Forecast tab | — |
| 2 | I1 | ✅ Nov 6 | Investments: value-over-time chart and filters | — |
| 3 | F2 | ✅ Nov 6 | Forecast: life events | F1 |
| 4 | I2 | ✅ Nov 7 | Investments: activity, dividends, contributions vs. growth | I1 |
| 5 | F3 | ✅ Nov 8 | Forecast: simulations, success rate, range bands | F2 |
| 6 | F4 | Nov 10 | Forecast: saved scenarios and side-by-side compare | F3 |
| 7 | B1 | Nov 11 | Budgets | — |
| 8 | B2 | Nov 12 | Goals (feed the forecast) | B1, F1 |
| 9 | I3 | Nov 13 | Target allocation and rebalancing check | I1 |
| 10 | C1 | Nov 14 | Cash-flow report (Sankey) | — |
| 11 | C2 | Nov 15 | Safe to spend: 30-day checking forecast | — |
| 12 | Q1 | Nov 16 | Quality night: tests, bug sweep, fix failed nights | — |
| 13 | C3 | Nov 17 | Trends and reports | — |
| 14 | T1 | Nov 18 | Split transactions | — |
| 15 | T2 | Nov 19 | Tags | — |
| 16 | T3 | Nov 20 | CSV export and import | — |
| 17 | A1 | Nov 21 | In-app alerts | — |
| 18 | A2 | Nov 22 | Weekly email digest (off until a key is set) | A1 |
| 19 | AI1 | Nov 23 | AI: proactive insights and forecast-aware answers | F1 |
| 20 | S1 | Nov 24 | Face ID / passkey sign-in | — |
| 21 | U1 | Nov 25 | Undo everywhere and "how is this calculated" | — |
| 22 | P1 | Nov 26 | Installable app: offline view, pull to refresh | — |
| 23 | I4 | Nov 27 | Equity compensation (RSU/option vesting) | — |
| 24 | C4 | Nov 28 | Credit card insights: interest, fees, utilization trend | — |
| 25 | C5 | Nov 29 | Subscription audit: yearly cost, unused, cancel reminders | — |
| 26 | Q2 | Nov 30 | Quality night 2 | — |
| 27 | C6 | Dec 1 | Year in review | — |
| 28 | X1 | Dec 2 | Tax-time summary | — |
| 29 | Q3 | Dec 3 | Accessibility and performance pass | — |
| 30 | Q4 | Dec 4 | Final quality night and README refresh | — |

### Not scheduled (and why)

- **Loan and card details (APR, due dates, payoff plans):** needs Plaid's paid Liabilities product.
- **Fund fee analyzer (expense ratios):** Plaid doesn't return expense ratios; needs a data source.
- **Performance vs. the S&P 500:** needs a market data source; revisit after I2.
- **Automatic home values (Zillow-style):** no free API; manual assets cover it for now.
- **Partner/household sharing:** needs multi-user sign-in, a bigger change to auth than a night allows.

## Feature specs

Every item must work in demo mode (`npm run demo`, `src/lib/demoData.ts`) with realistic made-up data,
so it can be reviewed without real accounts.

### F1 · Net worth forecast

The headline feature, modeled on Origin's Forecast tab.

- New **Forecast** tab (desktop sidebar and mobile bottom bar; the bar may need a "More" overflow or
  icon-only labels to fit 6 tabs on a 375px phone).
- **Your plan** inputs, saved in `app_settings` (key `forecast_plan`), editable in a sheet:
  current age (or birth year), retirement age (default 65), plan-to age (default 90), annual take-home
  income and annual spending (defaults: last 12 complete months from transactions, using the same
  spending/income rules as the Spending tab; say so in the UI), income growth (default 3%), and the
  share of yearly surplus that's saved (default 100%).
- **Growth assumptions** (editable, Monarch-like defaults): cash 3%, investments 7%, real estate 3%,
  vehicles −15%, other assets 0%, inflation 3%. Manual assets use their own `annual_rate` when set.
- **Projection engine** in `src/lib/forecast.ts` (pure functions, no React): yearly steps from today to
  plan-to age. Before retirement: income − spending is added to savings (cash vs. investments split by
  today's mix). After retirement: income stops (Social Security comes in F2), spending is withdrawn from
  cash, then investments. Debts shrink at today's trend (from balance history) or stay flat.
  Show values in today's dollars by default with a toggle for future dollars.
- **Chart**: projected net worth by year (area chart matching `NetWorthChart.tsx`), a marker at
  retirement, a tooltip with the age, year and the breakdown. Headline: "At 65 you'd have ~$X" and
  "Money lasts to age N" (or "past 90").
- **Overview card**: a small "Forecast" teaser linking to the tab.
- **AI**: add a short forecast summary to `src/lib/financialContext.ts`.
- **Tests**: `npm test` runs Node's built-in test runner on `src/**/*.test.ts` (no extra dependency;
  import local files with the `.ts` extension). `src/lib/forecast.test.ts` is the example to follow.

### I1 · Investments: value over time and filters

The investments tab gets a chart like net worth, and everything on the tab becomes filterable.

- **History**: add a `holding_snapshots` table (date, account_id, security_id, ticker, name, type,
  quantity, price, value; primary key date+account_id+security_id), written whenever holdings are
  fetched (same pattern as `snapshotBalances` in `transactionStore.ts`). Until it has history, the
  chart falls back to per-account investment balances already in `account_balances`.
- **Chart**: investment value over time with 1M / 3M / 1Y / All (reuse `NetWorthChart` styling), change
  for the range in $ and %.
- **Filters** in one row above the chart, applying to the chart, totals, allocation and the holdings
  list together: account (multi-select), institution, asset type (stocks, ETFs, funds, bonds, cash,
  crypto…), and account kind (taxable / retirement, from the Plaid subtype: 401k, ira, roth, hsa… vs.
  brokerage). Show active filters as removable chips; remember them per device.
- Tapping a holding opens a detail sheet: value over time for that security (from snapshots),
  quantity, price, cost basis, gain, and which accounts hold it.
- Demo mode: generate a year of holding snapshots so the chart and filters are populated.

### F2 · Forecast: life events

- Event types: retire (moves the retirement age), buy a home (price, down payment from cash, mortgage
  as a loan that amortizes, home as property growing at the real estate rate), have a child (yearly
  cost until 18), college (yearly cost for N years), windfall (one-time income), Social Security
  (start age, monthly amount), career break (income pauses), and custom one-time or recurring
  income/expense.
- Events listed on the Forecast tab, editable and toggleable; shown as markers on the chart.
- Saved inside the forecast plan. Unit tests for each event type.

### I2 · Investments: activity, dividends, contributions vs. growth

- Sync Plaid investment transactions (`investmentsTransactionsGet`, 24 months) into a new
  `investment_transactions` table, on the same staleness schedule as bank transactions.
- Activity list on the Investments tab (buys, sells, dividends, contributions, fees), filtered by the
  I1 filters.
- Dividend income: last 12 months, by month and by holding.
- For the selected range: "Contributions $X, market growth $Y" using investment transactions (better
  than the transfer-based estimate in `src/lib/insights.ts`; update that to use these when available).
- Handle banks without the product quietly (same pattern as holdings).

### F3 · Forecast: simulations and success rate

- Monte Carlo: 1,000 runs with yearly investment returns drawn from a normal distribution (mean = the
  investment growth assumption, standard deviation default 15%, editable) and inflation noise.
  Run in a Web Worker or chunked so the UI never freezes.
- **Success rate**: share of runs where money lasts to the plan-to age, with plain-language bands
  (e.g. 80%+ "on track", 60–80% "worth a look", below 60% "at risk").
- Chart shows 10th–90th percentile band around the median line.
- Seeded random generator so results are stable between renders. Unit tests.

### F4 · Forecast: scenarios

- Save named scenarios ("Retire at 55", "Buy a home in 2028") as copies of the plan with changes.
- Compare up to 3 scenarios on one chart, with success rate and age money lasts to for each.
- A "what if" quick slider (retirement age, monthly savings) that previews without saving.

### B1 · Budgets

- Monthly limit per category (and an "Everything else" total), set from a suggested amount (median of
  the last 3 months).
- Progress bars with pace ("$120 left for 9 days"), on a Budget view under Spending and a compact card
  on the Overview. Over-budget categories highlighted with text, not color alone.
- Optional rollover of unspent amounts. Stored in a `budgets` table. Transfers follow the user's rules.

### B2 · Goals

- Save toward a target by a date (emergency fund, down payment, trip), optionally linked to accounts
  whose balances count toward it; or pay down a debt.
- Progress, required monthly amount, on-track status.
- Goals feed the forecast as planned contributions/expenses.

### I3 · Target allocation and rebalancing

- Set a target mix (stocks / bonds / cash / other, or a preset like 80/20).
- Show current vs. target, drift, and the dollar moves to rebalance, respecting I1 filters.
- No buy/sell advice for specific securities; describe the gap only.

### C1 · Cash-flow report

- Sankey diagram for a month or year: income sources → spending categories, savings and transfers.
- Tap a flow to see its transactions (reuse `DrillSheet`). Monthly income vs. spending bars for 12 months.

### C2 · Safe to spend

- Project checking/cash balances for the next 30 days from today's balance, detected recurring bills
  and paychecks (`src/lib/recurring.ts`) and average daily discretionary spending.
- "Safe to spend until payday: $X" on the Overview; warn if the projection dips below a user-set floor.

### C3 · Trends and reports

- Category trends over 12 months (small multiples or a selectable line), merchant leaderboards,
  income vs. spending by month, and savings rate trend. Custom date range picker.

### T1 · Split transactions

- Split one transaction into several categories/amounts (e.g. a Costco run). Splits are stored
  separately and replace the parent in totals. Undo restores the original.

### T2 · Tags

- Free-form tags on transactions (e.g. "Vacation 2026", "Reimbursable"), filter by tag, totals by tag.
  Rules can add tags.

### T3 · CSV export and import

- Export transactions (current filters) and net worth history to CSV.
- Import a CSV (e.g. Mint or Monarch export) with column mapping and duplicate detection; imported
  rows are marked as such and never sent to Plaid.

### A1 · In-app alerts

- Alerts center (bell icon) for: large transaction (threshold setting), low balance, bill due soon,
  subscription price increase, new recurring charge, bank needs reconnecting, over budget (if B1).
- Generated during sync (including the daily cron), stored in an `alerts` table, mark as read.

### A2 · Weekly email digest

- Weekly summary email (spending vs. usual, upcoming bills, net worth change, alerts) sent by the
  existing cron route via Resend. Off until `RESEND_API_KEY` and `DIGEST_EMAIL` are set; document
  both in the README. Never sends anything in demo mode.

### AI1 · Proactive AI insights

- A weekly "insights" card generated by the AI provider already used in `src/app/api/chat/route.ts`,
  cached in the database; respects the user's AI key settings and works without AI (hidden).
- Add forecast, budgets and goals to the AI context.

### S1 · Face ID / passkey sign-in

- WebAuthn passkeys as an option after signing in with the password once; the password stays as a
  fallback. Single user only. Do not weaken the existing session checks in `src/proxy.ts`.

### U1 · Undo and explanations

- Undo toasts for rule creation/deletion, recategorizing via rules, disconnecting is excluded (it
  confirms instead). "How is this calculated?" popovers on Net, pace, savings rate, gain/loss,
  What changed, and forecast numbers.

### P1 · Installable app

- Web app manifest and service worker: last loaded data viewable offline (read-only, with a clear
  "offline" note), pull to refresh on phones, and an "Add to Home Screen" hint on iOS.

### I4 · Equity compensation

- Manually add RSU/option grants (shares, vesting schedule, strike); unvested value shown separately
  from net worth, vested value counted; upcoming vests on the Overview.

### C4 · Credit card insights

- Interest charged and card fees found in transactions, utilization trend per card from balance
  history, and statement-day hints.

### C5 · Subscription audit

- Yearly cost of each subscription, total, ones not used recently (no related activity), and
  reminders before annual renewals.

### C6 · Year in review

- A shareable-looking (but private) annual recap: income, spending, savings rate, net worth change and
  what drove it, top categories and merchants, biggest months. Builds on the monthly recap.

### X1 · Tax-time summary

- Yearly totals useful for taxes: income by source, interest and dividends (I2), charitable giving,
  medical, and investment activity, exportable to CSV. Clearly labeled as a summary, not tax advice.

### Q1–Q4 · Quality nights

- Run the full checks, fix failing tests or builds from earlier nights, rebuild any item whose pull
  request was closed or failed, add missing unit tests for `src/lib/*`, and fix bugs found by
  clicking through demo mode. Q3 also checks keyboard navigation, focus states, color contrast in
  both themes, and bundle size. Q4 refreshes the README feature list and screenshots notes.

## How the nightly build works

A Claude Code routine runs at 2:00 AM Eastern each night until December 5, 2026. Each run:

1. Reads this file. Items marked ✅ are done. It also skips any item that already has a branch named
   `roadmap/<id>-…` on GitHub, and picks the first remaining item in the schedule table.
2. Builds it on a new `roadmap/<id>-…` branch from `main`, including demo data, and runs `npm ci`,
   `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`, fixing problems until they pass,
   then checks the feature in demo mode.
3. Marks the item ✅ in this table, opens a pull request titled `Roadmap <ID>: <feature>`, and **merges it
   into `main`** (which deploys to production) only if every check passed.
4. If the checks can't be made to pass, it opens the pull request as a draft marked "needs attention"
   and does not merge. A quality night retries it.

Rules for the agent: one item per night; never force-push or rewrite `main`'s history; never change
deployment settings or secrets; database changes must be additive and idempotent in `ensureSchema()`
(`src/lib/db.ts`); no new paid services or required environment variables (optional ones must default to
off); keep demo mode working; follow the code style of the surrounding files.

To review: every merged pull request stays on GitHub with its description, and `npm run demo` shows each
feature with made-up data. To undo a feature, revert its pull request on GitHub.
