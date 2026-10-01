const key = 'idc-brackets-v2';
const oldKey = 'rallyboard-v1';
const sample = ['Court Kings', 'The Dink Squad', 'Kitchen Crew', 'Net Results', 'Third Shot Club', 'Baseline Bandits', 'Paddle Power', 'The Lobsters'];
const $ = id => document.getElementById(id);
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const makeBracket = (name = 'Saturday Open') => ({ id: newId(), name, teams: [], rounds: [], poolRounds: [], format: 'single', stage: 'setup' });

let data;
try { data = JSON.parse(localStorage.getItem(key)); } catch {}
if (!data) {
  let previous;
  try { previous = JSON.parse(localStorage.getItem(oldKey)); } catch {}
  const first = makeBracket(previous?.name || 'Saturday Open');
  if (Array.isArray(previous?.teams) && Array.isArray(previous?.rounds)) {
    first.teams = previous.teams;
    first.rounds = previous.rounds;
  }
  data = { brackets: [first], activeId: first.id };
}
if (!Array.isArray(data.brackets) || !data.brackets.length) {
  const first = makeBracket();
  data = { brackets: [first], activeId: first.id };
}
data.brackets = data.brackets.filter(b => b && typeof b.id === 'string' && Array.isArray(b.teams) && Array.isArray(b.rounds));
if (!data.brackets.length) data.brackets = [makeBracket()];
for (const bracket of data.brackets) {
  bracket.format = bracket.format === 'round-robin' ? 'round-robin' : 'single';
  if (!Array.isArray(bracket.poolRounds)) bracket.poolRounds = [];
  if (!['setup', 'pool', 'playoff'].includes(bracket.stage)) bracket.stage = bracket.rounds.length ? 'playoff' : 'setup';
}
if (!data.brackets.some(b => b.id === data.activeId)) data.activeId = data.brackets[0].id;
let state = data.brackets.find(b => b.id === data.activeId);

