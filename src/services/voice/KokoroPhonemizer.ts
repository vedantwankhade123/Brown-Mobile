/**
 * American English → Kokoro IPA phonemes (Misaki/espeak-compatible subset).
 * Uses the official hexgrad/Kokoro-82M character vocab (n_token=178).
 * Not as accurate as Misaki+espeak, but produces real ONNX-ready phoneme IDs
 * so Heart/Michael neural audio works on-device without native espeak.
 */

/** Official Kokoro vocab from hexgrad/Kokoro-82M config.json */
export const KOKORO_VOCAB: Record<string, number> = {
  ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10, '"': 11,
  '(': 12, ')': 13, '“': 14, '”': 15, ' ': 16, '\u0303': 17,
  'ʣ': 18, 'ʥ': 19, 'ʦ': 20, 'ʨ': 21, 'ᵝ': 22, '\uAB67': 23,
  A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39, Y: 41, 'ᵊ': 42,
  a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53,
  l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61, t: 62, u: 63,
  v: 64, w: 65, x: 66, y: 67, z: 68,
  ɑ: 69, ɐ: 70, ɒ: 71, æ: 72, β: 75, ɔ: 76, ɕ: 77, ç: 78, ɖ: 80, ð: 81,
  ʤ: 82, ə: 83, ɚ: 85, ɛ: 86, ɜ: 87, ɟ: 90, ɡ: 92, ɥ: 99, ɨ: 101, ɪ: 102,
  ʝ: 103, ɯ: 110, ɰ: 111, ŋ: 112, ɳ: 113, ɲ: 114, ɴ: 115, ø: 116, ɸ: 118,
  θ: 119, œ: 120, ɹ: 123, ɾ: 125, ɻ: 126, ʁ: 128, ɽ: 129, ʂ: 130, ʃ: 131,
  ʈ: 132, ʧ: 133, ʊ: 135, ʋ: 136, ʌ: 138, ɣ: 139, ɤ: 140, χ: 142, ʎ: 143,
  ʒ: 147, ʔ: 148, ˈ: 156, ˌ: 157, ː: 158, ʰ: 162, ʲ: 164,
  '↓': 169, '→': 171, '↗': 172, '↘': 173, ᵻ: 177,
};

