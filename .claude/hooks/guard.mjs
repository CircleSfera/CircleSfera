// A PreToolUse hook (.claude/settings.json): Claude Code runs it before each
// shell command and each file read or write, with the call as JSON on stdin.
// It refuses, with exit code 2 and the reason on stderr, what AGENTS.md
// forbids and an instruction alone cannot guarantee. Anything else passes.
//
// The rules are in `refusal` so guard.test.mjs can check each one.

const ENV_FILE = /(^|[\\/\s'"=])\.env(\.[\w.-]+)?(?=$|[\s'"\\/;|&)])/;
const ENV_EXAMPLE = /\.env\.(example|sample|template)\b/;

function mentionsEnvFile(text) {
  return text
    .split(/\s+/)
    .some((word) => ENV_FILE.test(word) && !ENV_EXAMPLE.test(word));
}

const AI_ATTRIBUTION = [
  /co-authored-by:[^\n]*\b(claude|anthropic)\b/i,
  /claude-session:/i,
  /generated (with|by) \[?claude code/i,
  /claude\.ai\/(code|project|chat)/i,
];

/** Why the call is refused, or null when it may run. */
export function refusal(call) {
  const tool = call?.tool_name ?? '';
  const input = call?.tool_input ?? {};

  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    const file = String(input.file_path ?? input.notebook_path ?? '');
    if (ENV_FILE.test(file) && !ENV_EXAMPLE.test(file)) {
      return 'Environment files hold secrets and are never read or written by an agent (AGENTS.md: Production, Security). Use .env.example, or ask the owner.';
    }
    return null;
  }

  if (tool !== 'Bash' && tool !== 'PowerShell') return null;
  const command = String(input.command ?? '');

  if (mentionsEnvFile(command)) {
    return 'Environment files hold secrets and are never read or written by an agent. Use .env.example, or ask the owner.';
  }
  for (const push of command.matchAll(
    /\bgit\b[^\n|;&]*?\bpush\b([^\n|;&]*)/g,
  )) {
    const words = push[1].trim().split(/\s+/).filter(Boolean);
    if (
      words.some(
        (word) =>
          word === '-f' ||
          word.startsWith('--force') ||
          (word.startsWith('+') && word.length > 1),
      )
    ) {
      return 'No force push. Put a rebased change on a new branch and open a new pull request.';
    }
    const target = (word) =>
      word
        .split(':')
        .pop()
        ?.replace(/^refs\/heads\//, '');
    if (
      words
        .filter((word) => !word.startsWith('-'))
        .some((word) => target(word) === 'main')
    ) {
      return 'Never push to main: it changes only through the merge queue (AGENTS.md: Pull requests).';
    }
  }
  if (/\s--no-verify\b/.test(command)) {
    return 'Hooks are never skipped. Fix what the hook reports.';
  }
  if (/\bgh\s+pr\s+merge\b[^\n]*--admin\b/.test(command)) {
    return 'No admin merge: main merges only through the merge queue, with every required check green.';
  }
  if (
    /\b(git\s+commit|gh\s+pr\s+(create|edit|comment)|gh\s+issue\s+(create|comment))\b/.test(
      command,
    ) &&
    AI_ATTRIBUTION.some((pattern) => pattern.test(command))
  ) {
    return 'Commit messages and pull request bodies carry no AI attribution (AGENTS.md: No AI attribution). Remove the line and send it again.';
  }
  return null;
}

// Run as a hook: read the call, refuse with exit code 2 or let it through.
if (process.argv[1]?.endsWith('guard.mjs')) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    let call;
    try {
      call = JSON.parse(raw || '{}');
    } catch {
      process.exit(0);
    }
    const reason = refusal(call);
    if (reason) {
      process.stderr.write(`Refused by .claude/hooks/guard.mjs: ${reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}