function persist() { localStorage.setItem(key, JSON.stringify(data)); }
function clearMatches() { state.rounds = []; state.poolRounds = []; state.stage = 'setup'; }
function selectBracket(id) {
  state = data.brackets.find(b => b.id === id);
  data.activeId = id;
  $('formMessage').textContent = '';
  $('bracketMessage').textContent = '';
  render();
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 2500);
}
function elem(tag, cls = '', text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function roundName(i, total) {
  if (i === total - 1) return 'Final';
  if (i === total - 2) return 'Semifinals';
  if (i === total - 3) return 'Quarterfinals';
  return `Round ${i + 1}`;
}
function winner(match) {
  if (match.a === null || match.b === null) return match.a ?? match.b;
  if (match.sa === null || match.sb === null || match.sa === match.sb) return null;
  return match.sa > match.sb ? match.a : match.b;
}
function propagate() {
  for (let r = 1; r < state.rounds.length; r++) {
    for (let m = 0; m < state.rounds[r].length; m++) {
      const target = state.rounds[r][m];
      const a = winner(state.rounds[r - 1][m * 2]);
      const right = state.rounds[r - 1][m * 2 + 1];
      const b = right ? winner(right) : null;
      if (target.a !== a || target.b !== b) {
        target.a = a; target.b = b; target.sa = null; target.sb = null;
      }
    }
  }
}
function makeElimination(teams) {
  const size = 2 ** Math.ceil(Math.log2(teams.length));
  const slots = Array(size).fill(null);

  // Seed order:
  // 4 teams: 1 vs 4, 2 vs 3
  // 8 teams: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
  let seedOrder = [1];

  while (seedOrder.length < size) {
    const nextSize = seedOrder.length * 2;
    seedOrder = seedOrder.flatMap(seed => [
      seed,
      nextSize + 1 - seed
    ]);
  }

  seedOrder.forEach((seed, position) => {
    slots[position] = teams[seed - 1] ?? null;
  });

  const firstRound = [];

  for (let i = 0; i < size; i += 2) {
    firstRound.push({
      a: slots[i],
      b: slots[i + 1],
      sa: null,
      sb: null
    });
  }

  state.rounds = [firstRound];

  let matchCount = firstRound.length;

  while (matchCount > 1) {
    matchCount /= 2;

    state.rounds.push(
      Array.from({ length: matchCount }, () => ({
        a: null,
        b: null,
        sa: null,
        sb: null
      }))
    );
  }

  propagate();
}
// function makeElimination(teams) {
//   const size = 2 ** Math.ceil(Math.log2(teams.length));
//   const slots = [...teams, ...Array(size - teams.length).fill(null)];
//   const first = [];
//   for (let i = 0; i < size / 2; i++) {
//     first.push({ a: slots[i], b: slots[size - 1 - i], sa: null, sb: null });
//   }
//   state.rounds = [first];
//   let count = first.length;
//   while (count > 1) {
//     count /= 2;
//     state.rounds.push(Array.from({ length: count }, () => ({ a: null, b: null, sa: null, sb: null })));
//   }
//   propagate();
// }
function makeRoundRobin(teams) {
  const rotation = [...teams];
  if (rotation.length % 2) rotation.push(null);
  const rounds = [];
  for (let r = 0; r < rotation.length - 1; r++) {
    const matches = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const a = rotation[i], b = rotation[rotation.length - 1 - i];
      if (a !== null && b !== null) matches.push({ a, b, sa: null, sb: null });
    }
    rounds.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }
  return rounds;
}
function poolComplete() {
  return state.poolRounds.length > 0 && state.poolRounds.every(round => round.every(match => match.sa !== null && match.sb !== null));
}
function standings() {
  const rows = state.teams.map(name => ({ name, played: 0, wins: 0, losses: 0, for: 0, against: 0 }));
  const byName = new Map(rows.map(row => [row.name, row]));
  for (const round of state.poolRounds) {
    for (const match of round) {
      if (match.sa === null || match.sb === null) continue;
      const a = byName.get(match.a), b = byName.get(match.b);
      if (!a || !b) continue;
      a.played++; b.played++;
      a.for += match.sa; a.against += match.sb;
      b.for += match.sb; b.against += match.sa;
      if (match.sa > match.sb) { a.wins++; b.losses++; }
      else { b.wins++; a.losses++; }
    }
  }
  return rows.sort((a, b) => b.wins - a.wins || (b.for - b.against) - (a.for - a.against) || b.for - a.for || a.name.localeCompare(b.name));
}
function scoreCard(match, label, locked = false, roundIndex = 0) {
  const card = elem('div', 'match');
  card.append(elem('div', 'match-label', label));
  const inputs = [];
  for (const [index, side] of ['a', 'b'].entries()) {
    const row = elem('div', 'side');
    const name = match[side];
    if (name === null) row.classList.add('muted');
    if (name !== null && match.sa !== null && match.sb !== null && winner(match) === name) row.classList.add('winner');
    row.append(elem('span', 'side-name', name ?? (roundIndex === 0 ? 'BYE' : 'Awaiting winner')));
    const input = elem('input', 'score');
    input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*'; input.maxLength = 2;
    input.value = match[index === 0 ? 'sa' : 'sb'] ?? '';
    input.disabled = locked || match.a === null || match.b === null;
    input.setAttribute('aria-label', `${name || 'Awaiting team'} score`);
    inputs.push(input); row.append(input); card.append(row);
  }
  if (!locked && match.a !== null && match.b !== null) {
    const actions = elem('div', 'match-actions');
    const save = elem('button', 'save-score', 'Save score');
    save.type = 'button';
    save.onclick = () => {
      const values = inputs.map(input => input.value.trim());
      if (values.some(value => !/^(0|[1-9][0-9]?)$/.test(value)) || values[0] === values[1]) {
        toast('Enter two different scores from 0 to 99.'); return;
      }
      match.sa = Number(values[0]); match.sb = Number(values[1]);
      if (state.rounds.some(round => round.includes(match))) propagate();
      render(); toast('Score saved');
    };
    actions.append(save); card.append(actions);
  }
  return card;
}
function renderPool(area) {
  const wrap = elem('div', 'pool-view');
  wrap.append(elem('h3', '', 'Round robin'));
  wrap.append(elem('p', 'pool-help', state.stage === 'playoff'
    ? 'Round robin results are locked after elimination begins.'
    : 'Every team plays each other once. Ranking: wins, point difference, then points scored.'));
  const scroll = elem('div', 'standings-scroll');
  const table = elem('table', 'standings');
  const head = elem('thead');
  const headingRow = elem('tr');
  for (const label of ['Rank', 'Team', 'Played', 'W', 'L', 'Diff']) headingRow.append(elem('th', '', label));
  head.append(headingRow); table.append(head);
  const body = elem('tbody');
  const qualifying = state.teams.length >= 4 ? 4 : 2;
  standings().forEach((row, index) => {
    const tr = elem('tr', index < qualifying ? 'qualifier' : '');
    for (const value of [index + 1, row.name, row.played, row.wins, row.losses, row.for - row.against]) tr.append(elem('td', '', String(value)));
    body.append(tr);
  });
  table.append(body); scroll.append(table); wrap.append(scroll);
  state.poolRounds.forEach((round, index) => {
    const section = elem('section', 'pool-round');
    section.append(elem('h4', '', `Round robin · Round ${index + 1}`));
    const list = elem('div', 'pool-round-list');
    round.forEach((match, matchIndex) => list.append(scoreCard(match, `Match ${matchIndex + 1}`, state.stage === 'playoff')));
    section.append(list); wrap.append(section);
  });
  area.append(wrap);
}
function renderElimination(area) {
  if (state.format === 'round-robin') area.append(elem('h3', 'playoff-title', 'Elimination round'));
  const bracket = elem('div', 'bracket');
  state.rounds.forEach((round, ri) => {
    const column = elem('div', 'round');
    column.append(elem('div', 'round-title', roundName(ri, state.rounds.length)));
    const matches = elem('div', 'round-list');
    round.forEach((match, mi) => matches.append(scoreCard(match, `Match ${mi + 1}`, false, ri)));
    column.append(matches); bracket.append(column);
  });
  area.append(bracket);
  const final = state.rounds.at(-1)[0], champion = winner(final);
  if (champion && final.sa !== null && final.sb !== null) $('champion').append(elem('div', 'champion', `🏆 Champion · ${champion}`));
}
function render() {
  persist();
  const selector = $('bracketSelect'); selector.replaceChildren();
  data.brackets.forEach(b => { const option = elem('option', '', b.name || 'Untitled bracket'); option.value = b.id; selector.append(option); });
  selector.value = data.activeId;
  $('bracketCount').textContent = `${data.brackets.length} bracket${data.brackets.length === 1 ? '' : 's'}`;
  $('deleteBracket').disabled = data.brackets.length === 1;
  $('displayName').textContent = state.name || 'Untitled bracket';
  $('tournamentName').value = state.name;
  $('formatSelect').value = state.format;
  $('formatHint').textContent = state.format === 'round-robin'
    ? 'Everyone plays everyone once; the top four advance (top two with fewer than four teams).'
    : 'One winning team advances from each match.';
  $('teamCount').textContent = `${state.teams.length} team${state.teams.length === 1 ? '' : 's'}`;
  $('generate').disabled = state.teams.length < 2;
  $('generate').textContent = state.format === 'round-robin' ? 'Generate round robin' : 'Generate bracket';
  $('status').textContent = state.stage === 'pool' ? 'Round robin live' : state.rounds.length ? 'Elimination live' : 'Setup in progress';
  $('bracketSummary').textContent = state.stage === 'pool'
    ? `${state.teams.length} teams · ${state.poolRounds.length} round robin rounds`
    : state.rounds.length ? `${state.teams.length} teams · ${state.rounds.length} elimination rounds` : 'Add teams to get started.';
  $('startPlayoffs').hidden = !(state.format === 'round-robin' && state.stage === 'pool' && poolComplete());
  const list = $('teamList'); list.replaceChildren();
  state.teams.forEach((name, index) => {
    const item = elem('li', 'team');
    item.append(elem('span', 'seed', String(index + 1)), elem('span', 'team-name', name));
    const remove = elem('button', 'remove', '×'); remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.onclick = () => { if ((state.rounds.length || state.poolRounds.length) && !confirm('Removing a team will clear this bracket’s matches and scores. Continue?')) return; state.teams.splice(index, 1); clearMatches(); render(); };
    item.append(remove); list.append(item);
  });
  const area = $('bracketArea'); area.replaceChildren(); $('champion').replaceChildren();
  if (state.format === 'round-robin' && state.poolRounds.length) renderPool(area);
  if (state.rounds.length) renderElimination(area);
  else if (!state.poolRounds.length) {
    const empty = elem('div', 'empty');
    empty.innerHTML = '<div class="empty-icon" aria-hidden="true">◉</div><h3>Your bracket starts here</h3><p>Add your teams, then generate the matches.</p>';
    area.append(empty);
  }
}

