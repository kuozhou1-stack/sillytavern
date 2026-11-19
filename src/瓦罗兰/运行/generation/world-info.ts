import { scanWorldInfoSource } from './world-info-source.js';

export interface ScanWorldInfoContext {
  /** Newest message first. The current user input is supplied separately. */
  chat: string[];
  /** Real chat progress is independent of the messages selected for this request. */
  chatLength?: number;
  updateWorldInfo?: boolean;
  signal?: AbortSignal;
  expandPrompt?: (text: string) => string;
  maxContext: number;
  isDryRun: boolean;
  globalScanData: Record<string, unknown>;
  scenario: string;
  extensionPrompts: Record<string, {
    value: string;
    scan?: boolean;
    filter?: (() => boolean | Promise<boolean>) | null;
    [key: string]: unknown;
  }>;
  userInput: string;
  externalActivations?: Record<string, any>[];
}

export interface ScannedWorldInfo {
  worldInfoString: string;
  worldInfoBefore: string;
  worldInfoAfter: string;
  worldInfoExamples: { position: number; content: string }[];
  worldInfoDepth: { depth: number; entries: string[]; role: number }[];
  anBefore: string[];
  anAfter: string[];
  outletEntries: Record<string, string[]>;
}

/** Evaluate native World Info rules while retaining each request's input and output. */
export async function scanWorldInfo(
  native: Record<string, any>,
  context: ScanWorldInfoContext,
): Promise<ScannedWorldInfo> {
  return scanWorldInfoSource(native, context);
}
