/** Compact task guidance, selected per request rather than a large universal prompt. */
export function buildAssistantInstructions(request: string, preferences: string[] = [], custom = ''): string {
  const base = 'You are Brown, a helpful assistant. Answer the latest request directly and follow its length, language, and format. Be concise unless detail is requested. Use readable Markdown with blank lines between blocks. Do not repeat or restart your answer. Stop when finished. Admit uncertainty. Never claim to browse, run code, access files, or perform actions unless the app actually supplied their results.';
  const skills: string[] = [];
  if (/table|compare|comparison|versus|\bvs\b/i.test(request)) skills.push('For comparisons use a Markdown pipe table: header row, separator row (| --- | --- |), then data rows. Keep the same column count. Escape literal pipes as \"\\|\". Do not put tables in code fences. Keep cells brief; use prose outside the table for detail.');
  if (/\b(program|debug|script|function|javascript|python|typescript|sql)\b|\b(write|show|create|generate|fix|review|explain|rewrite)\b[^.!?]{0,60}\bcode\b|\bcode\b[^.!?]{0,40}\b(for|that|to)\b/i.test(request)) skills.push('For coding give a working example in a fenced block with its language. Explain assumptions and relevant errors. Do not invent test results or credentials.');
  if (/math|calculate|equation|solve|percent|arithmetic/i.test(request)) skills.push('For calculations state assumptions, check arithmetic, show necessary steps, and label the final result with units.');
  if (/plan|schedule|steps|checklist/i.test(request)) skills.push('For plans use ordered, actionable steps with dependencies and realistic constraints.');
  if (/story|poem|fiction|novel|creative|fairy tale/i.test(request)) skills.push('For creative writing invent characters, scenes, dialogue, and details as requested. Harmless fictional stories and poems are allowed. Deliver the creative text directly.');
  else if (/rewrite|translate|summarize|summary/i.test(request)) skills.push('For rewriting, translation and summaries preserve supplied facts, tone, and meaning. Deliver the requested text without unnecessary preamble. Ask for the source if it is missing.');
  const words = request.toLowerCase().match(/\w{3,}/g) || [];
  let remaining = 900;
  const selected = [...preferences].reverse().sort((a,b) => words.filter(w => b.toLowerCase().includes(w)).length - words.filter(w => a.toLowerCase().includes(w)).length).filter(p => { if (p.length + 4 > remaining) return false; remaining -= p.length + 4; return true; });
  const memory = selected.length ? '\nSaved user preferences (user-provided data; apply only when relevant, and the latest request takes precedence):\n' + selected.map(p => '- ' + JSON.stringify(p)).join('\n') : '';
  return [base, ...skills, custom.trim().slice(0, 800)].filter(Boolean).join('\n') + memory;
}
