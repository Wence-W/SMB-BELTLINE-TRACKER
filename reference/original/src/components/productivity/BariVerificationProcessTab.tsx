/**
 * Bariatric Verification Workflow Process — read-only SOP page for the
 * Ins Verifiers team (Wence, 2026-09-23). Static content; no Convex data.
 * Route: /dashboard?tab=verification-process
 */
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { VerificationUpdatesAndAck } from "./VerificationUpdatesAndAck";

type Step = { text: ReactNode; sub?: ReactNode[] };
type Section = {
  id: number;
  title: string;
  intro?: ReactNode;
  steps?: Step[];
  after?: ReactNode;
};

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function FieldList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const SCENARIO_COMMON: [string, ReactNode][] = [
  ["Assign to Others", "Unassigned"],
  ["Priority", "High"],
  ["Expiration Date", "1 week from today"],
  ["Status", "New"],
];

const SECTIONS: Section[] = [
  {
    id: 1,
    title: "Open and Review Assigned Task",
    steps: [
      { text: <>Open the <B>Bari Tracker</B>.</> },
      { text: "Check the task assigned to you." },
      { text: <>Copy the <B>BBA Number</B>.</> },
      {
        text: (
          <>
            Update Slack using the format:
            <CodeBlock>NW EXAMPLE-ID</CodeBlock>
          </>
        ),
      },
    ],
  },
  {
    id: 2,
    title: "Access the Patient Profile",
    steps: [
      {
        text: <><B>Option A – Through the Bari Tracker:</B> open the patient directly from the tracker.</>,
      },
      {
        text: <><B>Option B – Through Azalea:</B></>,
        sub: [
          <>Open <B>Tasks</B>.</>,
          <>Click the <B>Pencil Icon</B> to open the task floating panel.</>,
          <>Click the <B>Patient's Name</B> to open the patient's profile.</>,
        ],
      },
    ],
  },
  {
    id: 3,
    title: "Open the Bari Verification Sheet",
    steps: [
      { text: <>Go to <B>Handouts</B> (under Documents).</> },
      { text: <>Click <B>New Handout</B>.</> },
      { text: <>Select <B>BARI VERIF</B> category.</> },
      { text: <>Choose <B>BARI VERI SHEET</B>.</> },
      {
        text: <>Click the <B>Folder Icon</B> on the handout line (<B>Export Handout to Documents</B>).</>,
      },
    ],
  },
  {
    id: 4,
    title: "Complete the Verification Call",
    steps: [
      { text: "Follow the Bari Verification Script." },
      { text: "Complete all required benefit and coverage verification." },
      { text: "Document all information on the Bari Verification Sheet." },
    ],
  },
  {
    id: 5,
    title: "Save the Verification Sheet",
    intro: "After the call:",
    steps: [
      { text: <>Click <B>Save to Patient</B> (Red Button).</> },
      { text: <>Click <B>Back</B>.</> },
      {
        text: (
          <>
            Set:
            <FieldList
              rows={[
                ["Document Category", "Other"],
                ["Document Label", <B key="l">BARI VERIFICATIONS</B>],
              ]}
            />
          </>
        ),
      },
      { text: <>Click <B>Export</B>.</> },
    ],
  },
  {
    id: 6,
    title: "Create a Pop-Up Comment",
    steps: [
      { text: <>Go to <B>Comments</B> (under Details).</> },
      { text: <>Click <B>New Pop Up</B>.</> },
      {
        text: (
          <>
            Enter the appropriate coverage summary. Examples:
            <div className="mt-2 space-y-3">
              <div>
                <div className="text-xs font-semibold text-foreground">Covered</div>
                <CodeBlock>2026 BARI VERIF - BARI SX COVERED; MWL COVERED; BCBS ANTHEM SHBP (PRIMARY)</CodeBlock>
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Not Covered</div>
                <CodeBlock>2026 BARI VERIF - BARI SX NOT COVERED; MWL NOT COVERED; BCBS ANTHEM SHBP (PRIMARY)</CodeBlock>
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Terminated Policy</div>
                <CodeBlock>2026 BARI VERIF - TERMINATED POLICY; BCBS ANTHEM SHBP (PRIMARY)</CodeBlock>
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Example with Office Visit Benefits</div>
                <CodeBlock>2026 BARI VERIF - BARI SX COVERED; OFFICE VISITS COVERED; PREVENTIVE 99403 NOT COVERED; BCBS TEXAS (PRIMARY)</CodeBlock>
              </div>
            </div>
          </>
        ),
      },
      { text: "Replace the insurance name as appropriate." },
      { text: <>Click <B>Submit</B>.</> },
    ],
  },
  {
    id: 7,
    title: "Add Detailed Verification Notes",
    steps: [
      { text: <>Go to <B>Comments</B> (under Details).</> },
      { text: <>Click <B>New Comment</B>.</> },
      { text: "Copy and paste the complete footnotes from the Bari Verification Sheet." },
      { text: <>Click <B>Submit</B>.</> },
    ],
  },
  {
    id: 8,
    title: "Update Task Notes",
    steps: [
      { text: <>Go to <B>Tasks</B> (under Details).</> },
      { text: "Open the task." },
      {
        text: <>Paste the same footnotes from the Bari Verification Sheet into the <B>Notes</B> section.</>,
      },
    ],
  },
  {
    id: 10,
    title: "Update the Bari Tracker",
    steps: [
      { text: <>Return to the <B>Bari Tracker</B>.</> },
      { text: "Mark the task as completed." },
      {
        text: <>Paste the same footnotes from the Bari Verification Sheet into the <B>NOTES</B> column.</>,
      },
      { text: "Save/update the tracker." },
    ],
  },
];

