const key = 'idc-categories-v3';
const previousKey = 'idc-brackets-v2';
const oldKey = 'rallyboard-v1';

const sample = [
  'Court Kings',
  'The Dink Squad',
  'Kitchen Crew',
  'Net Results',
  'Third Shot Club',
  'Baseline Bandits',
  'Paddle Power',
  'The Lobsters'
];

const $ = id => document.getElementById(id);

const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const makeBracket = (name = 'Saturday Open') => ({
  id: newId(),
  name,
  teams: [],
  rounds: [],
  poolRounds: [],
  format: 'round-robin',
  stage: 'setup'
});

// Load saved data or migrate the previous bracket.
let data;

try {
  data = JSON.parse(localStorage.getItem(key) || localStorage.getItem(previousKey));
} catch {}

if (!data) {
  let previous;

  try {
    previous = JSON.parse(localStorage.getItem(oldKey));
  } catch {}

  const first = makeBracket(previous?.name || 'Saturday Open');

  if (Array.isArray(previous?.teams) && Array.isArray(previous?.rounds)) {
    first.teams = previous.teams;
    first.rounds = previous.rounds;
  }

  data = {
    brackets: [first],
    activeId: first.id
  };
}

if (!Array.isArray(data.brackets) || !data.brackets.length) {
  const first = makeBracket();

  data = {
    brackets: [first],
    activeId: first.id
  };
}

data.brackets = data.brackets.filter(
  bracket =>
    bracket &&
    typeof bracket.id === 'string' &&
    Array.isArray(bracket.teams) &&
    Array.isArray(bracket.rounds)
);

if (!data.brackets.length) {
  data.brackets = [makeBracket()];
}

for (const bracket of data.brackets) {
  bracket.format =
    bracket.format === 'round-robin' ? 'round-robin' : 'single';

  if (!Array.isArray(bracket.poolRounds)) {
    bracket.poolRounds = [];
  }

  if (!['setup', 'pool', 'playoff'].includes(bracket.stage)) {
    bracket.stage = bracket.rounds.length ? 'playoff' : 'setup';
  }
}

if (!data.brackets.some(bracket => bracket.id === data.activeId)) {
  data.activeId = data.brackets[0].id;
}

// Existing brackets are grouped into one category without deleting old saved data.
if (!Array.isArray(data.categories) || !data.categories.length) {
  data.categories = [{ id: newId(), name: 'Main category', rounds: [] }];
}
for (const c of data.categories) {
  c.rounds ||= [];
  c.teams ||= [];
}
for (const b of data.brackets) {
  b.categoryId ||= data.categories[0].id;
  b.tieOrder ||= [];
  if (!data.categories.some(c => c.id === b.categoryId)) b.categoryId = data.categories[0].id;
}
const activeCategory = () => data.categories.find(c => c.id === state.categoryId);
const categoryBrackets = () => data.brackets.filter(b => b.categoryId === state.categoryId);
const categoryLocked = () => activeCategory().rounds.length > 0;

let state = data.brackets.find(bracket => bracket.id === data.activeId);

// General helpers
function persist() {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { toast('Saving failed. Export a backup before closing.'); }
}

function clearMatches() {
  state.rounds = [];
  state.poolRounds = [];
  state.stage = 'setup';
  state.tieOrder = [];
}

function selectBracket(id) {
  state = data.brackets.find(bracket => bracket.id === id);
  data.activeId = id;

  $('formMessage').textContent = '';
  $('bracketMessage').textContent = '';

  render();
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    $('toast').classList.remove('show');
  }, 2500);
}

function elem(tag, cls = '', text) {
  const node = document.createElement(tag);

  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;

  return node;
}

function roundName(index, total) {
  if (index === total - 1) return 'Final';
  if (index === total - 2) return 'Semifinals';
  if (index === total - 3) return 'Quarterfinals';

  return `Round ${index + 1}`;
}

