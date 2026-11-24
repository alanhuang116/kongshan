// 首轮对账的判据：不空写、不拿旧档盖新档、本地真有改动才推。这段错了就是丢档，所以逐格测。
import { describe, expect, it } from 'vitest';
import { decideReconcile, hashText, type Anchor, type RemoteLike } from '../src/app/sync/reconcile';

const LOCAL = '{"v":1,"visits":3}';
const H_LOCAL = hashText(LOCAL);
const remoteAt = (revision: number): RemoteLike => ({ revision, payload: { v: 1, visits: 9 } });
const anchorAt = (revision: number, hash: string): Anchor => ({ v: 1, revision, hash });

const decide = (
  local: { raw: string | null; hash: string },
  remote: { ok: boolean; data: RemoteLike | null },
  anchor: Anchor | null,
) => decideReconcile(local, remote, anchor);

describe('首轮对账', () => {
  it('拉不到服务端：什么都不做（本地是唯一真相源）', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: false, data: null }, anchorAt(3, H_LOCAL));
    expect(d.action).toBe('noop');
    expect(d.reason).toBe('remote-unavailable');
  });

  it('两边都空：什么都不做', () => {
    const d = decide({ raw: null, hash: '' }, { ok: true, data: null }, null);
    expect(d.action).toBe('noop');
  });

  it('只有本地有：首发（baseRevision=0）', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: null }, null);
    expect(d.action).toBe('push-first');
    expect(d.baseRevision).toBe(0);
  });

  it('只有服务端有：采纳服务端（恢复）', () => {
    const d = decide({ raw: null, hash: '' }, { ok: true, data: remoteAt(7) }, null);
    expect(d.action).toBe('adopt');
    expect(d.baseRevision).toBe(7);
  });

  it('已对齐（revision 与本地摘要都对得上）：不空写', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: remoteAt(7) }, anchorAt(7, H_LOCAL));
    expect(d.action).toBe('noop');
    expect(d.reason).toBe('in-sync');
  });

  it('本地自上次同步没动、服务端前进了：采纳服务端（另一台设备写的）', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: remoteAt(8) }, anchorAt(7, H_LOCAL));
    expect(d.action).toBe('adopt');
    expect(d.reason).toBe('local-unchanged-remote-ahead');
  });

  it('本地改过、服务端没动：推本地（base=服务端当前版本）', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: remoteAt(7) }, anchorAt(7, hashText('old')));
    expect(d.action).toBe('push');
    expect(d.baseRevision).toBe(7);
    expect(d.reason).toBe('local-changed');
  });

  it('两边都动过：本地优先（覆盖前由服务端留底），不静默丢本地', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: remoteAt(9) }, anchorAt(7, hashText('old')));
    expect(d.action).toBe('push');
    expect(d.baseRevision).toBe(9);
  });

  it('没有锚（第一次开同步）但本地与服务端都有：推本地', () => {
    const d = decide({ raw: LOCAL, hash: H_LOCAL }, { ok: true, data: remoteAt(2) }, null);
    expect(d.action).toBe('push');
    expect(d.reason).toBe('no-anchor');
    expect(d.baseRevision).toBe(2);
  });
});

describe('文本摘要', () => {
  it('同样内容摘要稳定', () => {
    expect(hashText(LOCAL)).toBe(hashText(LOCAL));
    expect(hashText(LOCAL)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('内容变了摘要就变', () => {
    expect(hashText(LOCAL)).not.toBe(hashText(LOCAL + ' '));
    expect(hashText('')).not.toBe(hashText(' '));
  });
  it('长文本也不塌（3000 条起居注量级）', () => {
    const long = JSON.stringify({ journal: Array.from({ length: 3000 }, (_, i) => ({ t: i, kind: 'walk' })) });
    expect(hashText(long)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText(long)).not.toBe(hashText(long + 'x'));
  });
});
