import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Minus,
} from "lucide-react";
import { Brand } from "./ui";
import "./Landing.css";

const exampleEvents = [
  {
    month: "July",
    kind: "Quarterly results",
    title: "Growth. The same margin.",
    quote:
      "Revenue grew 8%. Operating margin was 19.4%, unchanged from the previous quarter.",
    status: "Still unclear",
    supports: false,
    reading:
      "Revenue is growing, but operating margin has not improved. This disclosure does not yet support the question behind the watchlist.",
    unknown:
      "The source does not separate revenue or costs from new contracts.",
    margin: "19.4%",
    marginNote: "unchanged",
  },
  {
    month: "August",
    kind: "Company announcement",
    title: "A new contract. An open question.",
    quote:
      "We signed a five-year services contract. Financial terms have not been disclosed.",
    status: "Still unclear",
    supports: false,
    reading:
      "A five-year agreement is new evidence, but its length does not tell us its value or profitability. The margin question stays open.",
    unknown:
      "Contract value, expected margin, and the timing of revenue are not disclosed.",
    margin: "Not disclosed",
    marginNote: "contract economics",
  },
  {
    month: "October",
    kind: "Quarterly results",
    title: "A stronger margin. A stated reason.",
    quote:
      "Operating margin increased to 20.1%. New contracts contributed to the improvement.",
    status: "Supports the question",
    supports: true,
    reading:
      "The company reports a higher operating margin and attributes some improvement to new contracts. This supports the question, within the limits of this disclosure.",
    unknown:
      "The contribution of each contract and whether the improvement will last remain unknown.",
    margin: "20.1%",
    marginNote: "reported margin",
  },
];

