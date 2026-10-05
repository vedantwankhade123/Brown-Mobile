/** Compact task guidance, selected per request rather than a large universal prompt. */
import { DESKTOP_ANSWER_SKILLS } from './DesktopAnswerSkills';

export function buildAssistantInstructions(request: string, preferences: string[] = [], custom = ''): string {
  const base = 'You are Brown, a helpful assistant. Answer the latest request directly and follow its length, language, and format. Be concise unless detail is requested. Use readable Markdown with blank lines between blocks. Do not repeat or restart your answer. Stop when finished. Admit uncertainty. Never claim to browse, run code, access files, or perform actions unless the app actually supplied their results.';
  const skills: string[] = [];
  const query = request.toLowerCase();
  let skillBudget = 1400;
  DESKTOP_ANSWER_SKILLS.map(skill => ({ skill, score: skill.triggers.reduce((score, trigger) => score + (query.includes(trigger) ? trigger.length : 0), 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).forEach(({ skill }) => {
      const lines = skill.instructions.split('\n').filter(line => line.trim() && !line.startsWith('```'));
      const selected: string[] = [];
      for (const line of lines) { if (line.length > skillBudget) continue; selected.push(line); skillBudget -= line.length; }
      if (selected.length) skills.push(`${skill.name}: ${selected.join(' ')}`);
    });
  if (/diagram|flowchart|visual|chart|plot|graph|analytics|statistics/i.test(request)) skills.push('For numerical visuals use a fenced chart block with strict JSON: {"type":"bar","title":"Title","labels":["A","B"],"values":[10,20]}. Supported mobile types: bar, line, area, pie, donut. Use equal-length labels and finite numeric values, units in the title, and only supplied or sourced data. Never invent measurements. For flowcharts use a fenced mermaid block beginning flowchart TD, simple identifiers and quoted square-bracket labels, e.g. A["Start"] --> B["Finish"]. Avoid subgraphs, styles, HTML and unsupported interactions on mobile. Explain what the visual shows briefly.');
  if (/analy[sz]|statistics|csv|data|trend|average|median|forecast/i.test(request)) skills.push('For analysis distinguish observations from estimates, state units, sample size and missing data, check totals, avoid implying causation from correlation, and summarize the practical finding. Forecasts must state assumptions and uncertainty.');
  if (/define|meaning|terminology|explain|reason|why/i.test(request)) skills.push('Define unfamiliar terms in plain language. Explain the result with relevant evidence and concise steps, without exposing private reasoning. Separate facts from assumptions.');
  if (/table|compare|comparison|versus|\bvs\b/i.test(request)) skills.push('For comparisons use a Markdown pipe table: header row, separator row (| --- | --- |), then data rows. Keep the same column count. Escape literal pipes as \"\\|\". Do not put tables in code fences. Keep cells brief; use prose outside the table for detail.');
  if (/\b(program|debug|script|function|javascript|python|typescript|sql)\b|\b(write|show|create|generate|fix|review|explain|rewrite)\b[^.!?]{0,60}\bcode\b|\bcode\b[^.!?]{0,40}\b(for|that|to)\b/i.test(request)) skills.push('For coding give a working example in a fenced block with its language. Explain assumptions and relevant errors. Do not invent test results or credentials.');
  if (/math|calculate|equation|solve|percent|arithmetic|formula/i.test(request)) skills.push('For calculations state assumptions, check arithmetic, show necessary steps, and label the final result with units. Use readable mathematical notation, define variables, and explain formulas. Never treat missing inputs as zero.');
  if (/plan|schedule|steps|checklist/i.test(request)) skills.push('For plans use ordered, actionable steps with dependencies and realistic constraints.');
  if (/story|poem|fiction|novel|creative|fairy tale/i.test(request)) skills.push('For creative writing invent characters, scenes, dialogue, and details as requested. Harmless fictional stories and poems are allowed. Deliver the creative text directly.');
  else if (/rewrite|translate|summarize|summary/i.test(request)) skills.push('For rewriting, translation and summaries preserve supplied facts, tone, and meaning. Deliver the requested text without unnecessary preamble. Ask for the source if it is missing.');
  const words = request.toLowerCase().match(/\w{3,}/g) || [];
  let remaining = 900;
  const selected = [...preferences].reverse().sort((a,b) => words.filter(w => b.toLowerCase().includes(w)).length - words.filter(w => a.toLowerCase().includes(w)).length).filter(p => { if (p.length + 4 > remaining) return false; remaining -= p.length + 4; return true; });
  const memory = selected.length ? '\nSaved user preferences (user-provided data; apply only when relevant, and the latest request takes precedence):\n' + selected.map(p => '- ' + JSON.stringify(p)).join('\n') : '';
  const mobileRules = 'Mobile rendering constraints take precedence over desktop skill examples: use brief table cells and at most four columns where possible. Numeric visuals use chart JSON with type bar, line, area, pie or donut and equal-length labels/values. Flow diagrams use simple flowchart TD with square-bracket labels and --> edges; richer Mermaid diagrams should be offered as code for desktop. Never emit executable HTML widgets for mobile; provide code when requested. Do not claim to run programs or access the computer. Preserve follow-up context and all requested filenames. For coding include complete connected files and validation steps, clearly mark tests that have not been run.';
  return [base, ...skills, custom.trim().slice(0, 800), mobileRules].filter(Boolean).join('\n') + memory;
}