/** High-frequency English → US IPA (Misaki-style, stress-marked). */
const LEXICON: Record<string, string> = {
  a: 'ɐ',
  an: 'ən',
  the: 'ðə',
  to: 'tə',
  of: 'əv',
  and: 'ænd',
  in: 'ɪn',
  is: 'ɪz',
  it: 'ɪt',
  for: 'fɔɹ',
  on: 'ɑn',
  you: 'ju',
  that: 'ðæt',
  with: 'wɪð',
  this: 'ðɪs',
  be: 'bi',
  are: 'ɑɹ',
  as: 'æz',
  at: 'æt',
  or: 'ɔɹ',
  from: 'fɹʌm',
  your: 'jɔɹ',
  have: 'hæv',
  not: 'nɑt',
  can: 'kæn',
  will: 'wɪl',
  just: 'ʤʌst',
  about: 'əˈbaʊt',
  like: 'laɪk',
  what: 'wʌt',
  when: 'wɛn',
  where: 'wɛɹ',
  who: 'hu',
  how: 'haʊ',
  why: 'waɪ',
  which: 'wɪʧ',
  there: 'ðɛɹ',
  their: 'ðɛɹ',
  they: 'ðeɪ',
  them: 'ðɛm',
  we: 'wi',
  our: 'aʊɹ',
  my: 'maɪ',
  me: 'mi',
  i: 'aɪ',
  he: 'hi',
  she: 'ʃi',
  his: 'hɪz',
  her: 'hɚ',
  was: 'wʌz',
  were: 'wɚ',
  been: 'bɪn',
  being: 'ˈbiɪŋ',
  do: 'du',
  does: 'dʌz',
  did: 'dɪd',
  done: 'dʌn',
  get: 'ɡɛt',
  got: 'ɡɑt',
  make: 'meɪk',
  made: 'meɪd',
  know: 'noʊ',
  think: 'θɪŋk',
  see: 'si',
  look: 'lʊk',
  want: 'wɑnt',
  need: 'nid',
  use: 'juz',
  using: 'ˈjuzɪŋ',
  used: 'juzd',
  say: 'seɪ',
  said: 'sɛd',
  go: 'ɡoʊ',
  going: 'ˈɡoʊɪŋ',
  went: 'wɛnt',
  come: 'kʌm',
  came: 'keɪm',
  take: 'teɪk',
  took: 'tʊk',
  give: 'ɡɪv',
  gave: 'ɡeɪv',
  find: 'faɪnd',
  found: 'faʊnd',
  tell: 'tɛl',
  told: 'toʊld',
  ask: 'æsk',
  asked: 'æskt',
  help: 'hɛlp',
  please: 'pliz',
  thank: 'θæŋk',
  thanks: 'θæŋks',
  hello: 'həˈloʊ',
  hi: 'haɪ',
  yes: 'jɛs',
  no: 'noʊ',
  okay: 'oʊˈkeɪ',
  ok: 'oʊˈkeɪ',
  good: 'ɡʊd',
  great: 'ɡɹeɪt',
  well: 'wɛl',
  right: 'ɹaɪt',
  left: 'lɛft',
  now: 'naʊ',
  here: 'hiɹ',
  more: 'mɔɹ',
  most: 'moʊst',
  some: 'sʌm',
  any: 'ˈɛni',
  all: 'ɔl',
  each: 'iʧ',
  every: 'ˈɛvɹi',
  other: 'ˈʌðɚ',
  another: 'əˈnʌðɚ',
  one: 'wʌn',
  two: 'tu',
  three: 'θɹi',
  first: 'fɚst',
  second: 'ˈsɛkənd',
  time: 'taɪm',
  day: 'deɪ',
  year: 'jɪɹ',
  way: 'weɪ',
  people: 'ˈpipəl',
  person: 'ˈpɚsən',
  world: 'wɚld',
  life: 'laɪf',
  work: 'wɚk',
  home: 'hoʊm',
  school: 'skul',
  number: 'ˈnʌmbɚ',
  part: 'pɑɹt',
  place: 'pleɪs',
  case: 'keɪs',
  system: 'ˈsɪstəm',
  program: 'ˈpɹoʊɡɹæm',
  question: 'ˈkwɛsʧən',
  answer: 'ˈænsɚ',
  information: 'ˌɪnfɚˈmeɪʃən',
  computer: 'kəmˈpjutɚ',
  phone: 'foʊn',
  email: 'ˈimeɪl',
  message: 'ˈmɛsɪʤ',
  text: 'tɛkst',
  voice: 'vɔɪs',
  speech: 'spiʧ',
  model: 'ˈmɑdəl',
  language: 'ˈlæŋɡwɪʤ',
  english: 'ˈɪŋɡlɪʃ',
  brown: 'bɹaʊn',
  mobile: 'ˈmoʊbəl',
  offline: 'ˈɔflaɪn',
  online: 'ˈɔnlaɪn',
  assistant: 'əˈsɪstənt',
  artificial: 'ˌɑɹtəˈfɪʃəl',
  intelligence: 'ɪnˈtɛləʤəns',
  open: 'ˈoʊpən',
  close: 'kloʊz',
  start: 'stɑɹt',
  stop: 'stɑp',
  play: 'pleɪ',
  pause: 'pɔz',
  download: 'ˈdaʊnloʊd',
  upload: 'ˈʌploʊd',
  install: 'ɪnˈstɔl',
  settings: 'ˈsɛtɪŋz',
  today: 'təˈdeɪ',
  tomorrow: 'təˈmɑɹoʊ',
  yesterday: 'ˈjɛstɚdeɪ',
  morning: 'ˈmɔɹnɪŋ',
  afternoon: 'ˌæftɚˈnun',
  evening: 'ˈivnɪŋ',
  night: 'naɪt',
  because: 'bɪˈkɔz',
  before: 'bɪˈfɔɹ',
  after: 'ˈæftɚ',
  under: 'ˈʌndɚ',
  over: 'ˈoʊvɚ',
  between: 'bɪˈtwin',
  through: 'θɹu',
  into: 'ˈɪntu',
  without: 'wɪˈθaʊt',
  within: 'wɪˈðɪn',
  against: 'əˈɡɛnst',
  during: 'ˈdʊɹɪŋ',
  until: 'ənˈtɪl',
  while: 'waɪl',
  since: 'sɪns',
  also: 'ˈɔlsoʊ',
  only: 'ˈoʊnli',
  even: 'ˈivən',
  still: 'stɪl',
  already: 'ɔlˈɹɛdi',
  always: 'ˈɔlweɪz',
  never: 'ˈnɛvɚ',
  sometimes: 'ˈsʌmtaɪmz',
  often: 'ˈɔfən',
  really: 'ˈɹɪli',
  very: 'ˈvɛɹi',
  too: 'tu',
  so: 'soʊ',
  then: 'ðɛn',
  if: 'ɪf',
  but: 'bʌt',
  by: 'baɪ',
  up: 'ʌp',
  out: 'aʊt',
  down: 'daʊn',
  off: 'ɔf',
  back: 'bæk',
  new: 'nu',
  old: 'oʊld',
  long: 'lɔŋ',
  short: 'ʃɔɹt',
  high: 'haɪ',
  low: 'loʊ',
  big: 'bɪɡ',
  small: 'smɔl',
  little: 'ˈlɪtəl',
  large: 'lɑɹʤ',
  next: 'nɛkst',
  last: 'læst',
  same: 'seɪm',
  different: 'ˈdɪfɹənt',
  important: 'ɪmˈpɔɹtənt',
  possible: 'ˈpɑsəbəl',
  available: 'əˈveɪləbəl',
  sure: 'ʃʊɹ',
  sorry: 'ˈsɑɹi',
  welcome: 'ˈwɛlkəm',
  let: 'lɛt',
  lets: 'lɛts',
  "let's": 'lɛts',
  dont: 'doʊnt',
  "don't": 'doʊnt',
  doesnt: 'ˈdʌzənt',
  "doesn't": 'ˈdʌzənt',
  cant: 'kænt',
  "can't": 'kænt',
  wont: 'woʊnt',
  "won't": 'woʊnt',
  im: 'aɪm',
  "i'm": 'aɪm',
  ive: 'aɪv',
  "i've": 'aɪv',
  youre: 'jʊɹ',
  "you're": 'jʊɹ',
  youve: 'juv',
  "you've": 'juv',
  its: 'ɪts',
  "it's": 'ɪts',
  thats: 'ðæts',
  "that's": 'ðæts',
  theres: 'ðɛɹz',
  "there's": 'ðɛɹz',
  heres: 'hiɹz',
  "here's": 'hiɹz',
  whats: 'wʌts',
  "what's": 'wʌts',
  whos: 'huz',
  "who's": 'huz',
  would: 'wʊd',
  could: 'kʊd',
  should: 'ʃʊd',
  might: 'maɪt',
  must: 'mʌst',
  may: 'meɪ',
  shall: 'ʃæl',
};

