/**
 * Finds which saved people a message is about, without sending the user's
 * whole contact list to the model. Matching is done here on the server; only
 * the matched people's details are included in the prompt.
 */

type Candidate = { id: string; name: string; relationship: string | null };

const RELATION_GROUPS: string[][] = [
  ["mom", "mother", "mum", "mama", "mommy", "ma"],
  ["dad", "father", "papa", "daddy", "pa"],
  ["sister", "sis"],
  ["brother", "bro"],
  ["grandma", "grandmother", "granny", "nana"],
  ["grandpa", "grandfather", "granddad", "grandad"],
  ["wife"],
  ["husband"],
  ["partner", "girlfriend", "boyfriend", "fiance", "fiancee", "fiancé", "fiancée", "spouse"],
  ["son"],
  ["daughter"],
  ["aunt", "auntie"],
  ["uncle"],
  ["cousin"],
  ["boss", "manager"],
];

const STOPWORDS = new Set([
  "i", "me", "my", "a", "an", "the", "and", "or", "to", "of", "in", "on", "at", "for", "with",
  "is", "was", "be", "he", "she", "her", "him", "his", "they", "them", "their", "we", "our",
  "you", "your", "it", "this", "that", "about", "what", "who", "when", "how", "do", "did",
  "remind", "remember", "today", "tomorrow", "next", "week", "call", "text", "met", "new",
  "may", "june", "april", "march", "will", "can", "mark", "bill", "rose", "grace", "hope",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function relationGroup(word: string): number {
  return RELATION_GROUPS.findIndex((g) => g.includes(word));
}

/**
 * Returns matching person ids, best matches first.
 * - Full-name match beats first-name match.
 * - Family words ("mom", "my sister") match a person named that way or whose
 *   relationship is that word.
 * Ambiguous first names return every person who shares them, so the model
 * can ask which one the user means.
 */
export function matchPeople(text: string, people: Candidate[], limit = 6): string[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];
  const tokenSet = new Set(tokens);
  const joined = ` ${tokens.join(" ")} `;
  const relationHits = new Set(tokens.map(relationGroup).filter((g) => g >= 0));

  const scored: { id: string; score: number }[] = [];
  for (const p of people) {
    const nameTokens = tokenize(p.name);
    if (nameTokens.length === 0) continue;
    let score = 0;
    if (joined.includes(` ${nameTokens.join(" ")} `)) {
      score = 100 + nameTokens.length;
    } else {
      const first = nameTokens[0];
      const last = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : null;
      // Common-word names (e.g. "Will", "May") only match when capitalised in the text.
      const firstHit = tokenSet.has(first) && (!STOPWORDS.has(first) || capitalised(text, first));
      if (firstHit) score = 50;
      if (last && tokenSet.has(last) && last.length > 2 && !STOPWORDS.has(last)) score += firstHit ? 30 : 20;
    }
    // Relationship words: "mom" matches a person named "Mom" or with relationship "Mother".
    if (relationHits.size > 0) {
      const own = [...nameTokens, ...tokenize(p.relationship ?? "")].map(relationGroup);
      if (own.some((g) => g >= 0 && relationHits.has(g))) score = Math.max(score, 60);
    }
    if (score > 0) scored.push({ id: p.id, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id);
}

function capitalised(text: string, word: string): boolean {
  return new RegExp(`\\b${word[0].toUpperCase()}${word.slice(1)}\\b`).test(text);
}