$('bracketSelect').onchange = event => selectBracket(event.target.value);
$('newBracketForm').onsubmit = event => {
  event.preventDefault();
  const input = $('newBracketName'), name = input.value.trim(), message = $('bracketMessage');
  message.textContent = '';
  if (!name) return;
  if (data.brackets.some(b => b.name.toLowerCase() === name.toLowerCase())) { message.textContent = 'A bracket with that name already exists.'; return; }
  const next = makeBracket(name); data.brackets.push(next); input.value = ''; selectBracket(next.id); toast('Bracket created');
};
$('deleteBracket').onclick = () => {
  if (data.brackets.length < 2) return;
  if (!confirm(`Delete "${state.name || 'Untitled bracket'}" and all its teams and scores?`)) return;
  data.brackets = data.brackets.filter(b => b.id !== state.id);
  selectBracket(data.brackets[0].id); toast('Bracket deleted');
};
$('tournamentName').oninput = event => {
  state.name = event.target.value.trimStart().slice(0, 60);
  $('displayName').textContent = state.name || 'Untitled bracket';
  $('bracketSelect').selectedOptions[0].textContent = state.name || 'Untitled bracket';
  persist();
};
$('formatSelect').onchange = event => {
  if ((state.rounds.length || state.poolRounds.length) && !confirm('Changing format will clear the matches and scores in this bracket. Continue?')) {
    event.target.value = state.format; return;
  }
  state.format = event.target.value; clearMatches(); render();
};
$('addForm').onsubmit = event => {
  event.preventDefault();
  const name = $('teamInput').value.trim(), message = $('formMessage'); message.textContent = '';
  if (!name) return;
  if (state.teams.length >= 16) { message.textContent = 'Maximum of 16 teams.'; return; }
  if (state.teams.some(team => team.toLowerCase() === name.toLowerCase())) { message.textContent = 'That team is already listed.'; return; }
  if ((state.rounds.length || state.poolRounds.length) && !confirm('Adding a team will clear this bracket’s matches and scores. Continue?')) return;
  state.teams.push(name); clearMatches(); $('teamInput').value = ''; render(); $('teamInput').focus();
};
$('generate').onclick = () => {
  if (state.teams.length < 2) return;
  if ((state.rounds.length || state.poolRounds.length) && !confirm('Regenerate matches and clear scores in this bracket?')) return;
  clearMatches();
  if (state.format === 'round-robin') {
    state.poolRounds = makeRoundRobin(state.teams);
    state.stage = 'pool';
  } else {
    makeElimination(state.teams);
    state.stage = 'playoff';
  }
  render(); toast('Matches generated');
};
$('startPlayoffs').onclick = () => {
  if (state.format !== 'round-robin' || state.stage !== 'pool' || !poolComplete()) return;
  const count = state.teams.length >= 4 ? 4 : 2;
  makeElimination(standings().slice(0, count).map(row => row.name));
  state.stage = 'playoff'; render(); toast('Elimination round started');
};
// $('demo').onclick = () => {
//   if ((state.teams.length || state.poolRounds.length || state.rounds.length) && !confirm('Replace teams and scores in the current bracket with sample teams?')) return;
//   state.teams = [...sample]; clearMatches(); $('formMessage').textContent = ''; render(); $('generate').click();
// };
$('reset').onclick = () => {
  if ((state.teams.length || state.poolRounds.length || state.rounds.length) && !confirm('Clear teams and scores in the current bracket?')) return;
  state.teams = []; clearMatches(); $('formMessage').textContent = ''; render(); toast('Current bracket reset');
};
render();
