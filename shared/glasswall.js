// Reads the text of a GlassWall PDF ("AI match analysis from Rackety court cameras")
// into structured data: match details, coach note, focus areas with drills, and
// the numbers mentioned in the text as chartable stats.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const CATEGORY = /^(Tactics|Technique|Fitness|Physical|Mental|Strategy|Positioning|Movement|Serve|Return)$/i;
const SHOT = /\b(backhand|forehand|volley|volleys|smash|bandeja|v[ií]bora|lob|lobs|serve|serves|return|chiquita|drive)\b/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, '0');

// "staying at the back for 57% of your rallies" → "Staying at the back for % of your rallies"
function percentName(sentence, num) {
  const clauses = sentence.split(/[,;:]|\s+—\s+|\s+-\s+|\bbut\b|\bwhile\b|\bwhich\b/i);
  let c = clauses.find((x) => x.includes(`${num}%`) || x.includes(`${num} %`)) ?? sentence;
  c = c.trim().replace(/^(and|so|because)\s+/i, '').replace(/^(you are|you're|you)\s+/i, '').replace(/[.!?]+$/, '');
  c = c.replace(new RegExp(`${num.replace('.', '\\.')}\\s*%`), '%');
  return cap(c).slice(0, 70);
}

function findMetrics(sentence) {
  const out = [];
  for (const m of sentence.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    out.push({ name: percentName(sentence, m[1]), value: Number(m[1]), unit: '%', source: sentence });
  }
  for (const m of sentence.matchAll(/(\d+)\s+out of\s+(\d+)\s+([a-z]+(?:\s+[a-z]+)?)/gi)) {
    const won = /\bwin|won|winning\b/i.test(sentence);
    out.push({ name: `${cap(m[3].replace(/\s+(rallies|points|games)$/i, ' $1'))}${won ? ' won' : ''}`, value: Math.round((m[1] / m[2]) * 100), unit: '%', of: Number(m[2]), source: sentence });
  }
  for (const m of sentence.matchAll(/(\d+)\s+(unforced errors|winners|errors|aces|double faults|smashes|points won|points)/gi)) {
    const shot = SHOT.exec(sentence)?.[1];
    out.push({ name: shot ? `${cap(shot.toLowerCase())} ${m[2].toLowerCase()}` : cap(m[2].toLowerCase()), value: Number(m[1]), unit: m[2].toLowerCase(), source: sentence });
  }
  return out;
}

export function parseGlassWall(rawLines) {
  const lines = rawLines.map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean)
    .filter((s) => !/^\d+\s+drills?$/i.test(s))
    .map((s) => s.replace(/\s+\d+\s+drills?$/i, '')); // "Tactics 1 drill" on one line
  const full = lines.join('\n');
  const r = { source: 'GlassWall', date: '', time: '', court: '', label: '', partner: '', coachName: '', coachNote: '', focus: [], metrics: [] };

  const d = /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})(?:\s*·\s*(\d{1,2}:\d{2}))?/i.exec(full);
  if (d) {
    r.date = `${d[3]}-${pad(MONTHS[d[2].toLowerCase().slice(0, 3)])}-${pad(d[1])}`;
    r.time = d[4] ?? '';
  }
  r.court = /Court\s*([\w-]+)/i.exec(full)?.[1] ? `Court ${/Court\s*([\w-]+)/i.exec(full)[1]}` : '';
  const forIdx = lines.findIndex((l) => /^this plan is for$/i.test(l));
  if (forIdx >= 0) r.label = lines[forIdx + 1] ?? '';
  r.partner = /,?\s*with\s+([^\n·]+)/i.exec(full)?.[1]?.trim() ?? '';
  const team = /\bTeam\s+(\w+)/.exec(full)?.[1];
  if (team && r.partner) r.partner = `${r.partner} (Team ${team})`;

  // coach note: after "From your coach" + "Name · Sent …", until the first focus category
  let i = lines.findIndex((l) => /^from your coach$/i.test(l));
  if (i >= 0) {
    i += 1;
    const by = /^(.+?)\s*·\s*Sent\b/i.exec(lines[i] ?? '');
    if (by) { r.coachName = by[1]; i += 1; }
    const note = [];
    while (i < lines.length && !CATEGORY.test(lines[i]) && !/^GlassWall\b/i.test(lines[i])) note.push(lines[i++]);
    r.coachNote = note.join(' ');
  } else {
    i = lines.findIndex((l) => CATEGORY.test(l));
  }

  // focus areas
  let cur = null;
  for (; i >= 0 && i < lines.length; i++) {
    const l = lines[i];
    if (/^GlassWall\b/i.test(l)) break;
    if (CATEGORY.test(l)) {
      cur = { category: cap(l.toLowerCase()), title: '', finding: '', drills: [] };
      r.focus.push(cur);
      continue;
    }
    if (!cur) continue;
    if (!cur.title) { cur.title = l; continue; }
    if (/^[•·\-–]\s*/.test(l)) { cur.drills.push(l.replace(/^[•·\-–]\s*/, '')); continue; }
    if (cur.drills.length) cur.drills[cur.drills.length - 1] += ` ${l}`;
    else cur.finding += `${cur.finding ? ' ' : ''}${l}`;
  }

  // stats: numbers in the coach note and the findings (not in drills — those are reps)
  const sentences = [r.coachNote, ...r.focus.map((f) => f.finding)].join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  const seen = new Set();
  for (const s of sentences) {
    for (const m of findMetrics(s)) {
      const k = `${m.name}|${m.value}`;
      if (!seen.has(k)) { seen.add(k); r.metrics.push(m); }
    }
  }
  return r;
}
