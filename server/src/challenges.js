import { z } from 'zod';

/** Validate challenge answers against server-owned event rules. */
export function validChallengeAnswer(challenge, rawAnswer) {
  const rules = challenge.rules || {};
  const items = challenge.items || [];
  const knownIds = new Set(items.map((item) => item.id));

  if (challenge.type === 'builder' || challenge.type === 'market') {
    const parsed = z.array(z.string().max(60)).min(1).max(items.length).safeParse(rawAnswer);
    if (!parsed.success || new Set(parsed.data).size !== parsed.data.length || parsed.data.some((id) => !knownIds.has(id))) return false;
    const selected = parsed.data.map((id) => items.find((item) => item.id === id));
    if (selected.length < rules.minItems || (rules.maxItems && selected.length > rules.maxItems)) return false;
    if (rules.requiredGroups && !rules.requiredGroups.every((group) => selected.some((item) => item.group === group))) return false;
    if (challenge.type === 'market') {
      const total = selected.reduce((sum, item) => sum + item.cost, 0);
      if (total > rules.budget) return false;
    }
    return true;
  }

  if (challenge.type === 'sequence') {
    const parsed = z.array(z.string().max(60)).length(items.length).safeParse(rawAnswer);
    return parsed.success && parsed.data.every((id, index) => id === rules.expectedOrder[index]);
  }

  if (challenge.type === 'match') {
    const expected = rules.expectedPairs || {};
    const parsed = z.record(z.string().max(60), z.string().max(60)).safeParse(rawAnswer);
    const leftIds = challenge.pairs.map((pair) => pair.id);
    const rightIds = new Set(challenge.options.map((option) => option.id));
    if (!parsed.success || Object.keys(parsed.data).length !== leftIds.length || leftIds.some((id) => !(id in parsed.data))) return false;
    const matches = Object.values(parsed.data);
    return new Set(matches).size === matches.length
      && matches.every((id) => rightIds.has(id))
      && leftIds.every((id) => parsed.data[id] === expected[id]);
  }

  if (challenge.type === 'detective') {
    return typeof rawAnswer === 'string' && items.some((item) => item.id === rawAnswer) && rawAnswer === rules.answerId;
  }

  if (challenge.type === 'allocation') {
    const parsed = z.record(z.string().max(60), z.number().int().min(0).max(rules.maxPerBucket)).safeParse(rawAnswer);
    if (!parsed.success) return false;
    const ids = challenge.buckets.map((bucket) => bucket.id);
    if (Object.keys(parsed.data).length !== ids.length || ids.some((id) => !(id in parsed.data))) return false;
    const total = Object.values(parsed.data).reduce((sum, value) => sum + value, 0);
    return total === rules.total && Object.entries(rules.minByBucket).every(([id, minimum]) => parsed.data[id] >= minimum);
  }

  if (challenge.type === 'headline') return typeof rawAnswer === 'string' && rawAnswer === rules.headline;
  return false;
}
