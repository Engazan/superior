/** A terminal's rectangle within the panel, expressed in percentages. */
export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Adjustable grid sizing: row heights as fractions (sum 1), and per-row column
 * widths as fractions (each row sums to 1). Terminals fill the grid row by row.
 */
export interface GridLayout {
  rows: number[]
  cols: number[][]
}

/** A draggable boundary between cells. */
export interface Divider {
  axis: 'v' | 'h'
  /** position along its axis in % (x for vertical, y for horizontal) */
  pos: number
  /** start of the bar along the cross-axis in % */
  start: number
  /** length along the cross-axis in % */
  length: number
  /** row this divider belongs to (for h: the row above the boundary) */
  rowIndex: number
  /** for vertical dividers: the column to the left of the boundary */
  colIndex?: number
}

/** Maximum number of terminals a grid can tile at once. */
export const MAX_GRID = 12

/** Smallest fraction a row/column may shrink to while dragging. */
const MIN_FRAC = 0.08

function clampCount(n: number): number {
  return Math.min(Math.max(n, 1), MAX_GRID)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Distribute n terminals across roughly-square rows, earlier rows taking the
 * remainder. 1→[1], 2→[2], 3→[2,1], 4→[2,2], 6→[3,3], 9→[3,3,3], 12→[4,4,4].
 */
export function distribute(n: number): number[] {
  const c = clampCount(n)
  const rows = Math.max(1, Math.round(Math.sqrt(c)))
  const base = Math.floor(c / rows)
  const extra = c % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** The default, evenly-sized layout for a given row distribution. */
export function uniformLayout(dist: number[]): GridLayout {
  const r = dist.length
  return {
    rows: dist.map(() => 1 / r),
    cols: dist.map((c) => Array.from({ length: c }, () => 1 / c))
  }
}

/** Whether a stored layout still matches the current row distribution. */
export function matchesDist(layout: GridLayout | undefined, dist: number[]): boolean {
  return (
    !!layout &&
    layout.rows.length === dist.length &&
    layout.cols.length === dist.length &&
    dist.every((c, i) => layout.cols[i]?.length === c)
  )
}

/** Cell rectangles (percent) for a distribution + sizing, in row-major order. */
export function gridRects(dist: number[], layout: GridLayout): Rect[] {
  const rects: Rect[] = []
  let y = 0
  for (let r = 0; r < dist.length; r++) {
    const h = layout.rows[r] * 100
    let x = 0
    for (let c = 0; c < dist[r]; c++) {
      const w = layout.cols[r][c] * 100
      rects.push({ top: y, left: x, width: w, height: h })
      x += w
    }
    y += h
  }
  return rects
}

/** The draggable dividers: one between each pair of rows, and within each row. */
export function gridDividers(dist: number[], layout: GridLayout): Divider[] {
  const ds: Divider[] = []
  // Horizontal dividers between rows.
  let y = 0
  for (let r = 0; r < dist.length - 1; r++) {
    y += layout.rows[r] * 100
    ds.push({ axis: 'h', pos: y, start: 0, length: 100, rowIndex: r })
  }
  // Vertical dividers within each row.
  let rowTop = 0
  for (let r = 0; r < dist.length; r++) {
    const h = layout.rows[r] * 100
    let x = 0
    for (let c = 0; c < dist[r] - 1; c++) {
      x += layout.cols[r][c] * 100
      ds.push({ axis: 'v', pos: x, start: rowTop, length: h, rowIndex: r, colIndex: c })
    }
    rowTop += h
  }
  return ds
}

/**
 * Move one divider so its boundary sits at `fraction` (0..1) of the panel along
 * its axis, adjusting only the two cells it separates. Returns a new layout.
 */
export function applyDividerDrag(
  layout: GridLayout,
  d: Divider,
  fraction: number
): GridLayout {
  const f = clamp(fraction, 0, 1)
  if (d.axis === 'h') {
    const i = d.rowIndex
    const before = layout.rows.slice(0, i).reduce((a, b) => a + b, 0)
    const pair = layout.rows[i] + layout.rows[i + 1]
    const top = clamp(f - before, MIN_FRAC, pair - MIN_FRAC)
    const rows = layout.rows.slice()
    rows[i] = top
    rows[i + 1] = pair - top
    return { rows, cols: layout.cols }
  }
  const r = d.rowIndex
  const j = d.colIndex ?? 0
  const rowCols = layout.cols[r]
  const before = rowCols.slice(0, j).reduce((a, b) => a + b, 0)
  const pair = rowCols[j] + rowCols[j + 1]
  const left = clamp(f - before, MIN_FRAC, pair - MIN_FRAC)
  const newRow = rowCols.slice()
  newRow[j] = left
  newRow[j + 1] = pair - left
  return { rows: layout.rows, cols: layout.cols.map((c, idx) => (idx === r ? newRow : c)) }
}
