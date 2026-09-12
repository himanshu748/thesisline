export const COMPANIES = [
  {
    symbol: "INFY",
    name: "Infosys",
    sector: "IT services",
    sources: [
      {
        url: "https://www.infosys.com/investors/reports-filings/quarterly-results.html",
        label: "Quarterly results",
      },
      {
        url: "https://www.infosys.com/newsroom/press-releases.html",
        label: "Company press releases",
      },
    ],
    hosts: ["www.infosys.com", "infosys.com"],
    sampleQuestions: [
      "Is Infosys reporting stronger large-deal demand?",
      "Has Infosys changed its revenue-growth guidance?",
    ],
  },
  {
    symbol: "ITC",
    name: "ITC",
    sector: "Consumer goods",
    sources: [
      {
        url: "https://itcportal.com/investors.html",
        label: "Investor announcements and results",
      },
    ],
    hosts: ["itcportal.com", "www.itcportal.com"],
    sampleQuestions: [
      "What has ITC reported about growth in its FMCG business?",
      "Has ITC announced a dividend or a change in its business structure?",
    ],
  },
] as const;

export function companyFor(symbol: string) {
  const company = COMPANIES.find((company) => company.symbol === symbol);
  if (!company) throw new Error("Choose a supported company.");
  return company;
}

export function officialUrl(symbol: string, candidate: string): string | null {
  try {
    const url = new URL(candidate);
    const company = companyFor(symbol);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !company.hosts.some((host) => host === url.hostname.toLowerCase())
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function chooseDocumentLinks(
  symbol: string,
  links: string[],
  existing: string[],
) {
  return [
    ...new Set(
      links
        .map((url) => officialUrl(symbol, url))
        .filter((url): url is string => !!url),
    ),
  ]
    .filter(
      (url) =>
        !existing.includes(url) &&
        /(?:press-release|quarter|result|earning|financial|announcement|investor)/i.test(
          url,
        ),
    )
    .filter((url) => /(?:20\d{2}|q[1-4]|\.pdf(?:\?|$))/i.test(url))
    .filter((url) => !/\.(?:jpg|png|svg|zip|mp4|xlsx?)(?:\?|$)/i.test(url))
    .sort((a, b) => {
      const score = (url: string) => {
        const year = Math.max(
          0,
          ...[...url.matchAll(/20\d{2}/g)].map((match) => Number(match[0])),
        );
        const quarter = Number(
          url.match(/(?:^|[\W_])q([1-4])(?:[\W_]|$)/i)?.[1] ?? 0,
        );
        const calendarDate = url.match(
          /\b20\d{2}[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])\b/,
        );
        const namedMonth = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ].findIndex((month) =>
          new RegExp(
            `(?:^|[\\W_])(?:${month}|${month.slice(0, 3)})(?:[\\W_]|$)`,
            "i",
          ).test(url),
        );
        // URL dates are a retrieval heuristic, not evidence of publication.
        // Within a fiscal year Q2 must outrank Q1 regardless of link order;
        // document preference applies only after the available date parts.
        return [
          year,
          quarter,
          calendarDate ? Number(calendarDate[1]) : namedMonth + 1,
          calendarDate ? Number(calendarDate[2]) : 0,
          (/quarter|result|financial/i.test(url) ? 5 : 0) +
            (/\.pdf(?:\?|$)/i.test(url) ? 20 : 0) +
            (/ifrs-(?:usd|inr)-press-release/i.test(url) ? 40 : 0) +
            (/earnings-release/i.test(url) ? 30 : 0),
        ];
      };
      const left = score(a);
      const right = score(b);
      return left.reduce(
        (difference, value, index) => difference || right[index] - value,
        0,
      );
    })
    .slice(0, Math.max(0, 3 - existing.length));
}

export function startingSource(symbol: string, question: string) {
  const company = companyFor(symbol);
  if (
    symbol === "INFY" &&
    /partnership|partner|contract|collaborat|acqui|appointment|leadership/i.test(
      question,
    )
  ) {
    return (
      company.sources.find((source) => source.url.includes("/newsroom/")) ??
      company.sources[0]
    );
  }
  return company.sources[0];
}
