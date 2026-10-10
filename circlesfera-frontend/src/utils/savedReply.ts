/** What a saved reply can be filled with: what is known of the ticket. */
export interface SavedReplyValues {
  name?: string | null;
  subject?: string | null;
  reference?: number | string | null;
}

/**
 * The text of a saved reply with its placeholders filled for a ticket:
 * `{{name}}`, `{{subject}}` and `{{reference}}`. A placeholder that is not
 * one of them, or whose value is not known, stays as written, so the agent
 * sees it before sending.
 */
export function fillSavedReply(body: string, values: SavedReplyValues): string {
  const known: Record<string, string | undefined> = {
    name: values.name?.trim() || undefined,
    subject: values.subject?.trim() || undefined,
    reference:
      values.reference === null || values.reference === undefined
        ? undefined
        : String(values.reference),
  };
  return body.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/gi,
    (written, key: string) => known[key.toLowerCase()] ?? written,
  );
}

/**
 * Puts a text in the reply box: alone when the box is empty, and otherwise
 * after what is there and a blank line. What the agent wrote is kept.
 */
export function addToDraft(draft: string, text: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n\n${text}` : text;
}

/** The name to greet a requester by: their first name, or their username. */
export function requesterGreetingName(
  profile?: {
    fullName?: string | null;
    username?: string | null;
  } | null,
): string | undefined {
  return (
    profile?.fullName?.trim().split(/\s+/)[0] || profile?.username || undefined
  );
}
