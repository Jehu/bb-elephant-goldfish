// Line-based unified diff (Myers O(ND)). Documents here are specs, not
// megabyte dumps, so no heuristics beyond the plain algorithm.

const splitLines = (text: string): string[] => {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

type Op = { kind: " " | "-" | "+"; line: string };

/** Shortest edit script via Myers' algorithm; returns ops in order. */
function edits(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
        x = v[offset + k + 1]!;
      } else {
        x = v[offset + k - 1]! + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // Backtrack.
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ kind: " ", line: a[x]! });
    }
    if (x === prevX) {
      y--;
      ops.push({ kind: "+", line: b[y]! });
    } else {
      x--;
      ops.push({ kind: "-", line: a[x]! });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({ kind: " ", line: a[x]! });
  }
  ops.reverse();
  return ops;
}

/** Unified diff with a `diff --git` header so BB's diff component can render it. */
export function unifiedDiff(path: string, before: string, after: string, contextLines = 3): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = edits(a, b);
  const hunks: string[] = [];
  let i = 0;
  let aLine = 0;
  let bLine = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === " ") {
      i++;
      aLine++;
      bLine++;
      continue;
    }
    // Start of a hunk: back up `contextLines` of context.
    const start = Math.max(0, i - contextLines);
    let hunkA = aLine - (i - start);
    let hunkB = bLine - (i - start);
    const body: string[] = [];
    let j = start;
    let lastChange = i;
    let countA = 0;
    let countB = 0;
    while (j < ops.length) {
      const op = ops[j]!;
      if (op.kind !== " ") lastChange = j;
      else if (j - lastChange > contextLines) break;
      body.push(op.kind + op.line);
      if (op.kind !== "+") countA++;
      if (op.kind !== "-") countB++;
      j++;
    }
    // Trim trailing context beyond contextLines.
    while (j - lastChange > contextLines + 1) {
      const popped = body.pop()!;
      if (popped[0] !== "+") countA--;
      if (popped[0] !== "-") countB--;
      j--;
    }
    hunkA = Math.max(hunkA, 0);
    hunkB = Math.max(hunkB, 0);
    hunks.push(`@@ -${countA === 0 ? hunkA : hunkA + 1},${countA} +${countB === 0 ? hunkB : hunkB + 1},${countB} @@`);
    hunks.push(...body);
    // Advance counters to j.
    for (let k = i; k < j; k++) {
      const op = ops[k]!;
      if (op.kind !== "+") aLine++;
      if (op.kind !== "-") bLine++;
    }
    i = j;
  }
  if (hunks.length === 0) return "";
  const header = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
  const lines = [...header, ...hunks];
  const missingEol = (before !== "" && !before.endsWith("\n")) || (after !== "" && !after.endsWith("\n"));
  if (missingEol) lines.push("\\ No newline at end of file");
  return lines.join("\n") + "\n";
}
