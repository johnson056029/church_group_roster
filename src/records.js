// Database IDs are stable; names remain a presentation concern in the legacy UI.
export const TABLES = ['members', 'groups', 'memberships', 'meetings', 'assignments', 'cycles', 'survey_responses', 'leave_requests', 'custom_surveys', 'notifications', 'group_documents'];
const copy = value => structuredClone(value);
const key = (...parts) => JSON.stringify(parts);
export const recordKey = row => `${row.table}:${row.id}`;

export function toRecords(state, users) {
  const rows = [];
  const ids = new Map(users.map(user => [user.name, user.id]));
  const memberId = name => {
    if (!name) return null;
    if (!ids.has(name)) throw new Error(`未知成員：${name}`);
    return ids.get(name);
  };
  const add = (table, id, group_id, member_id, data) => rows.push({table, id, group_id, member_id, data: copy(data)});
  for (const user of users) add('members', user.id, null, null, user);
  for (const [groupId, group] of Object.entries(state.groups)) {
    const {members, access, dates, assignments, leader, overseer, ...settings} = group;
    add('groups', groupId, null, null, {...settings, leader_id: memberId(leader), overseer_id: memberId(overseer)});
    for (const [name, role] of Object.entries(access)) add('memberships', key(groupId, memberId(name)), groupId, memberId(name), {role, listed: members.includes(name)});
    for (const [position, meeting] of dates.entries()) add('meetings', key(groupId, meeting.d), groupId, null, {...meeting, position});
    for (const [date, services] of Object.entries(assignments)) {
      for (const [service, name] of Object.entries(services)) add('assignments', key(groupId, date, service), groupId, memberId(name), {date, service});
    }
    add('cycles', groupId, groupId, null, state.cycles[groupId]);
    for (const [name, response] of Object.entries(state.prayerSurvey[groupId] || {})) add('survey_responses', key(groupId, state.cycles[groupId].next, memberId(name)), groupId, memberId(name), {cycle: state.cycles[groupId].next, response});
    for (const request of state.leaveRequests[groupId] || []) {
      const {from, substitute, ...rest} = request;
      add('leave_requests', key(groupId, request.id), groupId, memberId(from), {...rest, substitute_id: memberId(substitute)});
    }
    for (const field of ['customSurveys', 'notifications']) {
      for (const item of state[field][groupId] || []) add(field === 'customSurveys' ? 'custom_surveys' : 'notifications', key(groupId, item.id), groupId, null, item);
    }
    for (const field of ['scheduleStatus', 'prayerGroups', 'changeLogs', 'lineTemplates', 'prayerDraft', 'prayerFinal']) {
      add('group_documents', key(groupId, field), groupId, null, {field, value: state[field][groupId]});
    }
  }
  return rows;
}

export function fromRecords(rows) {
  const users = rows.filter(row => row.table === 'members').map(row => copy(row.data));
  const names = new Map(users.map(user => [user.id, user.name]));
  const state = Object.fromEntries(['groups', 'cycles', 'prayerSurvey', 'leaveRequests', 'customSurveys', 'notifications', 'scheduleStatus', 'prayerGroups', 'changeLogs', 'lineTemplates', 'prayerDraft', 'prayerFinal'].map(field => [field, {}]));
  for (const row of rows.filter(row => row.table === 'groups')) {
    const {leader_id, overseer_id, ...settings} = row.data;
    state.groups[row.id] = {...copy(settings), leader: names.get(leader_id), overseer: names.get(overseer_id), members: [], access: {}, dates: [], assignments: {}};
    for (const field of ['leaveRequests', 'customSurveys', 'notifications', 'prayerGroups', 'changeLogs', 'prayerDraft', 'prayerFinal']) state[field][row.id] = [];
    state.prayerSurvey[row.id] = {};
  }
  // Cycles must be loaded before responses regardless of database row order.
  for (const row of rows.filter(row => row.table === 'cycles')) state.cycles[row.group_id] = copy(row.data);
  for (const row of rows) {
    const group = state.groups[row.group_id];
    if (!group) continue;
    const name = names.get(row.member_id);
    const data = copy(row.data);
    switch (row.table) {
      case 'memberships': group.access[name] = data.role; if (data.listed) group.members.push(name); break;
      case 'meetings': group.dates.push(data); break;
      case 'assignments': (group.assignments[data.date] ||= {})[data.service] = name || ''; break;
      case 'survey_responses': if (data.cycle === state.cycles[row.group_id]?.next) state.prayerSurvey[row.group_id][name] = data.response; break;
      case 'leave_requests': {
        const {substitute_id, ...rest} = data;
        state.leaveRequests[row.group_id].push({...rest, from: name, substitute: names.get(substitute_id) || null}); break;
      }
      case 'custom_surveys': state.customSurveys[row.group_id].push(data); break;
      case 'notifications': state.notifications[row.group_id].push(data); break;
      case 'group_documents': if (Object.hasOwn(state, data.field)) state[data.field][row.group_id] = data.value; break;
    }
  }
  for (const group of Object.values(state.groups)) {
    group.dates.sort((a, b) => a.position - b.position);
    group.dates.forEach(date => { delete date.position; });
  }
  return {state, users};
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function diffRecords(before, after) {
  const old = new Map(before.map(row => [recordKey(row), row]));
  const next = new Map(after.map(row => [recordKey(row), row]));
  const changes = [];
  for (const [key, row] of next) if (!equal(old.get(key), row)) changes.push({table: row.table, id: row.id, before: old.get(key) || null, after: row});
  for (const [key, row] of old) if (!next.has(key)) changes.push({table: row.table, id: row.id, before: row, after: null});
  return changes;
}
export function applyChanges(rows, changes) {
  const records = new Map(rows.map(row => [recordKey(row), copy(row)]));
  for (const change of changes) {
    const key = `${change.table}:${change.id}`;
    if (!equal(records.get(key) || null, change.before)) throw new Error('資料已被其他人修改，請重新載入後再操作。');
    if (change.after) records.set(key, copy(change.after)); else records.delete(key);
  }
  return [...records.values()];
}
