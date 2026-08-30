import type { ChatGPTUser } from "@/app/chatgpt-auth";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";

function configuredOperatorEmails() {
  return new Set(
    String(process.env.OPERATOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isOperatorEmail(email: string) {
  const allowed = configuredOperatorEmails();
  return allowed.size > 0 && allowed.has(email.trim().toLowerCase());
}

export function isLocalOperatorBypassEnabled() {
  return process.env.NODE_ENV !== "production" && configuredOperatorEmails().size === 0;
}

export function canUseWorkbench(user: ChatGPTUser | null) {
  if (isLocalOperatorBypassEnabled()) return true;
  return Boolean(user && isOperatorEmail(user.email));
}

export function operatorRequestAllowed(request: Request) {
  if (isLocalOperatorBypassEnabled()) return true;
  const email = request.headers.get(USER_EMAIL_HEADER);
  return Boolean(email && isOperatorEmail(email));
}