function normalizeText(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '—')
    .replace(/\u2026/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very rough letter→IPA for OOV words (US English heuristics). */
function spellWord(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return '';
  // Digraphs / trigraphs first
  const rules: Array<[RegExp, string]> = [
    [/^sch/, 'sk'],
    [/tion$/, 'ʃən'],
    [/sion$/, 'ʒən'],
    [/cious$/, 'ʃəs'],
    [/cious/, 'ʃəs'],
    [/ough$/, 'oʊ'],
    [/augh/, 'æf'],
    [/igh/, 'aɪ'],
    [/eer$/, 'ɪɹ'],
    [/ear$/, 'ɪɹ'],
    [/air$/, 'ɛɹ'],
    [/ure$/, 'ɚ'],
    [/ous$/, 'əs'],
    [/ing$/, 'ɪŋ'],
    [/ed$/, 'd'],
    [/ck/, 'k'],
    [/ph/, 'f'],
    [/th/, 'θ'],
    [/sh/, 'ʃ'],
    [/ch/, 'ʧ'],
    [/wh/, 'w'],
    [/qu/, 'kw'],
    [/ng/, 'ŋ'],
    [/oo/, 'u'],
    [/ee/, 'i'],
    [/ea/, 'i'],
    [/ai/, 'eɪ'],
    [/ay/, 'eɪ'],
    [/oy/, 'ɔɪ'],
    [/oi/, 'ɔɪ'],
    [/ou/, 'aʊ'],
    [/ow/, 'aʊ'],
    [/au/, 'ɔ'],
    [/aw/, 'ɔ'],
    [/ew/, 'u'],
    [/ie/, 'i'],
    [/ei/, 'eɪ'],
    [/er$/, 'ɚ'],
    [/ar/, 'ɑɹ'],
    [/or/, 'ɔɹ'],
    [/ur/, 'ɚ'],
    [/ir/, 'ɚ'],
    [/ll/, 'l'],
    [/ss/, 's'],
    [/ff/, 'f'],
    [/mm/, 'm'],
    [/nn/, 'n'],
    [/pp/, 'p'],
    [/tt/, 't'],
    [/x/, 'ks'],
    [/c(?=[eiy])/, 's'],
    [/c/, 'k'],
    [/g(?=[eiy])/, 'ʤ'],
    [/g/, 'ɡ'],
    [/j/, 'ʤ'],
    [/y$/, 'i'],
    [/y/, 'ɪ'],
    [/a/, 'æ'],
    [/e/, 'ɛ'],
    [/i/, 'ɪ'],
    [/o/, 'ɑ'],
    [/u/, 'ʌ'],
    [/b/, 'b'],
    [/d/, 'd'],
    [/f/, 'f'],
    [/h/, 'h'],
    [/k/, 'k'],
    [/l/, 'l'],
    [/m/, 'm'],
    [/n/, 'n'],
    [/p/, 'p'],
    [/r/, 'ɹ'],
    [/s/, 's'],
    [/t/, 't'],
    [/v/, 'v'],
    [/w/, 'w'],
    [/z/, 'z'],
  ];

  let out = '';
  while (w.length) {
    let matched = false;
    for (const [re, rep] of rules) {
      const m = w.match(re);
      if (m && m.index === 0) {
        out += rep;
        w = w.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) w = w.slice(1);
  }
  // Primary stress on first syllable-ish vowel cluster for multi-letter words
  if (out.length >= 3 && !out.includes('ˈ') && !out.includes('ˌ')) {
    const idx = out.search(/[ɑɐɒæɔəɚɛɜɨɪɯʊʌiu]/);
    if (idx >= 0) out = out.slice(0, idx) + 'ˈ' + out.slice(idx);
  }
  return out;
}

function wordToPhonemes(raw: string): string {
  const key = raw.toLowerCase();
  if (LEXICON[key]) return LEXICON[key];
  // Strip trailing punctuation handled outside
  const bare = key.replace(/^[^a-z']+|[^a-z']+$/g, '');
  if (LEXICON[bare]) return LEXICON[bare];
  if (/^\d+$/.test(bare)) {
    // Digit spelling (simple)
    const digits: Record<string, string> = {
      '0': 'zɪɹoʊ', '1': 'wʌn', '2': 'tu', '3': 'θɹi', '4': 'fɔɹ',
      '5': 'faɪv', '6': 'sɪks', '7': 'ˈsɛvən', '8': 'eɪt', '9': 'naɪn',
    };
    return bare.split('').map((d) => digits[d] || d).join(' ');
  }
  return spellWord(bare || key);
}

/**
 * Convert English text to a Kokoro phoneme string (space-separated words).
 */
export function phonemizeAmerican(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  const parts: string[] = [];
  const tokens = normalized.match(/[A-Za-z']+|[\d]+|[.,!?;:—…()"]|./g) || [];

  for (const tok of tokens) {
    if (/^[.,!?;:—…]$/.test(tok)) {
      parts.push(tok);
      continue;
    }
    if (/^["()]$/.test(tok)) {
      parts.push(tok);
      continue;
    }
    if (/^\s+$/.test(tok)) {
      parts.push(' ');
      continue;
    }
    if (/^[A-Za-z']+$/.test(tok) || /^\d+$/.test(tok)) {
      const ph = wordToPhonemes(tok);
      if (ph) {
        if (parts.length && parts[parts.length - 1] !== ' ' && !/^[.,!?;:—…]$/.test(parts[parts.length - 1])) {
          parts.push(' ');
        }
        parts.push(ph);
      }
      continue;
    }
    // Unknown char — keep if in vocab, else skip
    if (tok in KOKORO_VOCAB) parts.push(tok);
  }

  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Map phoneme string → token ids with pad 0 at ends (max 510 phonemes). */
export function tokenizeKokoroPhonemes(phonemes: string): number[] {
  const ids: number[] = [0];
  for (const ch of phonemes) {
    const id = KOKORO_VOCAB[ch];
    if (id != null) ids.push(id);
  }
  ids.push(0);
  // Context length 512 including pads
  if (ids.length > 512) {
    return [0, ...ids.slice(1, 511), 0].slice(0, 512);
  }
  return ids;
}
