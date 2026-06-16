// Group-wise daily token display. The server still assigns a plain sequential
// integer (1, 2, 3 …) so ordering/uniqueness is unchanged; this is purely how
// we SHOW it: 30 tokens per letter group — 1‑30 → A‑01…A‑30, 31‑60 → B‑01…B‑30,
// and so on (A…Z, then AA, AB… past 26 groups). Non-numeric/empty tokens pass
// through unchanged (e.g., a displayId fallback before a token is assigned).
const GROUP_SIZE = 30;

export function formatToken(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return n == null ? '' : String(n);

  const groupIdx = Math.floor((num - 1) / GROUP_SIZE); // 0-based group
  const within = ((num - 1) % GROUP_SIZE) + 1;          // 1..30 inside the group

  // Spreadsheet-style letters: A..Z, AA, AB, … for groups beyond 26.
  let letter = '';
  let g = groupIdx;
  while (g >= 0) {
    letter = String.fromCharCode(65 + (g % 26)) + letter;
    g = Math.floor(g / 26) - 1;
  }
  return `${letter}-${String(within).padStart(2, '0')}`;
}

export default formatToken;
