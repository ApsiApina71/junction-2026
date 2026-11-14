/** "1 day", "3 days": a count with the right form of its noun. */
export function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}
