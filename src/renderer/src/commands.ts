/**
 * The command palette's action model: a flat list App assembles each render
 * from whatever is currently actionable (workspaces, presets, prompts, git…),
 * filtered by a dependency-free subsequence fuzzy matcher.
 */
export interface Command {
  id: string
  /** Display title, e.g. 'Switch workspace: backend'. */
  title: string
  /** Extra match material (folder names, aliases…), not displayed. */
  keywords?: string
  /** Group header in the list. */
  section: string
  run: () => void
}

/**
 * Subsequence fuzzy score: every query char must appear in order; earlier and
 * consecutive matches score higher, word starts get a bonus. Returns -1 when
 * the query doesn't match at all.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0
  let score = 0
  let ti = 0
  let lastMatch = -1
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti
        ti++
        break
      }
      ti++
    }
    if (found === -1) return -1
    // Base point + streak bonus + word-start bonus + early-position bonus.
    score += 1
    if (found === lastMatch + 1) score += 2
    if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '/') score += 3
    score += Math.max(0, 3 - found * 0.05)
    lastMatch = found
  }
  return score
}

/** Filter + rank commands for a palette query (title and keywords both match). */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim()
  if (!q) return commands
  return commands
    .map((cmd) => ({
      cmd,
      score: Math.max(
        fuzzyScore(q, cmd.title),
        cmd.keywords ? fuzzyScore(q, cmd.keywords) * 0.9 : -1
      )
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.cmd)
}
