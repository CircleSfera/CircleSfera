import {
  E2E_PASSWORD,
  type E2eAccount,
  uniqueAccount,
  uniqueSuffix,
} from './unique.js';

export interface ScenarioAccountOptions {
  scenario: string;
  role?: 'USER' | 'CREATOR' | 'ADMIN';
  prefix?: string;
  fullName?: string;
}

export interface ScenarioPostPayload {
  caption: string;
  mode: 'POST' | 'FRAME';
}

export interface ScenarioCommentPayload {
  content: string;
}

/**
 * Creates an isolated E2E account keyed to a specific test scenario.
 * Ensures usernames incorporate both scenario prefix and process-level entropy
 * while strictly adhering to the 24-character maximum handle limit.
 */
export function createScenarioAccount(
  options: ScenarioAccountOptions,
): E2eAccount {
  const sanitizedScenario = options.scenario
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const basePrefix = options.prefix ?? sanitizedScenario ?? 'e2e';
  const suffix = uniqueSuffix();
  const username = `${basePrefix}_${suffix}`.slice(0, 24);

  return {
    email: `${username}@circlesfera.test`,
    username,
    fullName: options.fullName ?? `E2E ${options.scenario.toUpperCase()}`,
    password: E2E_PASSWORD,
    dateOfBirth: '1995-06-15',
  };
}

export function createScenarioPostPayload(
  options: {
    scenario?: string;
    caption?: string;
    mode?: 'POST' | 'FRAME';
  } = {},
): ScenarioPostPayload {
  const scenarioTag = options.scenario ? ` [${options.scenario}]` : '';
  return {
    caption: options.caption ?? `Automated E2E Post${scenarioTag}`,
    mode: options.mode ?? 'POST',
  };
}

export function createScenarioCommentPayload(
  options: { scenario?: string; content?: string } = {},
): ScenarioCommentPayload {
  const scenarioTag = options.scenario ? ` [${options.scenario}]` : '';
  return {
    content: options.content ?? `Automated E2E Comment${scenarioTag}`,
  };
}

export { E2E_PASSWORD, type E2eAccount, uniqueAccount, uniqueSuffix };
