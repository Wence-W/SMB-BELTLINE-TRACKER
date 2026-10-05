// Turns the backend's error codes (ConvexError { code }) into the messages
// staff saw in the original app. The backend never puts values in errors.
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  EMAIL_NOT_VERIFIED: "Finish setting your password with the emailed code to activate your account.",
  NOT_PROVISIONED: "This account isn't active in the tracker. Ask an admin to enable it.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NAME_REQUIRED: "Name is required",
  VALUE_REQUIRED: "Enter a name before adding it.",
  ALREADY_EXISTS: "That name is already on the list.",
  INVALID_LOCATION: "Choose a valid clinic location for this provider.",
  SCHEDULER_HAS_NO_LOCATION: "Schedulers cannot be assigned to a clinic location.",
  INVALID_IMAGE: "Choose a JPEG, PNG or WebP image under 2 MB.",
  INVALID_EMAIL: "Enter a valid email address.",
  DISPLAY_NAME_REQUIRED: "Enter the person's name.",
  ALREADY_PROVISIONED: "That email already has an account.",
  NOT_FOUND: "That item no longer exists.",
  NOT_ON_TEAM: "That person isn't on this team's roster.",
  INVALID_DATE: "Choose a valid date.",
  INVALID_COUNT: "Enter a whole number.",
  CATEGORY_REQUIRED: "Select a category, or set Category to None and Count to 0",
  NOTHING_TO_SAVE: "Enter a category count or at least one metric value",
  INVALID_RESULT: "Choose a Result that fits this category.",
  INVALID_CATEGORY: "Choose a Call Reason in the same direction as this entry.",
  REFERRAL_ID_REQUIRED: "Fill in at least REF ID, MR#, or CHART before logging.",
  INVALID_PROVIDER: "Choose a To Provider from the list.",
};

export function errorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null)?.data?.code;
}

export function errorMessage(error: unknown, fallback: string): string {
  const code = errorCode(error);
  return (code && MESSAGES[code]) || fallback;
}