function winner(match) {
  if (match.pending) return null;
  if (match.a === null || match.b === null) {
    return match.a ?? match.b;
  }

  if (
    match.sa === null ||
    match.sb === null ||
    match.sa === match.sb
  ) {
    return null;
  }

  return match.sa > match.sb ? match.a : match.b;
}

function settled(match) {
  return !match.pending && (match.a === null || match.b === null ||
    (match.sa !== null && match.sb !== null && match.sa !== match.sb));
}

// Elimination bracket
function propagate(owner = state) {
  for (let roundIndex = 1; roundIndex < owner.rounds.length; roundIndex++) {
    for (
      let matchIndex = 0;
      matchIndex < owner.rounds[roundIndex].length;
      matchIndex++
    ) {
      const target = owner.rounds[roundIndex][matchIndex];
      const previousRound = owner.rounds[roundIndex - 1];

      const a = winner(previousRound[matchIndex * 2]);
      const right = previousRound[matchIndex * 2 + 1];
      const b = right ? winner(right) : null;

      target.pending = !settled(previousRound[matchIndex * 2]) || (right && !settled(right));
      if (target.a !== a || target.b !== b || target.pending) {
        target.a = a;
        target.b = b;
        target.sa = null;
        target.sb = null;
      }
    }
  }
}

