/**
 * Connection strength scoring engine.
 * Implements LLD §4.1 — deterministic, explainable 0–100 score.
 */

export interface SignalPayload {
  emailCount: number;
  lastEmailAt: string | null;
  meetingCount: number;
  lastMeetingAt: string | null;
  sourcesPresent: string[]; // e.g. ["contacts", "gmail", "calendar", "linkedin_import", "x_import"]
  directToRatio: number;    // fraction of threads where user was direct To (not CC)
  directInteractions?: number;
  ccInteractions?: number;
  connectedOn?: string | null;
}

export interface ScoreExplanation {
  strength: number;
  evidence: {
    emailCount: number;
    meetingCount: number;
    directInteractions: number;
    ccInteractions: number;
    directToRatio: number;
    lastEmailAt: string | null;
    lastMeetingAt: string | null;
    sourcesPresent: string[];
    connectedOn: string | null;
  };
  breakdown: {
    emailScore: number;
    meetingScore: number;
    sourceScore: number;
    importScore: number;
    directnessBonus: number;
  };
  explanation: string;
}

export const SCORING_WEIGHTS = {
  MAX_EMAIL_POINTS: 40,
  EMAIL_SATURATION_THRESHOLD: 25,
  MAX_MEETING_POINTS: 30,
  MEETING_SATURATION_THRESHOLD: 8,
  POINTS_PER_SOURCE: 10,
  MAX_SOURCE_POINTS: 20,
  DIRECTNESS_BONUS_POINTS: 10,
  DIRECTNESS_THRESHOLD: 0.3,
  RECENCY_HALF_LIFE_DAYS: 180,
  RECENCY_FLOOR: 0.1,
} as const;

/**
 * Computes recency_decay(t) = exp(-days_since(t) / 180), clamped to [0.1, 1.0].
 * Gracefully handles nulls, invalid date strings, and future dates.
 */
export function recencyDecay(dateStr: string | null | undefined): number {
  if (!dateStr || typeof dateStr !== "string") return SCORING_WEIGHTS.RECENCY_FLOOR;

  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) {
    return SCORING_WEIGHTS.RECENCY_FLOOR;
  }

  const daysSince = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

  // Future dates capped at 1.0; past dates decayed with floor 0.1
  if (daysSince <= 0) return 1.0;

  const rawDecay = Math.exp(-daysSince / SCORING_WEIGHTS.RECENCY_HALF_LIFE_DAYS);
  return Math.min(1.0, Math.max(SCORING_WEIGHTS.RECENCY_FLOOR, rawDecay));
}

/**
 * Computes deterministic score breakdown and human-readable explanation.
 */
