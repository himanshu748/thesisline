import { describe, expect, it } from "vitest";
import {
  cleanQuestion,
  eventIdentity,
  validDate,
  validateEvents,
  type CandidateEvent,
} from "../convex/lib/evidence";
import { chooseDocumentLinks, officialUrl } from "../convex/lib/companies";
const text =
  "On July 23, 2026, the company reported large-deal wins of $3.8 billion. Revenue guidance was unchanged.";
const source = { id: "source-one", text };
const event: CandidateEvent = {
  title: "Results disclosure",
  kind: "results",
  eventDate: "2026-07-23",
  dateEvidence: "July 23, 2026",
  status: "unclear",
  answer: "The company reported $3.8 billion of large-deal wins.",
  citations: [
    {
      sourceId: source.id,
      quote: "the company reported large-deal wins of $3.8 billion.",
    },
  ],
};
describe("source-grounded event gate", () => {
  it("does not give an uncertain answer a title that claims a revision", () => {
    expect(
      validateEvents(
        [{ ...event, title: "Revenue guidance revision" }],
        [source],
      )[0].title,
    ).toBe("Results disclosure");
  });
  it("accepts an exact quotation and explicitly stated date", () =>
    expect(validateEvents([event], [source])).toEqual([event]));
  it("rejects an invented quotation", () =>
    expect(
      validateEvents(
        [
          {
            ...event,
            citations: [
              {
                sourceId: source.id,
                quote: "The company guaranteed a 40 percent return.",
              },
            ],
          },
        ],
        [source],
      ),
    ).toEqual([]));
  it("rejects a real quote assigned to the wrong source", () =>
    expect(
      validateEvents(
        [
          {
            ...event,
            citations: [{ ...event.citations[0], sourceId: "other" }],
          },
        ],
        [source],
      ),
    ).toEqual([]));
  it("rejects events without citations", () =>
    expect(validateEvents([{ ...event, citations: [] }], [source])).toEqual(
      [],
    ));
  it("rejects partial paraphrases masquerading as quotations", () =>
    expect(
      validateEvents(
        [
          {
            ...event,
            citations: [
              {
                sourceId: source.id,
                quote: "the company reported large deal wins of $3.8 billion.",
              },
            ],
          },
        ],
        [source],
      ),
    ).toEqual([]));
  it("rejects meaningless tiny quotes", () =>
    expect(
      validateEvents(
        [{ ...event, citations: [{ sourceId: source.id, quote: "company" }] }],
        [source],
      ),
    ).toEqual([]));
  it("keeps an unsupported event date unknown", () =>
    expect(
      validateEvents([{ ...event, eventDate: "2026-07-24" }], [source])[0]
        .eventDate,
    ).toBeNull());
  it("does not use a date from an uncited source", () =>
    expect(
      validateEvents(
        [
          {
            ...event,
            eventDate: "2026-08-20",
            dateEvidence: "August 20, 2026",
          },
        ],
        [source, { id: "other", text: "August 20, 2026" }],
      )[0].eventDate,
    ).toBeNull());
  it("recovers a missing date quote only from a literal date in the answer and cited source", () => {
    const answer = "The company disclosed deal wins on July 23, 2026.";
    const validated = validateEvents(
      [{ ...event, eventDate: null, dateEvidence: null, answer }],
      [source],
    )[0];
    expect(validated.eventDate).toBe("2026-07-23");
    expect(validated.dateEvidence).toBe("July 23, 2026");
    expect(validated.answer).toBe(answer);
  });
  it("removes an unsupported full date from the answer and title", () => {
    const validated = validateEvents(
      [
        {
          ...event,
          status: "supports",
          title: "Results on August 8, 2026",
          answer: "The company disclosed deal wins on August 8, 2026.",
          eventDate: "2026-08-08",
          dateEvidence: "August 8, 2026",
        },
      ],
      [source],
    )[0];
    expect(validated.eventDate).toBeNull();
    expect(validated.dateEvidence).toBeNull();
    expect(validated.answer).not.toContain("August 8, 2026");
    expect(validated.title).not.toContain("August 8, 2026");
    expect(validated.answer).toContain("an unconfirmed date");
  });
  it("does not guess which of multiple grounded answer dates is the event date", () => {
    const datedSource = {
      ...source,
      text: `${text} August 20, 2026 is the meeting date.`,
    };
    const validated = validateEvents(
      [
        {
          ...event,
          eventDate: null,
          dateEvidence: null,
          answer:
            "Results dated July 23, 2026 mention a meeting on August 20, 2026.",
        },
      ],
      [datedSource],
    )[0];
    expect(validated.eventDate).toBeNull();
    expect(validated.answer).toContain("July 23, 2026");
    expect(validated.answer).toContain("August 20, 2026");
  });
  it("does not recover an answer date from an uncited source", () => {
    const validated = validateEvents(
      [
        {
          ...event,
          eventDate: null,
          dateEvidence: null,
          answer: "The company disclosed deal wins on August 20, 2026.",
        },
      ],
      [source, { id: "other", text: "August 20, 2026" }],
    )[0];
    expect(validated.eventDate).toBeNull();
    expect(validated.answer).not.toContain("August 20, 2026");
  });
  it("deduplicates facts independently of model title and answer wording", () =>
    expect(eventIdentity(event)).toBe(
      eventIdentity({
        ...event,
        title: "Different title",
        answer: "Different phrasing",
      }),
    ));
  it("deduplicates different excerpts from the same immutable evidence", () => {
    expect(eventIdentity(event)).toBe(
      eventIdentity({
        ...event,
        title: "Another title",
        citations: [
          { sourceId: source.id, quote: text },
          { sourceId: source.id, quote: "Revenue guidance was unchanged." },
        ],
      }),
    );
  });
  it("retains a distinct immutable snapshot version", () => {
    expect(eventIdentity(event)).not.toBe(
      eventIdentity({
        ...event,
        citations: [
          { ...event.citations[0], sourceId: "new-snapshot-version" },
        ],
      }),
    );
  });
  it("retains a distinct event date", () =>
    expect(eventIdentity(event)).not.toBe(
      eventIdentity({ ...event, eventDate: "2026-07-24" }),
    ));
});
describe("calendar uncertainty", () => {
  it("does not splice the month of one source date with the day of another", () => {
    const dateEvidence =
      "Results for the quarter ended June 30, 2026 were announced on July 23, 2026";
    expect(
      validDate("2026-06-23", dateEvidence, [{ id: "x", text: dateEvidence }]),
    ).toBeNull();
    expect(
      validDate("2026-07-23", dateEvidence, [{ id: "x", text: dateEvidence }]),
    ).toBe("2026-07-23");
  });
  it.each(["2026-02-30", "2026-13-01", "not a date"])(
    "rejects invalid calendar date %s",
    (date) =>
      expect(validDate(date, date, [{ id: "x", text: date }])).toBeNull(),
  );
  it("accepts a leap day in a leap year", () =>
    expect(
      validDate("2024-02-29", "February 29, 2024", [
        { id: "x", text: "February 29, 2024" },
      ]),
    ).toBe("2024-02-29"));
  it("does not invent a day from a quarter", () =>
    expect(
      validDate("2026-06-30", "Q1 FY2026", [{ id: "x", text: "Q1 FY2026" }]),
    ).toBeNull());
  it("leaves ambiguous numeric dates unknown", () =>
    expect(
      validDate("2026-07-08", "08/07/2026", [{ id: "x", text: "08/07/2026" }]),
    ).toBeNull());
  it("accepts an unambiguous Indian numeric date", () =>
    expect(
      validDate("2026-07-23", "23/07/2026", [{ id: "x", text: "23/07/2026" }]),
    ).toBe("2026-07-23"));
});
describe("curated official sources", () => {
  it("ranks later quarters ahead of an earlier PDF regardless of source order", () => {
    const base =
      "https://www.infosys.com/investors/reports-filings/quarterly-results/2026-2027/";
    const earlier = `${base}q1/documents/ifrs-usd-press-release.pdf`;
    const later = `${base}q2.html`;
    expect(
      chooseDocumentLinks("INFY", [earlier, later], ["root", "used"]),
    ).toEqual([later]);
  });
  it("keeps fiscal year ordering above quarter ordering", () => {
    const base =
      "https://www.infosys.com/investors/reports-filings/quarterly-results/";
    const earlier = `${base}2025-2026/q4.html`;
    const later = `${base}2026-2027/q1.html`;
    expect(
      chooseDocumentLinks("INFY", [earlier, later], ["root", "used"]),
    ).toEqual([later]);
  });
  it("ranks explicit calendar dates in official release URLs", () => {
    const base = "https://www.infosys.com/newsroom/press-releases/";
    const earlier = `${base}2026/07/23/result.html`;
    const later = `${base}2026/08/01/result.html`;
    expect(
      chooseDocumentLinks("INFY", [earlier, later], ["root", "used"]),
    ).toEqual([later]);
  });
  it("follows the current earnings release instead of another results index", () => {
    const root =
      "https://www.infosys.com/investors/reports-filings/quarterly-results/";
    const current = `${root}2026-2027/q1.html`;
    const release = `${root}2026-2027/q1/documents/ifrs-usd-press-release.pdf`;
    const old = `${root}2025-2026/q4.html`;
    expect(
      chooseDocumentLinks(
        "INFY",
        [
          old,
          `${root}2026-2027/q1/documents/q1-fy27-financial-results-auditorsreports.pdf`,
          release,
        ],
        [root, current],
      ),
    ).toEqual([release]);
  });
  it.each([
    "http://www.infosys.com/investors",
    "https://www.infosys.com.attacker.example/investors",
    "https://user:pass@www.infosys.com/investors",
    "https://www.infosys.com:8443/investors",
    "https://localhost/investors",
  ])("rejects a source outside the official HTTPS origin: %s", (url) =>
    expect(officialUrl("INFY", url)).toBeNull(),
  );
  it("never follows a different company's URL", () =>
    expect(officialUrl("ITC", "https://www.infosys.com/investors")).toBeNull());
  it("drops navigation and keeps at most the available document slots", () =>
    expect(
      chooseDocumentLinks(
        "INFY",
        [
          "https://www.infosys.com/investors",
          "https://www.infosys.com/investors/reports/2026/results.pdf",
          "https://www.infosys.com/investors/reports/2025/results.pdf",
        ],
        ["first", "second"],
      ),
    ).toEqual(["https://www.infosys.com/investors/reports/2026/results.pdf"]));
  it("bounds the user question", () => {
    expect(() => cleanQuestion("buy?")).toThrow();
    expect(() => cleanQuestion("x".repeat(401))).toThrow();
    expect(cleanQuestion("  What changed   in the revenue outlook? ")).toBe(
      "What changed in the revenue outlook?",
    );
  });
});
