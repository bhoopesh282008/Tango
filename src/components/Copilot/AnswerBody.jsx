// Answers are plain text assembled from templates (copilotTemplates.js): blocks
// separated by blank lines, "• " bullets, "1. " numbered rows and, in the full
// report, a section title over a rule of dashes. This lays that text out as
// headings and lists. Copy and Download still use the plain text.

function parseLine(line) {
  if (/^-{5,}$/.test(line)) return { kind: 'rule' }
  const bullet = line.match(/^•\s+(.*)$/)
  if (bullet) return { kind: 'bullet', text: bullet[1] }
  const numbered = line.match(/^(\d+)\.\s+(.*)$/)
  if (numbered) return { kind: 'number', rank: numbered[1], text: numbered[2] }
  return { kind: 'text', text: line }
}

// Consecutive lines of one kind become one group, so a run of bullets is one list.
function groupLines(lines) {
  const groups = []
  lines.forEach((line, i) => {
    const next = lines[i + 1]
    if (line.kind === 'rule') return
    if (line.kind === 'text' && next?.kind === 'rule') {
      groups.push({ kind: 'heading', text: line.text })
      return
    }
    const last = groups[groups.length - 1]
    if (last && last.kind === line.kind && line.kind !== 'text') last.items.push(line)
    else groups.push(line.kind === 'text' ? line : { kind: line.kind, items: [line] })
  })
  return groups
}

// "Betrawati: 1,217 mapped buildings" reads better with the name set apart.
function Lead({ text }) {
  const cut = text.indexOf(': ')
  if (cut < 1 || cut > 40) return text
  return (
    <>
      <span className="font-semibold text-ink">{text.slice(0, cut)}</span>
      <span className="text-ink-soft">{text.slice(cut)}</span>
    </>
  )
}

function Group({ group }) {
  if (group.kind === 'heading') {
    return (
      <h3 className="border-b border-line pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft first:pt-0">
        {group.text}
      </h3>
    )
  }
  if (group.kind === 'bullet') {
    return (
      <ul className="space-y-2">
        {group.items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
            <span className="min-w-0">
              <Lead text={item.text} />
            </span>
          </li>
        ))}
      </ul>
    )
  }
  if (group.kind === 'number') {
    return (
      <ol className="space-y-2">
        {group.items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="num w-5 shrink-0 text-ink-muted">{item.rank}</span>
            <span className="min-w-0">
              <Lead text={item.text} />
            </span>
          </li>
        ))}
      </ol>
    )
  }
  return <p>{group.text}</p>
}

export default function AnswerBody({ text }) {
  const blocks = text.split(/\n{2,}/).map((block) => groupLines(block.split('\n').map(parseLine)))
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {blocks.map((groups, i) => (
        <div key={i} className="space-y-2">
          {groups.map((group, j) => (
            <Group key={j} group={group} />
          ))}
        </div>
      ))}
    </div>
  )
}