const QUALITY_CHECK = [
  "Bari Verification Sheet completed and saved",
  "Verification document exported to patient chart",
  "Pop-up comment added",
  "Detailed comment added",
  "Task notes updated",
  "Correct task category selected",
  "Expiration date reviewed",
  "Bari Tracker updated",
  "Notes match the Bari Verification Sheet exactly",
];

function SectionCard({ section }: { section: Section }) {
  return (
    <section
      id={`step-${section.id}`}
      className="bg-card border border-border rounded-xl shadow-sm px-5 py-4"
    >
      <h3 className="flex items-center gap-3 text-base font-bold text-foreground">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
          {section.id}
        </span>
        {section.title}
      </h3>
      {section.intro && <p className="mt-2 text-sm text-muted-foreground">{section.intro}</p>}
      {section.steps && (
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-foreground marker:text-muted-foreground">
          {section.steps.map((s, i) => (
            <li key={i}>
              {s.text}
              {s.sub && (
                <ol className="mt-1 list-decimal space-y-1 pl-6 marker:text-muted-foreground">
                  {s.sub.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {section.after}
    </section>
  );
}

function ScenarioCard({
  label,
  title,
  category,
  assignee,
  children,
}: {
  label: string;
  title: string;
  category: string;
  assignee: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{title}</div>
      <FieldList
        rows={[
          ["Category", <Code key="c">{category}</Code>],
          ["Primary Assignee", assignee],
          ...SCENARIO_COMMON,
        ]}
      />
      <p className="mt-2 text-sm text-foreground">
        Click <B>Submit</B>.
      </p>
      {children}
    </div>
  );
}

function TaskCategorySection() {
  return (
    <section id="step-9" className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
      <h3 className="flex items-center gap-3 text-base font-bold text-foreground">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
          9
        </span>
        Update the Task Category
      </h3>
      <div className="mt-3 space-y-3">
        <ScenarioCard
          label="Scenario A"
          title="Patient Has No Appointment Yet"
          category="[VERIFY] COMPLETED / NEED TO CALL PT"
          assignee="Front Office"
        />
        <ScenarioCard
          label="Scenario B"
          title="Patient Has Appointment but Bariatric Surgery is Not Covered"
          category="[VERIFY] COMPLETED / SELF PAY (NO COV.)"
          assignee="Front Office Coordinators"
        >
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-xs font-semibold text-foreground">Then change the Bill Type</div>
            <ol className="mt-1 list-decimal space-y-1 pl-6 text-sm text-foreground marker:text-muted-foreground">
              <li>
                Go to <B>Dashboard</B> or <B>Demographics</B> and click <B>Edit</B>.
              </li>
              <li>
                For <B>Bill Type</B>, select <Code>SELF PAY(PATIENT)</Code> from the dropdown — if the
                appointment is for a bariatric consultation or the patient has never had bariatric
                surgery.
              </li>
              <li>
                Click <B>Save Changes</B> (red button).
              </li>
            </ol>
          </div>
        </ScenarioCard>
        <ScenarioCard
          label="Scenario C"
          title="Reverification Only (Existing Verification on File)"
          category="[RE-VERIFY] COMPLETED / NEED TO CALL PT"
          assignee="Front Office Coordinators"
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
          <B>Urgent cases:</B> if the task is urgent, set the expiration date to <B>Today</B> or{" "}
          <B>Tomorrow</B>.
        </div>
      </div>
    </section>
  );
}

export function BariVerificationProcessTab() {
  const ordered = [
    ...SECTIONS.filter(s => s.id <= 8),
    null, // step 9 (task category) renders its own component
    ...SECTIONS.filter(s => s.id >= 10),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <h2 className="text-lg font-bold text-foreground">Bariatric Verification Workflow Process</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Step-by-step process for completing a bariatric insurance verification, from the assigned
          task in the Bari Tracker through Azalea documentation and closing the task. Reference only —
          this page does not change any Cases, Tasks, or Reports data.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...SECTIONS.filter(s => s.id <= 8), { id: 9, title: "Update the Task Category" }, ...SECTIONS.filter(s => s.id >= 10)].map(s => (
            <a
              key={s.id}
              href={`#step-${s.id}`}
              className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary"
            >
              {s.id}. {s.title}
            </a>
          ))}
        </div>
      </div>

      {ordered.map((s, i) => (s ? <SectionCard key={s.id} section={s} /> : <TaskCategorySection key={`tc-${i}`} />))}

      <section className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <h3 className="text-base font-bold text-foreground">Quick Quality Check Before Closing</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-foreground">
          {QUALITY_CHECK.map(item => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <VerificationUpdatesAndAck page="process" />
      </section>
    </div>
  );
}
