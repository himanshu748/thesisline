# ThesisLine — Convex All Gas

## Product

Indian equity research starts with a question: has guidance changed, are new contracts improving margins, or is a business segment growing? ThesisLine keeps that question beside official disclosures and a versioned evidence history.

The first release covers Infosys and ITC. Users create a private account, ask a company-specific question, inspect exact quotations and saved source text, then choose whether to enable daily checks and verified email alerts.

## Links

- App: [public deployment](https://resolute-akita-616.convex.site/).
- Repository: [public source](https://github.com/himanshu748/thesisline), release commit [`6eac7a7`](https://github.com/himanshu748/thesisline/commit/6eac7a7).
- CI: [GitHub Actions run 34685625584](https://github.com/himanshu748/thesisline/actions/runs/34685625584) passed.
- Video: [public captioned walkthrough, 1:37](https://drive.google.com/file/d/1dUeHLHe0Lagy2sREmg5PRBxu3pppB1tw/view), with anonymous playback verified.
- Submission: [ThesisLine on Vibe Apps](https://vibeapps.dev/s/thesisline), submitted through the All Gas form on September 12, 2026.
- Launch: [captioned native video post on X](https://x.com/jhahimanshu653/status/2098724377948995701).

## Built for this event

Development began September 12, 2026. ThesisLine uses a new Convex project and application code, standard dependencies and existing authorized provider accounts. Research accounts, questions and source history are stored in its dedicated deployment.

## Sponsor implementation

Convex handles Password Auth, account-owned queries/mutations, live evidence subscriptions, immutable snapshots, scheduled checks and interrupted-check recovery. Agent, Rate Limiter and Static Hosting are installed components. The public app is served from its dedicated `.convex.site` deployment.

Firecrawl captures selected official disclosures. A Convex Agent uses OpenAI GPT-4.1 through Vercel AI Gateway to read those sources against the question. Literal quotations and dates are validated before evidence is persisted. AgentMail sends account verification and user-selected new-evidence alerts through a durable outbox with idempotent retries.

## September 12 verification

- 62 deterministic tests and full TypeScript checks passed.
- Real authenticated Firecrawl → OpenAI → saved-evidence flow passed on Infosys.
- A real verification code and one opted-in research alert were received by the owned test inbox.
- An unchanged recheck added no event or extra email.
- Desktop/mobile browser checks passed for the public example and authenticated source/reload/control workflow.
- The public app is deployed and release commit `6eac7a7` is pushed to the public repository. GitHub Actions run `34685625584` succeeded.
- A 1:37 captioned walkthrough of the deployed app played in a fresh unauthenticated browser. Deepgram Aura 2 Thalia supplied synthetic video narration; it is not part of the app's research pipeline.
- The public Vibe Apps entry shows Himanshu Kumar and the AllGasHackathonSubmission tag. The private judging dashboard was not accessible; this verifies the public submission record, not a judging result.

## Judging fit and remaining evidence

| Official criterion | Implementation and current evidence |
| --- | --- |
| Everyday consumer use | A private research notebook for Indian equity researchers, with a usable self-service account flow. |
| Creativity and usefulness | Tracks a specific research question through inspectable source versions. Initial two-company coverage is narrow. |
| Convex implementation | Auth, live state, indexed ownership queries, transactional writes, scheduled checks and three components. |
| Sponsor use | Actual Firecrawl, OpenAI and AgentMail calls verified. |
| Public deployment | Dedicated `.convex.site` app; no invitation or allowlist is required to create an account. |
| Social proof | The [X launch post](https://x.com/jhahimanshu653/status/2098724377948995701) includes a native captioned walkthrough and working app/repository links. Independent user feedback is not yet established. |
| Product video | Public captioned 1:37 walkthrough of the deployed app, with anonymous playback verified. |

The official event page lists seven criteria, not eight or nine: https://www.convex.dev/hackathons/all-gas . The event remains open through September 22, 2026 at noon Pacific; rules were checked September 12.

## Scope and honesty

The public Northstar walkthrough is fictional and labelled. Real workspaces read actual company sources. There is no price feed, option chain, execution, broker access or buy/sell recommendation. No claim of complete source coverage, profitable trades, independent adoption or a hackathon win is made. See EVIDENCE.md for specific limits.

Marketing drafts, social scripts, storyboards, raw recordings and operational logs are local-only and ignored by Git.
