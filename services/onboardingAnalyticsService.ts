/**
 * Onboarding Analytics Service
 *
 * Tracks each onboarding step (enter, complete, skip) with timestamps.
 * Provides aggregate analytics for admin dashboard.
 */

import { getSupabaseClient } from '@/template';

// Step order:
// 0: Splash, 1: Language, 2: Promise, 3: Sponsor,
// 4: Leagues, 5: TrustScore, 6: Features, 7: Map,
// 8: Login CTA, 9: Profile, 10: Referral
const STEP_NAMES: Record<number, string> = {
  0: 'splash',
  1: 'language',
  2: 'promise',
  3: 'sponsor',
  4: 'leagues',
  5: 'trustscore',
  6: 'features',
  7: 'map',
  8: 'login_cta',
  9: 'profile',
  10: 'referral',
};

/**
 * Track an onboarding step event (non-blocking).
 */
export async function trackOnboardingStep(params: {
  sessionId: string;
  userId?: string;
  stepNumber: number;
  stepName?: string;
  action: 'enter' | 'complete' | 'skip';
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('onboarding_step_logs').insert({
      session_id: params.sessionId,
      user_id: params.userId || null,
      step_number: params.stepNumber,
      step_name: params.stepName || STEP_NAMES[params.stepNumber] || `step_${params.stepNumber}`,
      action: params.action,
    });
  } catch {
    // Non-blocking, silent failure
  }
}

export interface StepAnalytics {
  step: number;
  name: string;
  entered: number;
  completed: number;
  skipped: number;
  avgDurationSec: number;
  dropoffRate: number;
}

export interface OnboardingAnalytics {
  steps: StepAnalytics[];
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  avgTotalDurationSec: number;
  topDropoffStep: string | null;
}

/**
 * Get detailed onboarding step analytics for admin dashboard.
 */
export async function getOnboardingStepAnalytics(): Promise<OnboardingAnalytics> {
  const empty: OnboardingAnalytics = {
    steps: [],
    totalSessions: 0,
    completedSessions: 0,
    completionRate: 0,
    avgTotalDurationSec: 0,
    topDropoffStep: null,
  };

  try {
    const supabase = getSupabaseClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('onboarding_step_logs')
      .select('session_id, step_number, step_name, action, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) return empty;

    // Build session maps: session_id -> step_number -> { enter, complete, skip timestamps }
    const sessionMap = new Map<string, Map<number, { enter?: string; complete?: string; skip?: string; name?: string }>>();

    data.forEach((l: any) => {
      if (!sessionMap.has(l.session_id)) sessionMap.set(l.session_id, new Map());
      const session = sessionMap.get(l.session_id)!;
      if (!session.has(l.step_number)) session.set(l.step_number, { name: l.step_name });
      const step = session.get(l.step_number)!;
      if (!step.name) step.name = l.step_name;
      (step as any)[l.action] = l.created_at;
    });

    const stepLabels: Record<number, string> = {
      0: 'Splash', 1: 'Language', 2: 'Promise', 3: 'Sponsor',
      4: 'ELO Leagues', 5: 'TrustScore & Anti-cheat', 6: 'Features', 7: 'Map Discovery', 8: 'Login CTA', 9: 'Express Profile', 10: 'Referral',
    };

    const steps: StepAnalytics[] = [];
    let worstDropoff = 0;
    let worstDropoffName: string | null = null;

    for (let i = 0; i <= 10; i++) {
      let entered = 0;
      let completed = 0;
      let skipped = 0;
      let totalDuration = 0;
      let durationCount = 0;

      sessionMap.forEach((session) => {
        const step = session.get(i);
        if (!step) return;
        if (step.enter) entered++;
        if (step.complete) {
          completed++;
          if (step.enter) {
            const dur = (new Date(step.complete).getTime() - new Date(step.enter).getTime()) / 1000;
            if (dur > 0 && dur < 600) {
              totalDuration += dur;
              durationCount++;
            }
          }
        }
        if (step.skip) skipped++;
      });

      const dropoffRate = entered > 0 ? Math.round(((entered - completed - skipped) / entered) * 100) : 0;
      if (entered > 3 && dropoffRate > worstDropoff) {
        worstDropoff = dropoffRate;
        worstDropoffName = stepLabels[i] || `Step ${i}`;
      }

      steps.push({
        step: i,
        name: stepLabels[i] || `Step ${i}`,
        entered,
        completed,
        skipped,
        avgDurationSec: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        dropoffRate,
      });
    }

    const totalSessions = sessionMap.size;
    const completedSessions = [...sessionMap.values()].filter(s => {
      const lastStep = s.get(9) || s.get(8);
      return lastStep && (lastStep.enter || lastStep.complete);
    }).length;

    // Average total duration (from step 1 enter to step 8 enter/complete)
    let totalDurationSum = 0;
    let totalDurationCount = 0;
    sessionMap.forEach((session) => {
      const firstStep = session.get(1);
      const lastStep = session.get(9) || session.get(8) || session.get(7);
      if (firstStep?.enter && lastStep) {
        const end = lastStep.complete || lastStep.enter;
        if (end) {
          const dur = (new Date(end).getTime() - new Date(firstStep.enter).getTime()) / 1000;
          if (dur > 0 && dur < 3600) {
            totalDurationSum += dur;
            totalDurationCount++;
          }
        }
      }
    });

    return {
      steps,
      totalSessions,
      completedSessions,
      completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
      avgTotalDurationSec: totalDurationCount > 0 ? Math.round(totalDurationSum / totalDurationCount) : 0,
      topDropoffStep: worstDropoffName,
    };
  } catch {
    return empty;
  }
}
