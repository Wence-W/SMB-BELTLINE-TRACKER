/**
 * Insurance Verification & Reverification Guidelines — read-only reference
 * page for the Ins Verifiers team (Wence, 2026-09-23). Static content; no
 * Convex data except the shared Updates/Acknowledge widget at the bottom.
 * Route: /dashboard?tab=verification-guidelines
 */
import type { ReactNode } from "react";
import { VerificationUpdatesAndAck } from "./VerificationUpdatesAndAck";

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function I({ children }: { children: ReactNode }) {
  return <em className="italic text-foreground">{children}</em>;
}

function PopUp({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

type Rule = { id: number; title: string; body: ReactNode };

const RULES: Rule[] = [
  {
    id: 1,
    title: "Reverification – Specific CPT Code(s) Only",
    body: (
      <>
        <p>
          For reverification requests involving <I>specific CPT code(s) only</I>, there is{" "}
          <I>no need to complete a Bari Sheet</I>. Please make sure to:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>
            Document the <I>call reference information</I>.
          </li>
          <li>
            Export and attach the <I>verification</I>.
          </li>
          <li>
            Add a note/comment indicating that the reverification was completed for the{" "}
            <I>specific CPT code(s) only</I>.
          </li>
          <li>Update the assigned task accordingly.</li>
          <li>No additional pop-up comment is required.</li>
        </ul>
      </>
    ),
  },
  {
    id: 2,
    title: "Reverification Requests from the Onshore Team",
    body: (
      <>
        <p>
          For reverification requests received from the <I>Onshore Team</I>:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>
            Add a note at the <I>bottom of the verification</I> indicating that the reverification
            was completed.
          </li>
          <li>
            If there are any changes to the benefits or coverage, clearly document the{" "}
            <I>updated information</I>.
          </li>
          <li>
            If there are no changes, document: <I>&ldquo;No changes from the previous
            verification.&rdquo;</I>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 3,
    title: "Predetermination",
    body: (
      <>
        <p>Create a task when predetermination is required, following these guidelines:</p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>
            <I>Required = Yes:</I> Create a predetermination task.
          </li>
          <li>
            <I>Required, but No Appointment:</I> Do <I>not</I> create a task if the patient does
            not have an appointment listed in the Appointments tab.
          </li>
          <li>
            <I>Required, but Telehealth Appointment:</I> Do <I>not</I> create a task if the
            appointment is for Telehealth.
          </li>
        </ul>
        <div className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          <p className="font-semibold text-foreground">In summary:</p>
          <p>Required = <B>Yes</B></p>
          <p>Required + No Appointment = <B>No Task</B></p>
          <p>Required + Telehealth Appointment = <B>No Task</B></p>
        </div>
        <p className="mt-3">
          Regardless of whether a task is created, add a pop-up comment stating whether
          predetermination is <I>Required</I> or <I>Optional</I> for <I>No Appointment</I>,{" "}
          <I>Consult</I>, and <I>Surgery</I> &mdash; <I>except for Telehealth</I> appointments,
          which do not need a pop-up comment.
        </p>
        <p className="mt-2">Use the following Pop-Up Comments:</p>
        <PopUp>{"PREDETERMINATION IS REQUIRED FOR BARI"}</PopUp>
        <PopUp>{"PREDETERMINATION IS REQUIRED FOR ABLATION"}</PopUp>
        <PopUp>{"PREDETERMINATION IS OPTIONAL FOR BARI"}</PopUp>
        <PopUp>{"PREDETERMINATION IS OPTIONAL FOR ABLATION"}</PopUp>
      </>
    ),
  },
  {
    id: 4,
    title: "COB Update",
    body: (
      <>
        <p>
          If the <I>COB needs to be updated</I>:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>Document the required update in the notes.</li>
          <li>
            Create a <I>COB task</I> for follow-up.
          </li>
          <li>
            Add the following pop-up comment:
            <PopUp>COB NEEDS TO BE UPDATED</PopUp>
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          This ensures the issue is clearly identified and properly followed up on.
        </p>
      </>
    ),
  },
  {
    id: 5,
    title: "PCP Referral Required",
    body: (
      <>
        <p>
          If a <I>PCP referral is required</I>:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>
            Obtain the <I>PCP&rsquo;s name and phone number</I>.
          </li>
          <li>Document the PCP information in the notes.</li>
          <li>Create a task for follow-up.</li>
          <li>Add the required pop-up comment.</li>
        </ul>
        <p className="mt-2">
          When a referral is required, use the following Pop-Up Comment:
        </p>
        <PopUp>REFERRAL REQUIRED (INSURANCE NAME)</PopUp>
        <p className="mt-2 text-sm text-muted-foreground">
          Please make sure the insurance name is included in the pop-up comment.
        </p>
      </>
    ),
  },
];

export function BariVerificationGuidelinesTab() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <h2 className="text-lg font-bold text-foreground">
          Insurance Verification &amp; Reverification Guidelines
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Please follow the guidelines below when handling reverification and insurance
          verification tasks. Reference only — this page does not change any Cases, Tasks, or
          Reports data.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {RULES.map(r => (
            <a
              key={r.id}
              href={`#rule-${r.id}`}
              className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary"
            >
              {r.id}. {r.title}
            </a>
          ))}
        </div>
      </div>

      {RULES.map(r => (
        <section
          key={r.id}
          id={`rule-${r.id}`}
          className="bg-card border border-border rounded-xl shadow-sm px-5 py-4 scroll-mt-20"
        >
          <h3 className="text-base font-bold text-foreground">
            {r.id}. {r.title}
          </h3>
          <div className="mt-3 text-sm text-foreground leading-relaxed">{r.body}</div>
        </section>
      ))}

      <section className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <VerificationUpdatesAndAck page="guidelines" />
      </section>
    </div>
  );
}