function makeElimination(teams) {
  const size = 2 ** Math.ceil(Math.log2(teams.length));
  const slots = Array(size).fill(null);

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

  for (let index = 0; index < size; index += 2) {
    firstRound.push({
      a: slots[index],
      b: slots[index + 1],
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

// Round robin
function makeRoundRobin(teams) {
  const rotation = [...teams];

  if (rotation.length % 2) {
    rotation.push(null);
  }

  const rounds = [];

  for (let roundIndex = 0; roundIndex < rotation.length - 1; roundIndex++) {
    const matches = [];

    for (let index = 0; index < rotation.length / 2; index++) {
      const a = rotation[index];
      const b = rotation[rotation.length - 1 - index];

      if (a !== null && b !== null) {
        matches.push({
          a,
          b,
          sa: null,
          sb: null
        });
      }
    }

    rounds.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }

  return rounds;
}

function poolComplete(bracket = state) {
  return (
    bracket.poolRounds.length > 0 &&
    bracket.poolRounds.every(round =>
      round.every(
        match => match.sa !== null && match.sb !== null
      )
    )
  );
}

function standings(bracket = state) {
  const rows = bracket.teams.map(name => ({
    name,
    played: 0,
    wins: 0,
    losses: 0,
    for: 0,
    against: 0
  }));

  const byName = new Map(
    rows.map(row => [row.name, row])
  );

  for (const round of bracket.poolRounds) {
    for (const match of round) {
      if (match.sa === null || match.sb === null) continue;

      const a = byName.get(match.a);
      const b = byName.get(match.b);

      if (!a || !b) continue;

      a.played++;
      b.played++;

      a.for += match.sa;
      a.against += match.sb;

      b.for += match.sb;
      b.against += match.sa;

      if (match.sa > match.sb) {
        a.wins++;
        b.losses++;
      } else {
        b.wins++;
        a.losses++;
      }
    }
  }

  return rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      (b.for - b.against) - (a.for - a.against) ||
      b.for - a.for ||
      (bracket.tieOrder.indexOf(a.name) < 0 ? 999 : bracket.tieOrder.indexOf(a.name)) -
      (bracket.tieOrder.indexOf(b.name) < 0 ? 999 : bracket.tieOrder.indexOf(b.name)) ||
      a.name.localeCompare(b.name)
  );
}

// Match and bracket display
function scoreCard(match, label, locked = false, roundIndex = 0) {
  const owner = state;
  const card = elem('div', 'match');
  card.append(elem('div', 'match-label', label));

  const inputs = [];

  for (const [index, side] of ['a', 'b'].entries()) {
    const row = elem('div', 'side');
    const name = match[side];

    if (name === null) {
      row.classList.add('muted');
    }

    if (
      name !== null &&
      match.sa !== null &&
      match.sb !== null &&
      winner(match) === name
    ) {
      row.classList.add('winner');
    }

    row.append(
      elem(
        'span',
        'side-name',
        name ?? (roundIndex === 0 ? 'BYE' : 'Awaiting winner')
      )
    );

    const input = elem('input', 'score');

    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.maxLength = 2;
    input.value = match[index === 0 ? 'sa' : 'sb'] ?? '';
    input.disabled =
      locked || match.pending || match.a === null || match.b === null;

    input.setAttribute(
      'aria-label',
      `${name || 'Awaiting team'} score`
    );

    inputs.push(input);
    row.append(input);
    card.append(row);
  }

  if (!locked && !match.pending && match.a !== null && match.b !== null) {
    const actions = elem('div', 'match-actions');
    const save = elem('button', 'save-score', 'Save score');

    save.type = 'button';

    save.onclick = () => {
      const values = inputs.map(input => input.value.trim());

      if (
        values.some(value => !/^(0|[1-9][0-9]?)$/.test(value)) ||
        values[0] === values[1]
      ) {
        toast('Enter two different scores from 0 to 99.');
        return;
      }

      match.sa = Number(values[0]);
      match.sb = Number(values[1]);

      if (owner.rounds.some(round => round.includes(match))) {
        propagate(owner);
      } else { owner.tieOrder = []; }

      render();
      toast('Score saved');
    };

    actions.append(save);
    card.append(actions);
  }

  return card;
}

function renderPool(area) {
  const wrap = elem('div', 'pool-view');

  wrap.append(elem('h3', '', 'Round robin'));

  wrap.append(
    elem(
      'p',
      'pool-help',
      categoryLocked()
        ? 'Round robin results are locked after elimination begins.'
        : 'Every team plays each other once. Ranking: wins, point difference, then points scored.'
    )
  );

  const scroll = elem('div', 'standings-scroll');
  const table = elem('table', 'standings');
  const head = elem('thead');
  const headingRow = elem('tr');

  for (const label of [
    'Rank',
    'Team',
    'Played',
    'W',
    'L',
    'Diff'
  ]) {
    headingRow.append(elem('th', '', label));
  }

  head.append(headingRow);
  table.append(head);

  const body = elem('tbody');
  const qualifying = 2;

  standings().forEach((row, index) => {
    const tr = elem(
      'tr',
      index < qualifying ? 'qualifier' : ''
    );

    for (const value of [
      index + 1,
      row.name,
      row.played,
      row.wins,
      row.losses,
      row.for - row.against
    ]) {
      tr.append(elem('td', '', String(value)));
    }

    body.append(tr);
  });

  table.append(body);
  scroll.append(table);
  wrap.append(scroll);
  const tieButton = elem('button', 'btn btn-outline', 'Resolve statistical ties');
  tieButton.disabled = categoryLocked();
  tieButton.onclick = () => {
    const rows = standings();
    const response = prompt('Enter every team’s rank number in your chosen order, separated by commas. This order applies only to identical ranking statistics.\n' + rows.map((r, i) => `${i + 1}. ${r.name}`).join('\n'));
    if (response === null) return;
    const order = response.split(',').map(x => Number(x.trim()));
    if (order.length !== rows.length || new Set(order).size !== rows.length || order.some(n => !Number.isInteger(n) || n < 1 || n > rows.length)) return toast('Enter each listed rank number exactly once.');
    state.tieOrder = order.map(n => rows[n - 1].name);
    render();
  };
  wrap.append(tieButton);

  state.poolRounds.forEach((round, index) => {
    const section = elem('section', 'pool-round');

    section.append(
      elem('h4', '', `Round robin · Round ${index + 1}`)
    );

    const list = elem('div', 'pool-round-list');

    round.forEach((match, matchIndex) => {
      list.append(
        scoreCard(
          match,
          `Match ${matchIndex + 1}`,
          categoryLocked()
        )
      );
    });

    section.append(list);
    wrap.append(section);
  });

  area.append(wrap);
}

function renderElimination(area) {
  if (state.format === 'round-robin') {
    area.append(
      elem('h3', 'playoff-title', 'Elimination round')
    );
  }

  const bracket = elem('div', 'bracket');

  state.rounds.forEach((round, roundIndex) => {
    const column = elem('div', 'round');

    column.append(
      elem(
        'div',
        'round-title',
        roundName(roundIndex, state.rounds.length)
      )
    );

    const matches = elem('div', 'round-list');

    round.forEach((match, matchIndex) => {
      matches.append(
        scoreCard(
          match,
          `Match ${matchIndex + 1}`,
          false,
          roundIndex
        )
      );
    });

    column.append(matches);
    bracket.append(column);
  });

  area.append(bracket);

  const final = state.rounds.at(-1)[0];
  const champion = winner(final);

  if (
    champion &&
    final.sa !== null &&
    final.sb !== null
  ) {
    $('champion').append(
      elem('div', 'champion', `🏆 Champion · ${champion}`)
    );
  }
}

function render() {
  persist();
  const c = activeCategory();
  const categorySelector = $('categorySelect');
  const reopenButton = document.getElementById('reopenPools');
  categorySelector.replaceChildren();
  data.categories.forEach(category => {
    const option = elem('option', '', category.name);
    option.value = category.id;
    categorySelector.append(option);
  });
  categorySelector.value = c.id;
  $('categoryName').value = c.name;
  $('categorySummary').textContent = `${c.name} · ${categoryBrackets().length} brackets · top 2 from each qualify`;
  $('reopenPools').hidden = !categoryLocked();
  $('formatSelect').disabled = categoryLocked();
  $('newBracketForm').querySelector('button').disabled = categoryLocked();
  $('addForm').querySelector('button').disabled = categoryLocked();

  const selector = $('bracketSelect');
  selector.replaceChildren();

  categoryBrackets().forEach(bracket => {
    const option = elem(
      'option',
      '',
      bracket.name || 'Untitled bracket'
    );

    option.value = bracket.id;
    selector.append(option);
  });

  selector.value = data.activeId;

  $('bracketCount').textContent =
    `${categoryBrackets().length} bracket` +
    `${categoryBrackets().length === 1 ? '' : 's'}`;

  $('deleteBracket').disabled = categoryLocked() || categoryBrackets().length === 1;
  $('displayName').textContent =
  `${activeCategory().name || 'Untitled category'} — ${state.name || 'Untitled bracket'}`;
  // $('displayName').textContent = state.name || 'Untitled bracket';
  $('tournamentName').value = state.name;
  $('formatSelect').value = state.format;

  $('formatHint').textContent =
    state.format === 'round-robin'
      ? 'Round robin in this bracket. Top two advance to category playoffs.'
      : 'One winning team advances from each match.';

  $('teamCount').textContent =
    `${state.teams.length} team` +
    `${state.teams.length === 1 ? '' : 's'}`;

  $('generate').disabled = categoryLocked() || state.teams.length < 2;
  $('reset').disabled = categoryLocked();

  $('generate').textContent =
    state.format === 'round-robin'
      ? 'Generate round robin'
      : 'Generate bracket';

  $('status').textContent =
    state.stage === 'pool'
      ? 'Round robin live'
      : state.rounds.length
        ? 'Elimination live'
        : 'Setup in progress';

  $('bracketSummary').textContent =
    state.stage === 'pool'
      ? `${state.teams.length} teams · ${state.poolRounds.length} round robin rounds`
      : state.rounds.length
        ? `${state.teams.length} teams · ${state.rounds.length} elimination rounds`
        : 'Add teams to get started.';

  $('startPlayoffs').hidden = categoryLocked();
  $('startPlayoffs').disabled = !categoryReady();

  const list = $('teamList');
  list.replaceChildren();

  state.teams.forEach((name, index) => {
    const item = elem('li', 'team');

    item.append(
      elem('span', 'seed', String(index + 1)),
      elem('span', 'team-name', name)
    );

    const remove = elem('button', 'remove', '×');
    remove.type = 'button';

    remove.setAttribute(
      'aria-label',
      `Remove ${name}`
    );

    remove.disabled = categoryLocked();
    remove.onclick = () => {
      if (categoryLocked()) return;
      if (
        (state.rounds.length || state.poolRounds.length) &&
        !confirm(
          'Removing a team will clear this bracket’s matches and scores. Continue?'
        )
      ) {
        return;
      }

      state.teams.splice(index, 1);
      clearMatches();
      render();
    };

    item.append(remove);
    list.append(item);
  });

  const area = $('bracketArea');

  area.replaceChildren();
  $('champion').replaceChildren();

  if (state.format === 'round-robin' && state.poolRounds.length) {
    renderPool(area);
  }

  if (state.format === 'single' && state.rounds.length) {
    renderElimination(area);
  }
  $('categoryPlayoffs').replaceChildren();
  if (c.rounds.length) {
    const selectedState = state;
    state = c;
    renderElimination($('categoryPlayoffs'));
    state = selectedState;
  }

  if (!state.poolRounds.length && !state.rounds.length) {
    const empty = elem('div', 'empty');

    empty.innerHTML = `
      <div class="empty-icon" aria-hidden="true">◉</div>
      <h3>Your bracket starts here</h3>
      <p>Add your teams, then generate the matches.</p>
    `;

    area.append(empty);
  }
}

// Event handlers
$('bracketSelect').onchange = event => {
  selectBracket(event.target.value);
};

$('newBracketForm').onsubmit = event => {
  event.preventDefault();
  if (categoryLocked()) return;

  const input = $('newBracketName');
  const name = input.value.trim();
  const message = $('bracketMessage');

  message.textContent = '';

  if (!name) return;

  if (
    categoryBrackets().some(
      bracket =>
        bracket.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    message.textContent =
      'A bracket with that name already exists.';
    return;
  }

  const next = makeBracket(name);
  next.categoryId = state.categoryId;
  next.tieOrder = [];

  data.brackets.push(next);
  input.value = '';

  selectBracket(next.id);
  toast('Bracket created');
};

$('deleteBracket').onclick = () => {
  if (categoryLocked() || categoryBrackets().length < 2) return;

  if (
    !confirm(
      `Delete "${state.name || 'Untitled bracket'}" and all its teams and scores?`
    )
  ) {
    return;
  }

  data.brackets = data.brackets.filter(
    bracket => bracket.id !== state.id
  );

  selectBracket(categoryBrackets()[0].id);
  toast('Bracket deleted');
};

$('tournamentName').oninput = event => {
  state.name = event.target.value
    .trimStart()
    .slice(0, 60);

    $('displayName').textContent =
  `${activeCategory().name || 'Untitled category'} — ${state.name || 'Untitled bracket'}`;
  // $('displayName').textContent =
  //   state.name || 'Untitled bracket';

  $('bracketSelect').selectedOptions[0].textContent =
    state.name || 'Untitled bracket';

  persist();
};

$('formatSelect').onchange = event => {
  if (categoryLocked()) return;
  if (
    (state.rounds.length || state.poolRounds.length) &&
    !confirm(
      'Changing format will clear the matches and scores in this bracket. Continue?'
    )
  ) {
    event.target.value = state.format;
    return;
  }

  state.format = event.target.value;
  clearMatches();
  render();
};

$('addForm').onsubmit = event => {
  event.preventDefault();
  if (categoryLocked()) return;

  const name = $('teamInput').value.trim();
  const message = $('formMessage');

  message.textContent = '';

  if (!name) return;

  if (state.teams.length >= 16) {
    message.textContent = 'Maximum of 16 teams.';
    return;
  }

  if (
    categoryBrackets().some(b => b.teams.some(team => team.toLowerCase() === name.toLowerCase()))
  ) {
    message.textContent = 'That team is already listed.';
    return;
  }

  if (
    (state.rounds.length || state.poolRounds.length) &&
    !confirm(
      'Adding a team will clear this bracket’s matches and scores. Continue?'
    )
  ) {
    return;
  }

  state.teams.push(name);
  clearMatches();

  $('teamInput').value = '';
  render();
  $('teamInput').focus();
};

$('generate').onclick = () => {
  if (categoryLocked()) return;
  if (state.teams.length < 2) return;

  if (
    (state.rounds.length || state.poolRounds.length) &&
    !confirm(
      'Regenerate matches and clear scores in this bracket?'
    )
  ) {
    return;
  }

  clearMatches();

  if (state.format === 'round-robin') {
    state.poolRounds = makeRoundRobin(state.teams);
    state.stage = 'pool';
  } else {
    makeElimination(state.teams);
    state.stage = 'playoff';
  }

  render();
  toast('Matches generated');
};

function categoryReady() {
  return !categoryLocked() && categoryBrackets().every(b =>
    b.format === 'round-robin' && b.teams.length >= 2 && poolComplete(b) && !unresolvedTie(b));
}
function unresolvedTie(b) {
  const rows = standings(b);
  return rows.some((a, i) => {
    const other = rows[i + 1];
    return other && a.wins === other.wins && a.for - a.against === other.for - other.against && a.for === other.for &&
      !(b.tieOrder.includes(a.name) && b.tieOrder.includes(other.name));
  });
}
function categorySlots(brackets) {
  const ranks = brackets.map(b => standings(b).slice(0, 2).map(r => r.name));
  if (ranks.length === 1) return ranks[0];
  const slots = [];
  for (let i = 0; i < ranks.length; i += 2) {
    if (ranks[i + 1]) slots.push(ranks[i][0], ranks[i + 1][1], ranks[i + 1][0], ranks[i][1]);
    else slots.push(ranks[i][0], null, ranks[i][1], null);
  }
  const size = 2 ** Math.ceil(Math.log2(slots.length));
  while (slots.length < size) slots.push(null);
  return slots;
}
$('startPlayoffs').onclick = () => {
  if (!categoryReady()) return toast('Complete all round-robin brackets and resolve statistical ties first.');
  const c = activeCategory(), slots = categorySlots(categoryBrackets());
  c.teams = slots.filter(Boolean);
  c.format = 'round-robin';
  c.rounds = [];
  for (let count = slots.length / 2; count >= 1; count /= 2) {
    c.rounds.push(Array.from({ length: count }, () => ({ a: null, b: null, sa: null, sb: null })));
  }
  c.rounds[0].forEach((m, i) => { m.a = slots[2 * i]; m.b = slots[2 * i + 1]; });
  propagate(c);
  render();
  toast('Category playoffs started');
};
$('categorySelect').onchange = event => {
  selectBracket(data.brackets.find(b => b.categoryId === event.target.value).id);
};
$('newCategoryForm').onsubmit = event => {
  event.preventDefault();
  const name = $('newCategoryName').value.trim();
  if (!name) return;
  if (data.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast('Category name already exists.');
  const c = { id: newId(), name, rounds: [], teams: [] };
  data.categories.push(c);
  const brackets = ['Bracket A', 'Bracket B'].map(name => ({ ...makeBracket(name), categoryId: c.id, tieOrder: [] }));
  data.brackets.push(...brackets);
  $('newCategoryName').value = '';
  selectBracket(brackets[0].id);
};
$('categoryName').onchange = event => {
  activeCategory().name = event.target.value.trim() || 'Untitled category';
  render();
};
$('reopenPools').onclick = () => {
  if (!confirm('Clear category playoff results and reopen round robin?')) return;
  activeCategory().rounds = [];
  render();
};
$('exportBackup').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'idc-tournament-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('reset').onclick = () => {
  if (categoryLocked()) return;
  if (
    (state.teams.length ||
      state.poolRounds.length ||
      state.rounds.length) &&
    !confirm(
      'Clear teams and scores in the current bracket?'
    )
  ) {
    return;
  }

  state.teams = [];
  clearMatches();

  $('formMessage').textContent = '';

  render();
  toast('Current bracket reset');
};

render();
// Initialize the interface after all event handlers are connected.
render();
