# Verification and limits

Verified on September 12, 2026. Test fixtures and local browser checks are separate from the real provider receipts below.

| Gate | Evidence |
| --- | --- |
| Public launch | The [app](https://resolute-akita-616.convex.site/) and [source repository](https://github.com/himanshu748/thesisline) are public. Release commit: [`6eac7a7`](https://github.com/himanshu748/thesisline/commit/6eac7a7). |
| Continuous integration | [GitHub Actions run 34685625584](https://github.com/himanshu748/thesisline/actions/runs/34685625584) succeeded for that release commit. |
| Backend behavior | 62 passing tests cover ownership, private data, immutable snapshots, quotation/date validation, evidence identity, source ranking, failures, scheduling and notification delivery states. |
| Live source retrieval | An authenticated Infosys question retrieved three official pages, including an earnings-release PDF. Firecrawl and OpenAI were called with configured backend credentials. |
| Literal provenance | The saved finding's quotation was present in its cited snapshot; SHA-256 hashes matched the captured text. The July 23, 2026 event date has literal date evidence from that document. |
| Recheck | An unchanged real recheck added zero events and no second alert. |
| Real email | A verification code was received and consumed. After explicit opt-in, one research alert was received in the owned test inbox. Test alerts were disabled afterward. |
| Browser | Normal password sign-in, saved evidence after reload, source dialog with Escape/focus restoration, daily/alert controls, unavailable-link recovery, and the new-question form were checked. The workspace fit 390px without horizontal overflow or page errors. |
| Public walkthrough | Three fictional timeline states, keyboard interaction, desktop/mobile layouts and reduced motion were checked separately. The example is visibly labelled fictional. |
| Hosted video | The [captioned 1:37 walkthrough](https://drive.google.com/file/d/1dUeHLHe0Lagy2sREmg5PRBxu3pppB1tw/view) played in a fresh unauthenticated browser. Its Deepgram Aura 2 Thalia synthetic narration was used only for the video. |
| Submission | [Public Vibe Apps entry](https://vibeapps.dev/s/thesisline) created through the All Gas submission form on September 12, 2026 at 16:17 IST, showing Himanshu Kumar and AllGasHackathonSubmission. Private judging status was not accessible. |
| Social launch | [Published X post](https://x.com/jhahimanshu653/status/2098724377948995701) with native 1:37 video and English captions; the submission links to this post. |

Provider logs, raw source text, QA credentials, screenshots and recordings remain in ignored local output folders. No raw credential is required to review the source or run deterministic tests.

## Boundaries

- Initial company coverage is Infosys and ITC. The full research-to-email live proof above used Infosys.
- Retrieval is limited to three selected official pages and 24,000 captured characters per page. It is not an exhaustive or licensed real-time market feed.
- Capture time is not announcement time. First checks can surface historical documents.
- Literal quotation checks establish that text exists in a captured source; they do not prove an interpretation is correct or a company statement is accurate.
- Evidence identity uses the cited snapshot set, event kind and validated date within one question. Different excerpts of that same evidence do not create another entry. Changed snapshots remain eligible; this does not guarantee semantic uniqueness of business facts.
- A model decides the supporting/conflicting/unclear reading. It is research context, not a price forecast, trade signal or personalized recommendation.
- Daily scheduling, interruption handling and failure preservation have automated tests. A multi-day production observation has not yet been completed.
- Archive stops new work but preserves stored records. Self-service account deletion and password recovery are not implemented.
- Independent user feedback, judging results and social engagement are not established by automated checks.
