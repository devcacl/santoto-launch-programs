export function filterConfiguredTalkAttendance(attendance, talks) {
  const configuredTalkIds = new Set(talks.map((talk) => talk.id));
  return attendance.filter((entry) => configuredTalkIds.has(entry.talk_id));
}
