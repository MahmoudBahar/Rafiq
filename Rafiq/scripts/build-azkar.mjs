// One-off generator for src/features/azkar/data/azkar.generated.ts.
//   node scripts/build-azkar.mjs ../azkar_obj.json ../mushafs-2.json
//
// Sources (both kept outside the repo):
// - azkar_obj.json: a flat list of { category, count, description, reference, zekr }.
//   The morning and evening sets carry numeric counts; the waking, after-prayer and
//   sleep sets carry `count: ""` with the count written inside the text, so those are
//   read from the text and from the per-entry recipes below.
// - mushafs-2.json: Quranpedia.net's Hafs mushaf in the Uthmani (KFGQPC) text
//   (`/v1/mushafs/2`). Every Qur'an passage in the app is taken from it, so the
//   azkar file's own Qur'an spelling is never shipped. Licence: free to use inside
//   apps with no attribution required; the data is corrected continuously, resync
//   with https://quranpedia.net/api/v1/changes?since=2026-10-06.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_VERSION = 2;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);

const [azkarPath, mushafPath] = process.argv.slice(2);
if (!azkarPath || !mushafPath) {
  console.error('usage: node scripts/build-azkar.mjs <azkar_obj.json> <mushafs-2.json>');
  process.exit(1);
}
const records = JSON.parse(readFileSync(resolve(azkarPath), 'utf8'));
const mushaf = JSON.parse(readFileSync(resolve(mushafPath), 'utf8'));

// ---------------------------------------------------------------- Qur'an

const SURAHS = new Map(mushaf.data.surahs.map((s) => [s.id, s]));

/**
 * The KFGQPC text encodes four marks with stand-in codepoints that their own
 * fonts draw as the mushaf intends but every other font draws by the Unicode
 * name: the open tanween (idgham/ikhfa) as U+0657 inverted damma, U+065E fatha
 * with two dots and U+0656 subscript alef, and the small circle on a silent
 * letter (قَالُواْ، أُوْلَٰئِكَ) as the ordinary sukun U+0652 (a sounded sukun
 * is U+06E1). Scheherazade New has the proper glyphs, so the text is remapped.
 */
const LEGACY_MARKS = { '\u0657': '\u08F0', '\u065E': '\u08F1', '\u0656': '\u08F2', '\u0652': '\u06DF' };

/**
 * Everything a remapped ayah may contain: letters, alef wasla, the tatweel that
 * seats a hamza, harakat, superscript alef, the open tanween, and the Uthmani
 * recitation marks. Anything else is a codepoint this script has not vetted, so
 * the build stops and names it rather than ship a glyph nobody has looked at.
 */
const ALLOWED = /^[\u0621-\u064A\u0671\u0640\u064B-\u0651\u0653-\u0655\u0670\u08F0-\u08F2\u06D6-\u06DC\u06DF\u06E0-\u06E2\u06E4-\u06ED ]*$/;

