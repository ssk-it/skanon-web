/**
 * Removes every trailing occurrence of a character.
 *
 * Replaces `text.replace(/c+$/, "")`: that expression retries from each run of the character that is not at the end, quadratic in its length — forty thousand slashes followed by a letter take half a second.
 */
export function trimTrailing(text: string, char: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === char) end--;
  return text.slice(0, end);
}
