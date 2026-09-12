# ThesisLine — Convex All Gas

## Product

Indian equity research starts with a question: has guidance changed, are new contracts improving margins, or is a business segment growing? ThesisLine keeps that question beside official disclosures and a versioned evidence history.

The first release covers Infosys and ITC. Users create a private account, ask a company-specific question, inspect exact quotations and saved source text, then choose whether to enable daily checks and verified email alerts.

## Links

- App: https://resolute-akita-616.convex.site/
- Repository: https://github.com/himanshu748/thesisline
- Video: being recorded from the deployed product; add the public playback link after visibility is verified.
- Submission: not yet submitted as of this build record.

## Built for this event

Work began September 12, 2026, after the owner selected Indian stock research and event tracking. A statement-reconciliation concept was rejected before implementation. The product uses a new Convex project and application code, with standard dependencies and existing authorized provider accounts. It does not reuse the data of the other entries.

## Sponsor implementation

Convex handles Password Auth, account-owned queries/mutations, live evidence subscriptions, immutable snapshots, scheduled checks and recovery. Agent, Rate Limiter and Static Hosting are meaningful installed components. The public app is served from its dedicated `.convex.site` deployment.

Firecrawl captures selected official disclosures. A Convex Agent uses OpenAI GPT-4.1 through Vercel AI Gateway to read those sources against the question. Literal quotations and dates are validated before evidence is persisted. AgentMail sends account verification and user-selected new-evidence alerts through a durable outbox with idempotent retries.

## September 12 verification

- 62 deterministic tests and full TypeScript checks passed.
- Real authenticated Firecrawl → OpenAI → saved-evidence flow passed on Infosys.
- A real verification code and one opted-in research alert were received by the owned test inbox.
- An unchanged recheck added no event or extra email.
- Desktop/mobile browser checks passed for the public example and authenticated source/reload/control workflow.
- Public launch, recording, repository push and submission receipt are tracked separately; see subsequent entries below.

## Judging fit and remaining evidence

| Official criterion | Implementation and current evidence |
| --- | --- |
| Everyday consumer use | A private research notebook for Indian equity researchers, with a usable self-service account flow. |
| Creativity and usefulness | Tracks a specific question through inspectable source versions rather than presenting an undifferentiated news feed. Initial two-company coverage is narrow. |
| Convex implementation | Auth, live state, indexed ownership queries, transactional writes, scheduled checks and three components. |
| Sponsor use | Actual Firecrawl, OpenAI and AgentMail calls verified; no badge-only integrations. |
| Public deployment | Dedicated `.convex.site` app; no invitation or allowlist is required to create an account. |
| Social proof | Launch copy will be prepared locally after deployment. Engagement and independent user feedback are not yet established. |
| Product video | A real-product walkthrough under three minutes is being recorded. Visibility must be verified before submission. |

The official event page lists seven criteria, not eight or nine: https://www.convex.dev/hackathons/all-gas . The event remains open through September 22, 2026 at noon Pacific; rules were checked September 12.

## Scope and honesty

The public Northstar walkthrough is fictional and labelled. Real workspaces read actual company sources. There is no price feed, option chain, execution, broker access or buy/sell recommendation. No claim of complete source coverage, profitable trades, independent adoption or a hackathon win is made. See EVIDENCE.md for specific limits.

Marketing drafts, social scripts, storyboards, raw recordings and operational logs are local-only and ignored by Git.