export default function Landing({ authenticated }: { authenticated: boolean }) {
  const [selectedEvent, setSelectedEvent] = useState(1);
  const panelId = useId();
  const current = exampleEvents[selectedEvent];
  const workspaceLink = authenticated ? "#workspace" : "#signin";

  return (
    <div className="tl-landing">
      <header className="tl-header wrap">
        <Brand />
        <nav aria-label="Main navigation" className="tl-nav">
          <a className="tl-nav-example" href="#example">
            See an example
          </a>
          <a className="tl-nav-workspace" href={workspaceLink}>
            {authenticated ? "Open workspace" : "Sign in"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main>
        <section className="tl-hero wrap" aria-labelledby="tl-hero-title">
          <div className="tl-hero-copy">
            <h1 id="tl-hero-title">
              Follow the company.
              <br />
              <em>Question the story.</em>
            </h1>
            <p className="tl-intro">
              Keep the reason behind your watchlist. Follow official company
              disclosures, see what changed, and keep the unanswered questions
              in view.
            </p>
            <div className="tl-hero-actions">
              <a className="button tl-primary" href={workspaceLink}>
                {authenticated
                  ? "Open your notebook"
                  : "Start a research notebook"}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a className="tl-text-link" href="#example">
                Follow one question
                <ArrowDown size={15} aria-hidden="true" />
              </a>
            </div>
            <p className="tl-hero-detail">
              Starting with Infosys &amp; ITC. Your research stays private.
            </p>
          </div>

          <aside
            className="tl-paper-note"
            aria-label="Example research question"
          >
            <div className="tl-note-meta">
              <span>INFY</span>
              <span>A question to follow</span>
            </div>
            <p className="tl-note-question">
              Are new contracts translating into stronger operating margins?
            </p>
            <div className="tl-note-rule" />
            <p className="tl-note-instruction">
              Save the question.
              <br />
              Let the evidence build.
            </p>
            <span className="tl-note-number" aria-hidden="true">
              01
            </span>
          </aside>
        </section>

        <section
          id="example"
          className="tl-example-section"
          aria-labelledby="tl-example-title"
        >
          <div className="wrap">
            <div className="tl-section-heading">
              <h2 id="tl-example-title">
                Three disclosures.
                <br />
                One question worth keeping.
              </h2>
              <p>
                A headline is a moment. Research keeps the context.
                <br />
                Select a disclosure to see the reading change.
              </p>
            </div>

            <div className="tl-example">
              <div className="tl-example-top">
                <div>
                  <h3>Northstar Technologies</h3>
                  <p>Are new contracts improving operating margins?</p>
                </div>
                <span className="tl-fictional-label">Fictional example</span>
              </div>

              <div
                className="tl-timeline"
                aria-label="Select a fictional disclosure"
              >
                {exampleEvents.map((event, index) => (
                  <button
                    key={event.month}
                    type="button"
                    className={`tl-event${selectedEvent === index ? " is-selected" : ""}`}
                    aria-pressed={selectedEvent === index}
                    aria-controls={panelId}
                    onClick={() => setSelectedEvent(index)}
                  >
                    <span className="tl-event-index" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className="tl-event-info">
                      <strong>{event.month}</strong>
                      <span>{event.kind}</span>
                    </span>
                    <ArrowRight
                      className="tl-event-arrow"
                      size={18}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>

              <div
                id={panelId}
                className="tl-evidence-panel"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="tl-source">
                  <span className="tl-field-label">
                    Fictional source excerpt · {current.month}
                  </span>
                  <h4>{current.title}</h4>
                  <blockquote>“{current.quote}”</blockquote>
                  <div className="tl-source-detail">
                    <span>{current.marginNote}</span>
                    <strong>{current.margin}</strong>
                  </div>
                </div>
                <div className="tl-reading">
                  <div className="tl-reading-top">
                    <span className="tl-field-label">
                      Illustrative AI reading
                    </span>
                    <span
                      className={`tl-reading-status${current.supports ? " is-supported" : ""}`}
                    >
                      {current.supports ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Minus size={14} aria-hidden="true" />
                      )}
                      {current.status}
                    </span>
                  </div>
                  <p className="tl-reading-body">{current.reading}</p>
                  <div className="tl-unknown">
                    <span className="tl-field-label">Still unknown</span>
                    <p>{current.unknown}</p>
                  </div>
                </div>
              </div>
              <p className="tl-example-caption">
                All companies, disclosures, and figures in this example are
                fictional. These readings are illustrations, not live analysis.
              </p>
            </div>
          </div>
        </section>

        <section
          className="tl-approach wrap"
          aria-labelledby="tl-approach-title"
        >
          <div className="tl-approach-intro">
            <h2 id="tl-approach-title">
              A little less noise.
              <br />A better research trail.
            </h2>
            <p>
              Come back to the question you actually asked, with the evidence
              that arrived since.
            </p>
          </div>
          <div className="tl-principles">
            <div className="tl-principle">
              <span className="tl-principle-number" aria-hidden="true">
                01
              </span>
              <div>
                <h3>The source stays close.</h3>
                <p>
                  Keep official excerpts and their dates beside the
                  interpretation. You can inspect the language behind a reading.
                </p>
              </div>
            </div>
            <div className="tl-principle">
              <span className="tl-principle-number" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Unknown is a useful answer.</h3>
                <p>
                  Undisclosed terms and missing context stay visible. A new
                  announcement does not automatically settle your question.
                </p>
              </div>
            </div>
            <div className="tl-principle">
              <span className="tl-principle-number" aria-hidden="true">
                03
              </span>
              <div>
                <h3>Your reasoning has a history.</h3>
                <p>
                  Keep the original question and revisit how the evidence
                  changed. Daily checks help you pick up the thread.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="tl-start-section" aria-labelledby="tl-start-title">
          <div className="wrap tl-start">
            <div>
              <h2 id="tl-start-title">
                Start with a company.
                <br />
                Keep a question.
              </h2>
              <a className="button tl-primary" href={workspaceLink}>
                {authenticated
                  ? "Back to your research"
                  : "Create your private notebook"}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <dl className="tl-coverage">
              <div>
                <dt>Current coverage</dt>
                <dd>Infosys (INFY) and ITC</dd>
              </div>
              <div>
                <dt>Source capture</dt>
                <dd>Up to 3 official pages per run</dd>
              </div>
              <div>
                <dt>Checking in</dt>
                <dd>
                  Daily checks. Email alerts only after you verify your email
                  and opt in.
                </dd>
              </div>
              <div>
                <dt>Your notebook</dt>
                <dd>Private to your account</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <footer className="tl-footer wrap">
        <Brand />
        <p>A research notebook. No price targets or trade recommendations.</p>
        <a href="#example">
          Explore the example <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
