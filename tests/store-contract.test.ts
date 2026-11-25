/**
 * 契约守卫：`Saved` 到底几个字段，三处必须说同一句话——
 *   1. `src/app/store.ts` 的 `export interface Saved`（唯一真相源，用 TS 语法树取，不靠缩进/正则猜）；
 *   2. `db/V*.sql` 里**最新一版**给 `anlewo_save.payload` 的 `COMMENT`；
 *   3. `docs/DB_SPLIT_FINAL.md` 里说 `Saved` 字段数的地方（含 F1 行那串字段名）。
 *
 * 为什么值得一条测试：这三处是手抄关系。加一个顶层字段时若漏改一处，老玩家的档会静默失效
 * （AGENTS：`v:1` 与 21 个字段不能悄悄改），而漏改的那处恰好是后来排错的人最信的。
 * 加字段的正确顺序：改 `store.ts` → 新写一版 `db/V<n>__*.sql` 改 `COMMENT`（不升 `v`、不动表结构）
 * → 更新文档现行口径。三处改齐，这条测试自然绿。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
/** 「N 字段」「N 个字段」「N 个 Saved 字段」都算：数字在前，字段在后 */
const COUNT_RE = /(\d+)\s*个?\s*(?:Saved\s*)?字段/g;

/** `Saved` 的顶层字段名（按源码顺序；靠语法树，注释/换行/可选标记都不影响） */
function savedFields(): string[] {
  const file = ts.createSourceFile('src/app/store.ts', read('src/app/store.ts'), ts.ScriptTarget.Latest, true);
  const decl = file.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'Saved');
  if (!decl) throw new Error('store.ts 里找不到 interface Saved');
  return decl.members.filter(ts.isPropertySignature).map((m) => m.name.getText(file).replace(/['"]/g, ''));
}

/** db 里生效的 payload 注释字段数：按版本号取最后一处（历史脚本保持当时的实读，V1 写的是 20） */
function dbPayloadCount(): { file: string; count: number } {
  const dir = join(ROOT, 'db');
  const files = readdirSync(dir)
    .filter((f) => /^V\d+__.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  let last: { file: string; count: number } | null = null;
  for (const f of files) {
    // 一份脚本里可能改多处注释，取最后一条（同一版本内以后写的为准）
    for (const m of read(join('db', f)).matchAll(/COMMENT ON COLUMN anlewo_save\.payload IS\s*'([^']*)'/g)) {
      const n = Number(m[1].match(/(\d+)\s*个?\s*(?:Saved\s*)?字段/)?.[1]);
      if (Number.isFinite(n)) last = { file: f, count: n };
    }
  }
  if (!last) throw new Error('db/*.sql 里没有任何一版说明 payload 该有几个字段');
  return last;
}

/** 文档里说 Saved 字段数的地方：数字必须与 store.ts 一致 */
function docCounts(doc: string): Array<{ line: number; count: number }> {
  const out: Array<{ line: number; count: number }> = [];
  doc.split('\n').forEach((line, i) => {
    // F1 行的第一列是「当时说的 17 字段」（历史稿），不是现行口径：切掉前两格再看
    const text = line.startsWith('| F1 |') ? line.split('|').slice(3).join('|') : line;
    for (const m of text.matchAll(COUNT_RE)) out.push({ line: i + 1, count: Number(m[1]) });
  });
  return out;
}

/** F1 行「现行口径」那一格里的字段名表：去掉加粗、反引号与括注，按 `/` 拆 */
function f1FieldList(doc: string): string[] {
  const f1 = doc.split('\n').find((l) => l.startsWith('| F1 |'));
  if (!f1) throw new Error('docs/DB_SPLIT_FINAL.md 里找不到 F1 那一行');
  const cell = f1.split('|')[3] ?? '';
  const list = cell.includes('：') ? cell.slice(cell.indexOf('：') + 1) : cell;
  return list
    .replace(/\*\*/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .split('/')
    .map((s) => s.replace(/[\s`]/g, ''))
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
}

describe('存档契约（Saved ↔ db 注释 ↔ DB_SPLIT_FINAL）', () => {
  const fields = savedFields();

  it('Saved 的字段名合理（不重复、含 v 与 world）', () => {
    expect(fields.length).toBeGreaterThanOrEqual(20);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toEqual(expect.arrayContaining(['v', 'world']));
  });

  it('db 最新一版 payload 注释里的字段数与 Saved 一致', () => {
    const db = dbPayloadCount();
    expect(db.count, `${db.file} 写的是 ${db.count} 字段，store.ts 是 ${fields.length}`).toBe(fields.length);
  });

  it('文档里的字段数与 Saved 一致，F1 行的字段名表与 Saved 逐一对应', () => {
    const doc = read('docs/DB_SPLIT_FINAL.md');
    const counts = docCounts(doc);
    expect(counts.length, '文档里没有一处写 Saved 字段数').toBeGreaterThan(0);
    for (const c of counts) expect(c.count, `第 ${c.line} 行写的是 ${c.count} 字段，store.ts 是 ${fields.length}`).toBe(fields.length);

    // 数对了还不够：F1 行的名字表也要对（防「数字改了、名字还是旧的」）
    expect(f1FieldList(doc).slice().sort()).toEqual(fields.slice().sort());
  });
});
