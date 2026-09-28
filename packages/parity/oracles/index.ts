// The test oracles: the ORIGINAL app's computations, imported unchanged from
// reference/original (exported library modules) or from verbatim extracted
// copies (helpers defined inside component files). The rebuild's own
// implementations are tested against these for identical output.

export * as appointmentNotifications from "../../../reference/original/src/lib/appointmentNotifications";
export * as appointmentOptions from "../../../reference/original/src/lib/appointmentOptions";
export * as completedFilters from "../../../reference/original/src/lib/completedFilters";
export * as computations from "../../../reference/original/src/lib/computations";
export * as dateFormat from "../../../reference/original/src/lib/dateFormat";
export * as docAudit from "../../../reference/original/src/lib/docAudit";
export * as intakeTypes from "../../../reference/original/src/lib/intakeTypes";
export * as taskTypes from "../../../reference/original/src/lib/taskTypes";
export * as ytdConsults from "../../../reference/original/src/lib/ytdConsults";
export * as reportsTab from "./extracted/reportsTab";
export * as staffProductivity from "./extracted/staffProductivity";