/** One ayah's text, with the mushaf's own navigation mark (۞) and any BOM dropped. Tatweel stays: hamza sits on it. */
function ayah(surah, n) {
  const s = SURAHS.get(surah);
  const a = s?.ayahs.find((x) => x.number === n);
  if (!a) throw new Error(`mushaf: ${surah}:${n} not found`);
  const text = a.text
    .replace(/\ufeff/g, '')
    .replace(/۞/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .replace(/[\u0652\u0656\u0657\u065E]/g, (m) => LEGACY_MARKS[m]);
  if (!ALLOWED.test(text)) {
    const bad = [...text].find((ch) => !ALLOWED.test(ch));
    throw new Error(`mushaf ${surah}:${n}: unexpected U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return text;
}

const BASMALA = ayah(1, 1);
const surahName = (surah) => SURAHS.get(surah).name;

/** A run of ayat as one display string: each ayah followed by ۝ and its number; the basmala on its own line when asked. */
function passage(surah, from, to, { basmala = false } = {}) {
  const body = [];
  for (let n = from; n <= to; n++) body.push(`${ayah(surah, n)} ۝${ar(n)}`);
  const text = body.join(' ');
  return basmala ? `${BASMALA}\n${text}` : text;
}

const wholeSurah = (surah) => passage(surah, 1, SURAHS.get(surah).ayahs.length, { basmala: true });
/** The three Quls as three entries, each its own page and count, as the morning set has them. */
const QULS = (count) => [112, 113, 114].map((n) => ({ quran: wholeSurah(n), count, reference: surahName(n) }));
const KURSI = passage(2, 255, 255);
const BAQARA_END = passage(2, 285, 286);

// ---------------------------------------------------------------- text cleaning

/**
 * The source stretches words with tatweel (U+0640) for justification, which
 * breaks shaping in Scheherazade at large sizes. None of them is a seat for a
 * mark of its own: where a harakah follows one it belongs to the letter before
 * (فـِر), or repeats the mark that letter already has (بَـَح).
 */
function clean(text) {
  const out = text
    .normalize('NFC')
    .replace(/ـ/g, '')
    .replace(/([ً-ْ])\1+/g, '$1')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').replace(/ ([،.؛:])/g, '$1').trim())
    .filter(Boolean)
    .join('\n');
  return out.length > 0 ? out : null;
}

const COUNT_WORDS = '(ثَلاَثَاً|ثلاثاً وثلاثين|أربعاً وثلاثينَ|ثلاثاً|ثَلاَثَ مَرَّاتٍ)';

/**
 * The newer sets wrap hadith text in (( )) or ( ), write the count inside the
 * text, and add instructions and conditions in the same string. The wrappers and
 * the notes go; the words themselves are never changed. Instructions and
 * condition tails are stripped per entry below, since they are free text.
 */
function cleanZekr(text) {
  const t = text
    .normalize('NFC')
    .replace(new RegExp(`\\(\\s*${COUNT_WORDS}\\s*\\)`, 'g'), '')
    .replace(new RegExp(`\\[\\s*${COUNT_WORDS}\\s*\\]`, 'g'), '')
    .replace(/\(\s*يفعلُ ذلك ثلاثَ مرَّاتٍ\s*\)/g, '')
    .replace(/\(\(|\)\)|\(|\)/g, '')
    .replace(/,/g, '،')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ([،.؛:])/g, '$1')
    .trim()
    .replace(/\.\s*$/, '')
    .replace(/^[ .،]+|[ .،]+$/g, '');
  return clean(t);
}

/** The isti'adha the morning and evening sets put before آية الكرسي; the other passages take it too. */
const ISTIADHA = 'أَعُوذُ بِاللهِ مِنْ الشَّيْطَانِ الرَّجِيمِ';

/** Keeps the isti'adha line the source puts before a passage, replacing the passage itself. */
function withLeadLine(original, quranText, force = false) {
  const first = original.split('\n')[0];
  const lead = /أَعُوذُ بِاللهِ/.test(first) ? clean(first) : force ? ISTIADHA : null;
  return lead ? `${lead}\n${quranText}` : quranText;
}

/** Splits a cleaned compound entry into its stages; the regex must match the whole text. */
function split(text, re, counts) {
  const m = text.match(re);
  if (!m) throw new Error(`stage split failed: ${text.slice(0, 60)}`);
  const parts = m.slice(1);
  if (parts.length !== counts.length) throw new Error('stage split: wrong group count');
  return parts.map((p, i) => ({ text: p.trim().replace(/[،.]+$/, ''), count: counts[i] }));
}

// ---------------------------------------------------------------- sets

const SETS = [
  { id: 'morning', prefix: 'm', category: 'أذكار الصباح', expected: 31, countsInFile: true },
  { id: 'evening', prefix: 'e', category: 'أذكار المساء', expected: 30, countsInFile: true },
  { id: 'waking', prefix: 'w', category: 'أذكار الاستيقاظ من النوم', expected: 4, countsInFile: false },
  { id: 'prayer', prefix: 'p', category: 'الأذكار بعد السلام من الصلاة', expected: 8, countsInFile: false },
  { id: 'sleep', prefix: 's', category: 'أذكار النوم', expected: 13, countsInFile: false },
];
const COUNTS = new Set([1, 3, 4, 7, 10, 100]);

const TASBIH = /^(سُبْحَانَ اللَّهِ)،?\s+(وَالْحَمْدُ لِلَّهِ)،?\s+(وَاللَّهُ أَكْبَرُ)$/;

/** One page per phrase of a compound entry, each with its count; a phrase loses the و that joined it to the one before. */
const pages = (re, counts) => counts.map((count, i) => ({ count, pick: (t) => split(t, re, counts)[i].text.replace(/^وَ/, '') }));

/**
 * Per-entry recipes, keyed by the entry's position in the source (set prefix
 * plus 1-based index). `quran` replaces the text with a mushaf passage
 * (keeping a leading isti'adha line, or adding one with `istiadha`); `stages` splits a compound entry;
 * `tail` strips a condition written after the words; `prayers` limits an
 * after-prayer entry to certain prayers; `expand` turns one source entry into
 * several, each part able to `pick` its own words out of the cleaned text. Anything not listed is the cleaned source text, said once. Output
 * ids are renumbered after expansion.
 */
const RECIPES = {
  // shipped sets: only the Qur'an passages change, counts and virtues stay
  m01: { quran: KURSI },
  m02: { quran: wholeSurah(112) },
  m03: { quran: wholeSurah(113) },
  m04: { quran: wholeSurah(114) },
  e01: { quran: KURSI },
  e02: { quran: BAQARA_END },
  e03: { quran: wholeSurah(112) },
  e04: { quran: wholeSurah(113) },
  e05: { quran: wholeSurah(114) },

  w04: { quran: passage(3, 190, 200), istiadha: true, reference: 'آل عمران ١٩٠–٢٠٠' },

  s01: { expand: QULS(3) },
  s02: { quran: KURSI, istiadha: true, reference: 'آية الكرسي · البقرة ٢٥٥' },
  s03: { quran: BAQARA_END, reference: 'البقرة ٢٨٥–٢٨٦' },
  // Before sleep the three tasbihs are three pages, the last said thirty-four times; on their own
  // pages the second and third drop the و that joined them in the source.
  s08: { expand: pages(TASBIH, [33, 33, 34]) },
  // The two surahs read before sleep, a page each.
  s12: { expand: [32, 67].map((n) => ({ surahs: [{ name: surahName(n), text: wholeSurah(n) }], text: surahName(n), reference: surahName(n) })) },

  // After a prayer every phrase with its own count is its own page. The tahlil that opens the
  // second entry carries no count in the source, so that entry stays whole and is said once.
  p01: { expand: pages(/^(أَسْتَغْفِرُ اللَّهَ)\s+(اللَّهُمَّ أَنْتَ السَّلاَمُ.*)$/s, [3, 1]) },
  p04: { expand: pages(/^(سُبْحَانَ اللَّهِ)،\s+(وَالْحَمْدُ لِلَّهِ)،\s+(وَاللَّهُ أَكْبَرُ)\s+(لاَ إِلَهَ إِلاَّ اللَّهُ.*)$/s, [33, 33, 33, 1]) },
  p05: { expand: QULS(1) },
  p06: { quran: KURSI, istiadha: true, reference: 'آية الكرسي · البقرة ٢٥٥' },
  p07: { tail: /\s*عَشْرَ مَرّاتٍ بَعْدَ صَلاةِ الْمَغْرِبِ وَالصُّبْحِ\.?$/, count: 10, prayers: ['fajr', 'maghrib'] },
  p08: { tail: /\s*بَعْدَ السّلامِ مِنْ صَلاَةِ الفَجْرِ\.?$/, prayers: ['fajr'] },
};

const sets = SETS.map(({ id, prefix, category, expected, countsInFile }) => {
  const rows = records.filter((r) => r.category === category);
  if (rows.length !== expected) {
    throw new Error(`${category}: expected ${expected} entries, found ${rows.length}`);
  }
  const build = (r, i, recipe) => {
    // Tails are written in NFC; the source stores marks in other orders, so match on the normalised text.
    const source = r.zekr.normalize('NFC');
    const raw = recipe.tail ? source.replace(recipe.tail, '') : source;
    if (recipe.tail && raw === source) throw new Error(`${category} #${i + 1}: tail did not match`);
    const zekr = {
      id: '',
      text: countsInFile ? clean(raw) : cleanZekr(raw),
      count: countsInFile ? r.count : (recipe.count ?? 1),
      virtue: clean(r.description ?? ''),
      reference: recipe.reference ?? clean(r.reference ?? ''),
    };
    if (countsInFile && !COUNTS.has(r.count)) throw new Error(`${category} #${i + 1}: unexpected count ${r.count}`);
    if (!zekr.text) throw new Error(`${category} #${i + 1}: empty text`);
    if (recipe.quran) {
      zekr.text = withLeadLine(r.zekr.normalize('NFC'), recipe.quran, recipe.istiadha === true);
      zekr.kind = 'quran';
    }
    if (recipe.pick) zekr.text = recipe.pick(zekr.text);
    if (recipe.stages) {
      zekr.stages = recipe.stages(zekr.text);
      zekr.count = zekr.stages.reduce((n, s) => n + s.count, 0);
      zekr.text = zekr.stages.map((s) => s.text).join('، ');
    }
    if (recipe.surahs) {
      zekr.kind = 'surahs';
      zekr.text = recipe.text;
      zekr.surahs = recipe.surahs;
    }
    if (recipe.prayers) zekr.prayers = recipe.prayers;
    return zekr;
  };
  const items = rows.flatMap((r, i) => {
    const key = `${prefix}${String(i + 1).padStart(2, '0')}`;
    const recipe = RECIPES[key] ?? {};
    return recipe.expand ? recipe.expand.map((part) => build(r, i, { ...recipe, ...part })) : [build(r, i, recipe)];
  });
  items.forEach((z, i) => {
    z.id = `${prefix}${String(i + 1).padStart(2, '0')}`;
  });
  return { id, items };
});

// ---------------------------------------------------------------- checks and output

for (const { id, items } of sets) {
  for (const z of items) {
    if (z.stages && z.stages.reduce((n, s) => n + s.count, 0) !== z.count) throw new Error(`${z.id}: stage sum`);
    if (/[﻿۞]/.test(z.text)) throw new Error(`${z.id}: stray mark`);
    if (z.kind === 'quran' && !z.text.includes('۝')) throw new Error(`${z.id}: no ayah marks`);
  }
  void id;
}

const body = sets
  .map(({ id, items }) => `export const ${id.toUpperCase()}_AZKAR: readonly Zekr[] = ${JSON.stringify(items, null, 2)};`)
  .join('\n\n');

const out = `// GENERATED by scripts/build-azkar.mjs. Do not edit by hand.
// Qur'an text: Quranpedia.net Hafs mushaf, Uthmani text (https://quranpedia.net, free to use in apps).
import type { Zekr } from './types';

/** Bumped when entries are added, removed or reordered: saved progress is index-aligned. */
export const AZKAR_DATA_VERSION = ${DATA_VERSION};

${body}
`;

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/features/azkar/data/azkar.generated.ts');
writeFileSync(target, out);
console.log(`wrote ${target}: ${sets.map((s) => `${s.id} ${s.items.length}`).join(', ')}`);
for (const { id, items } of sets) {
  if (id === 'morning' || id === 'evening') continue;
  console.log(`-- ${id}`);
  for (const z of items) {
    const tag = [z.kind, z.stages && 'stages ' + z.stages.map((s) => s.count).join('/'), z.prayers && 'prayers ' + z.prayers.join(',')]
      .filter(Boolean)
      .join(' ');
    console.log(`${z.id} ×${String(z.count).padEnd(3)} ${tag.padEnd(24)} ${z.text.replace(/\n/g, ' / ').slice(0, 70)}`);
  }
}
