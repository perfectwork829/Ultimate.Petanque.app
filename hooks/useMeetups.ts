/**
 * useMeetups — Shared hook for loading meetups data.
 * Eliminates duplicate loadMeetups logic between index.tsx and history.tsx.
 */
import { useState, useCallback, useEffect } from 'react';
import { getMyMeetups, getInvitedMeetups, getMeetupResponses, Meetup, MeetupResponse } from '@/services/meetupService';

export type MeetupWithMeta = Meetup & { _source: 'created' | 'invited'; _acceptedCount?: number };

export function useMeetups() {
  const [allMeetups, setAllMeetups] = useState<MeetupWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMeetups = useCallback(async () => {
    try {
      const [{ meetups: created }, { meetups: invited }] = await Promise.all([
        getMyMeetups(),
        getInvitedMeetups(),
      ]);
      const allMap = new Map<string, MeetupWithMeta>();
      created.forEach(m => allMap.set(m.id, { ...m, _source: 'created' }));
      invited.forEach(m => {
        if (!allMap.has(m.id)) allMap.set(m.id, { ...m, _source: 'invited' });
      });
      const sorted = Array.from(allMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const withCounts = await Promise.all(
        sorted.map(async (m) => {
          const { responses } = await getMeetupResponses(m.id);
          const acceptedCount = responses.filter((r: MeetupResponse) => r.status === 'accepted').length;
          return { ...m, _acceptedCount: acceptedCount };
        })
      );
      setAllMeetups(withCounts);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMeetups(); }, [loadMeetups]);

  return { allMeetups, meetupsLoading: loading, loadMeetups };
}