export function explainScore(signals: Partial<SignalPayload> | null | undefined): ScoreExplanation {
  const safeSignals: SignalPayload = {
    emailCount: Math.max(0, signals?.emailCount && Number.isFinite(signals.emailCount) ? signals.emailCount : 0),
    lastEmailAt: signals?.lastEmailAt || null,
    meetingCount: Math.max(0, signals?.meetingCount && Number.isFinite(signals.meetingCount) ? signals.meetingCount : 0),
    lastMeetingAt: signals?.lastMeetingAt || null,
    sourcesPresent: Array.isArray(signals?.sourcesPresent) ? [...new Set(signals.sourcesPresent)] : [],
    directToRatio: Math.min(1, Math.max(0, signals?.directToRatio && Number.isFinite(signals.directToRatio) ? signals.directToRatio : 0)),
    directInteractions: Math.max(0, signals?.directInteractions && Number.isFinite(signals.directInteractions) ? signals.directInteractions : 0),
    ccInteractions: Math.max(0, signals?.ccInteractions && Number.isFinite(signals.ccInteractions) ? signals.ccInteractions : 0),
    connectedOn: signals?.connectedOn || null,
  };

  const emailDecay = recencyDecay(safeSignals.lastEmailAt);
  const emailScore =
    SCORING_WEIGHTS.MAX_EMAIL_POINTS *
    Math.min(1, safeSignals.emailCount / SCORING_WEIGHTS.EMAIL_SATURATION_THRESHOLD) *
    emailDecay;

  const meetingDecay = recencyDecay(safeSignals.lastMeetingAt);
  const meetingScore =
    SCORING_WEIGHTS.MAX_MEETING_POINTS *
    Math.min(1, safeSignals.meetingCount / SCORING_WEIGHTS.MEETING_SATURATION_THRESHOLD) *
    meetingDecay;

  const sourceScore = Math.min(
    SCORING_WEIGHTS.MAX_SOURCE_POINTS,
    safeSignals.sourcesPresent.length * SCORING_WEIGHTS.POINTS_PER_SOURCE
  );

  let importScore = 0;
  if (safeSignals.sourcesPresent.includes("linkedin_import")) {
    importScore = Math.max(importScore, Math.round(30 + 20 * recencyDecay(safeSignals.connectedOn)));
  }
  if (safeSignals.sourcesPresent.includes("facebook_import")) {
    importScore = Math.max(importScore, Math.round(25 + 15 * recencyDecay(safeSignals.connectedOn)));
  }
  if (safeSignals.sourcesPresent.includes("instagram_import")) {
    importScore = Math.max(importScore, 15);
  }
  if (safeSignals.sourcesPresent.includes("x_import")) {
    importScore = Math.max(importScore, 15);
  }

  const directnessBonus =
    safeSignals.directToRatio >= SCORING_WEIGHTS.DIRECTNESS_THRESHOLD
      ? SCORING_WEIGHTS.DIRECTNESS_BONUS_POINTS
      : 0;

  const sourceTerm = importScore > 0 ? importScore : sourceScore;
  const rawSum = emailScore + meetingScore + sourceTerm + directnessBonus;
  const strength = Math.min(100, Math.max(0, Math.round(rawSum)));

  // Generate clear human explanation
  const reasons: string[] = [];
  if (safeSignals.emailCount > 0) {
    reasons.push(`${safeSignals.emailCount} emails (decay ${(emailDecay * 100).toFixed(0)}%) contributing ${Math.round(emailScore)} pts`);
  }
  if (safeSignals.meetingCount > 0) {
    reasons.push(`${safeSignals.meetingCount} calendar meetings contributing ${Math.round(meetingScore)} pts`);
  }
  if (importScore > 0) {
    if (safeSignals.sourcesPresent.includes("linkedin_import")) {
      reasons.push(`LinkedIn connection contributing ${importScore} pts`);
    } else if (safeSignals.sourcesPresent.includes("facebook_import")) {
      reasons.push(`Facebook friendship contributing ${importScore} pts`);
    } else if (safeSignals.sourcesPresent.includes("instagram_import")) {
      reasons.push(`Instagram connection contributing ${importScore} pts`);
    } else if (safeSignals.sourcesPresent.includes("x_import")) {
      reasons.push(`X (Twitter) connection contributing ${importScore} pts`);
    }
  } else if (safeSignals.sourcesPresent.length > 0) {
    reasons.push(`Presence in ${safeSignals.sourcesPresent.join(", ")} contributing ${sourceScore} pts`);
  }
  if (directnessBonus > 0) {
    reasons.push(`Direct communication bonus (+${directnessBonus} pts, ${(safeSignals.directToRatio * 100).toFixed(0)}% direct)`);
  }
  if (reasons.length === 0) {
    reasons.push("No recorded interactions yet");
  }

  const explanation = `Score ${strength}/100 based on: ${reasons.join("; ")}.`;

  return {
    strength,
    evidence: {
      emailCount: safeSignals.emailCount,
      meetingCount: safeSignals.meetingCount,
      directInteractions: safeSignals.directInteractions ?? 0,
      ccInteractions: safeSignals.ccInteractions ?? 0,
      directToRatio: safeSignals.directToRatio,
      lastEmailAt: safeSignals.lastEmailAt,
      lastMeetingAt: safeSignals.lastMeetingAt,
      sourcesPresent: safeSignals.sourcesPresent,
      connectedOn: safeSignals.connectedOn ?? null,
    },
    breakdown: {
      emailScore: Math.round(emailScore),
      meetingScore: Math.round(meetingScore),
      sourceScore,
      importScore,
      directnessBonus,
    },
    explanation,
  };
}

/**
 * Computes the 0–100 connection strength score per LLD §4.1:
 *
 * email_score      = 40 · min(1, email_count / 25) · recency_decay(last_email_at)
 * meeting_score    = 30 · min(1, meeting_count / 8) · recency_decay(last_meeting_at)
 * source_score     = 10 per source present (max 20)
 * directness_bonus = +10 if user was direct To (not CC) in ≥30% of threads
 * strength         = clamp(round(sum), 0, 100)
 */
export function computeStrength(signals: Partial<SignalPayload> | null | undefined): number {
  return explainScore(signals).strength;
}

/**
 * Merges a partial signal update into an existing signal payload.
 * Used when processing incremental data (e.g., new emails discovered).
 */
export function mergeSignals(
  existing: Partial<SignalPayload> | null | undefined,
  update: Partial<SignalPayload> | null | undefined
): SignalPayload {
  const e = existing || {};
  const u = update || {};

  const merged: SignalPayload = {
    emailCount: Math.max(0, (e.emailCount || 0) + (u.emailCount || 0)),
    lastEmailAt: laterDate(e.lastEmailAt, u.lastEmailAt),
    meetingCount: Math.max(0, (e.meetingCount || 0) + (u.meetingCount || 0)),
    lastMeetingAt: laterDate(e.lastMeetingAt, u.lastMeetingAt),
    sourcesPresent: [
      ...new Set([
        ...(Array.isArray(e.sourcesPresent) ? e.sourcesPresent : []),
        ...(Array.isArray(u.sourcesPresent) ? u.sourcesPresent : []),
      ]),
    ],
    directToRatio: Math.min(1, Math.max(0, u.directToRatio ?? e.directToRatio ?? 0)),
    directInteractions: Math.max(0, (e.directInteractions || 0) + (u.directInteractions || 0)),
    ccInteractions: Math.max(0, (e.ccInteractions || 0) + (u.ccInteractions || 0)),
    connectedOn: u.connectedOn || e.connectedOn || null,
  };

  return merged;
}

function laterDate(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;

  const timeA = new Date(a).getTime();
  const timeB = new Date(b).getTime();

  if (isNaN(timeA) && isNaN(timeB)) return null;
  if (isNaN(timeA)) return b;
  if (isNaN(timeB)) return a;

  return timeA > timeB ? a : b;
}
