import { emptyFields, type FieldSchema } from "./fields";
import { emptyProjectFusion } from "./fusion";
import {
  emptyInstantlyFind,
  type FindSource,
  type InstantlyFindState,
} from "./instantly";
import { emptyProjectLetter } from "./letter";
import type {
  ChatMessage,
  FieldMap,
  ProjectFusion,
  ProjectLetter,
  SavedAudience,
} from "./types";

export type StageId = "define" | "find" | "letter" | "fusion";

export function defineHasData(fields: FieldMap, messages: ChatMessage[]): boolean {
  if (messages.length > 0) return true;
  return Object.values(fields).some((f) => f.status !== "empty");
}

export function findHasData(
  messages: ChatMessage[],
  audience: SavedAudience | null,
  instantly?: InstantlyFindState | null
): boolean {
  if (messages.length > 0 || audience != null) return true;
  if (!instantly) return false;
  return (
    instantly.filters != null ||
    instantly.count != null ||
    (instantly.preview != null && instantly.preview.length > 0)
  );
}

/** Result or inputs count — empty shell does not. */
export function letterHasData(letter: ProjectLetter): boolean {
  if (letter.result != null) return true;
  const links = letter.materials?.links?.some((l) => l.url.trim()) || false;
  const messages =
    letter.materials?.keyMessages?.some((m) => m.trim()) || false;
  return links || messages;
}

export function fusionHasData(fusion: ProjectFusion): boolean {
  return fusion.attachments.length > 0 || fusion.summary != null;
}

export function stageHasData(
  stage: StageId,
  state: {
    fields: FieldMap;
    defineMessages: ChatMessage[];
    findMessages: ChatMessage[];
    audience: SavedAudience | null;
    letter: ProjectLetter;
    fusion: ProjectFusion;
    instantly?: InstantlyFindState | null;
  }
): boolean {
  switch (stage) {
    case "define":
      return defineHasData(state.fields, state.defineMessages);
    case "find":
      return findHasData(state.findMessages, state.audience, state.instantly);
    case "letter":
      return letterHasData(state.letter);
    case "fusion":
      return fusionHasData(state.fusion);
  }
}

/**
 * Returns a quiet message naming stages that must be reset first,
 * or null if the reset is allowed.
 */
export function resetBlockedBy(
  stage: StageId,
  state: {
    fields: FieldMap;
    defineMessages: ChatMessage[];
    findMessages: ChatMessage[];
    audience: SavedAudience | null;
    letter: ProjectLetter;
    fusion: ProjectFusion;
    instantly?: InstantlyFindState | null;
  }
): string | null {
  if (stage === "define") {
    if (findHasData(state.findMessages, state.audience, state.instantly)) {
      return "Reset Audience Find first.";
    }
    return null;
  }
  if (stage === "find") {
    const blockers: string[] = [];
    if (letterHasData(state.letter)) blockers.push("Audience Letter");
    if (fusionHasData(state.fusion)) blockers.push("Audience Fusion");
    if (blockers.length === 0) return null;
    if (blockers.length === 1) return `Reset ${blockers[0]} first.`;
    return `Reset ${blockers.join(" and ")} first.`;
  }
  // Letter and Fusion reset independently.
  return null;
}

export function emptyDefine(schema: FieldSchema): {
  fields: FieldMap;
  messages: ChatMessage[];
} {
  return { fields: emptyFields(schema), messages: [] };
}

export function emptyFind(taxonomyName: string): {
  messages: ChatMessage[];
  audience: SavedAudience | null;
  taxonomyName: string;
  source: FindSource;
  instantly: InstantlyFindState;
} {
  return {
    messages: [],
    audience: null,
    taxonomyName,
    source: "audienceLab",
    instantly: emptyInstantlyFind(),
  };
}

export { emptyProjectLetter, emptyProjectFusion };
