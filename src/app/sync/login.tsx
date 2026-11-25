/**
 * 留名 / 凭帖 —— 统一身份的登录弹窗。
 *
 * 功能照六爻的 `src/ui/AuthSheet.tsx` 搬：留名（称呼 + 邮箱 + 密码 + 验证码）、凭帖（密码或邮箱验证码）。
 * 两点不同：
 *   · 令牌不进前端：提交给同步服务，由服务端用 `anlewo` 客户端换令牌、写 SSO cookie，
 *     前端只拿到「我是谁」（`{id,name,email}`）；
 *   · 用安乐窝自己的纸墨样式（内联样式，不新增全局类名，避免碰玩法侧的样式表）。
 *
 * 未登录时由 `index.ts` 打开；登录成功后才起同步。弹窗必须完成登录才能关闭。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { IdentityUser, SyncClient } from './client';

const CODE_COOLDOWN = 60;

export interface LoginDone {
  user: IdentityUser;
  bound: boolean;
}

/** 在一个临时DOM节点里打开弹窗，关掉即卸载；只在这一个 Promise 上说结果 */
export function openLogin(client: SyncClient): Promise<LoginDone | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise<LoginDone | null>((resolve) => {
    let settled = false;
    const close = (value: LoginDone | null): void => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(<LoginSheet client={client} onDone={close} onClose={() => close(null)} />);
  });
}

/** identity 的错误码 → 一句话（与服务端 identity.mjs 的 explain 同一口径） */
function explain(code: string, status: number): string {
  if (code === 'invalid_credentials') return '邮箱或密码不对';
  if (code === 'invalid_code') return '验证码不正确或已过期';
  if (code === 'email_taken') return '这个邮箱已留过名，请直接登录';
  if (code === 'password_invalid') return '密码需 8–64 位，并同时包含字母和数字';
  if (code === 'invalid_request' || code === 'bad_email') return '称呼或邮箱格式不对';
  if (code === 'account_disabled') return '账号不可用';
  if (code === 'mail_unavailable') return '邮件服务暂时不可用，请稍后重试';
  if (code === 'rate_limited' || status === 429) return '稍候片刻再试';
  if (code === 'identity_disabled') return '身份服务还没开';
  return '身份服务暂时连不上';
}

function LoginSheet({ client, onDone, onClose }: {
  client: SyncClient;
  onDone: (done: LoginDone) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'register' | 'login'>('login');
  const [byCode, setByCode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hintId = useId();
  const sheet = useRef<HTMLFormElement>(null);

  useEffect(() => {
    sheet.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const emailValue = email.trim().toLowerCase();
  const emailOk = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/u.test(emailValue);
  const codeOk = /^\d{6}$/.test(code);
  const passwordIssues = [
    pw.length < 8 ? '至少输入 8 位' : pw.length > 64 ? '不能超过 64 位' : '',
    !/[A-Za-z]/.test(pw) ? '包含英文字母' : '',
    !/\d/.test(pw) ? '包含数字' : '',
    /[\x00-\x1f\x7f]/.test(pw) ? '移除换行等控制字符' : '',
  ].filter(Boolean);
  const passwordOk = passwordIssues.length === 0;
  const needCode = mode === 'register' || byCode;
  const ok = mode === 'register'
    ? !!(name.trim() && emailOk && passwordOk && codeOk)
    : byCode ? !!(emailOk && codeOk) : !!(emailOk && pw.length >= 1);

  function switchMode(next: 'register' | 'login'): void {
    setMode(next);
    setByCode(false);
    setCode('');
    setErr('');
  }

  async function sendCode(): Promise<void> {
    if (sending || cooldown > 0 || !emailOk) return;
    setSending(true);
    setErr('');
    const r = await client.identitySendCode(mode === 'register' ? 'signup' : 'login', emailValue);
    setSending(false);
    if (r.ok) {
      setCode('');
      setCooldown(CODE_COOLDOWN);
      return;
    }
    setErr(explain(r.code, r.status));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    const r = mode === 'register'
      ? await client.identitySignup({ name: name.trim(), email: emailValue, password: pw, code })
      : await client.identityLogin(byCode ? { email: emailValue, code } : { email: emailValue, password: pw });
    if (r.ok) {
      onDone({ user: r.user, bound: r.bound });
      return;
    }
    setBusy(false);
    setErr(explain(r.code, r.status));
  }

  return (
    <div style={S.scrim}>
      <form
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-label={mode === 'register' ? '留名' : '登录'}
        style={S.sheet}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <div style={S.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} disabled={busy}
            style={mode === 'login' ? S.tabOn : S.tab} onClick={() => switchMode('login')}>凭帖入</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} disabled={busy}
            style={mode === 'register' ? S.tabOn : S.tab} onClick={() => switchMode('register')}>留名</button>
        </div>

        {mode === 'login' ? (
          <div style={S.methods} role="group" aria-label="登录方式">
            <button type="button" disabled={busy} aria-pressed={!byCode}
              style={!byCode ? S.methodOn : S.method} onClick={() => { setByCode(false); setCode(''); setErr(''); }}>密码</button>
            <button type="button" disabled={busy} aria-pressed={byCode}
              style={byCode ? S.methodOn : S.method} onClick={() => { setByCode(true); setCode(''); setErr(''); }}>验证码</button>
          </div>
        ) : (
          <label style={S.field}>
            <span style={S.label}>称呼</span>
            <input style={S.input} disabled={busy} value={name} maxLength={24} autoComplete="nickname"
              placeholder="如何称呼你" onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        <label style={S.field}>
          <span style={S.label}>邮箱</span>
          <span style={S.row}>
            <input style={S.input} type="email" inputMode="email" disabled={busy} value={email}
              autoComplete="email" placeholder="name@example.com"
              onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
            {needCode ? (
              <button type="button" style={S.codeBtn} disabled={busy || sending || cooldown > 0 || !emailOk}
                onClick={() => void sendCode()}>
                {sending ? '发送中…' : cooldown > 0 ? `${cooldown}s` : '发送验证码'}
              </button>
            ) : null}
          </span>
        </label>

        {needCode ? (
          <label style={S.field}>
            <span style={S.label}>验证码</span>
            <input style={S.input} inputMode="numeric" autoComplete="one-time-code" disabled={busy}
              maxLength={6} value={code} placeholder="邮箱收到的 6 位数字"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
        ) : null}

        {mode === 'register' || !byCode ? (
          <label style={S.field}>
            <span style={S.label}>密码</span>
            <span style={S.row}>
              <input style={S.input} type={show ? 'text' : 'password'} disabled={busy} value={pw}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? '8–64 位，含字母和数字' : ''}
                aria-describedby={mode === 'register' ? hintId : undefined}
                aria-invalid={mode === 'register' && pw.length > 0 && !passwordOk ? true : undefined}
                onChange={(e) => setPw(e.target.value)} />
              <button type="button" style={S.eye} disabled={busy} aria-label={show ? '隐藏密码' : '显示密码'}
                onClick={() => setShow(!show)}>{show ? '藏' : '显'}</button>
            </span>
          </label>
        ) : null}

        {mode === 'register' ? (
          <p id={hintId} style={S.hint} aria-live="polite">
            {!pw ? '密码需 8–64 位，同时包含英文字母和数字。' : !passwordOk ? `密码还需：${passwordIssues.join('、')}。` : '密码已符合要求。'}
          </p>
        ) : null}

        {err ? <p style={S.err} role="alert">{err}</p> : null}

        <button type="submit" style={ok && !busy ? S.submitOn : S.submit} disabled={!ok || busy}>
          {busy ? '落印中…' : mode === 'register' ? '落印留名' : '凭帖入内'}
        </button>
      </form>
    </div>
  );
}

const INK = '#2c2a26';
const PAPER = '#f5efe1';
const SEAL = '#9a3b2f';

const S: Record<string, React.CSSProperties> = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(20, 18, 16, 0.48)', padding: 16,
  },
  sheet: {
    width: 'min(420px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'flex',
    flexDirection: 'column', gap: 12, padding: '22px 22px 18px', borderRadius: 14,
    background: `linear-gradient(180deg, #fbf7ec, ${PAPER})`, color: INK,
    boxShadow: '0 18px 60px rgba(0,0,0,.38), inset 0 0 0 1px rgba(44,42,38,.14)',
    font: '14px/1.5 "Noto Serif SC", "Songti SC", serif', outline: 'none',
  },
  tabs: { display: 'flex', gap: 6, borderBottom: '1px solid rgba(44,42,38,.16)', paddingBottom: 8 },
  tab: {
    flex: 1, padding: '6px 0', background: 'transparent', color: 'rgba(44,42,38,.6)',
    border: 'none', font: 'inherit', fontSize: 15, letterSpacing: '.12em', cursor: 'pointer',
  },
  tabOn: {
    flex: 1, padding: '6px 0', background: 'transparent', color: INK, border: 'none',
    font: 'inherit', fontSize: 15, letterSpacing: '.12em', cursor: 'pointer',
    fontWeight: 600, boxShadow: `inset 0 -2px 0 ${SEAL}`,
  },
  methods: { display: 'flex', gap: 8 },
  method: {
    flex: 1, padding: '5px 0', borderRadius: 8, border: '1px solid rgba(44,42,38,.22)',
    background: 'transparent', color: 'rgba(44,42,38,.7)', font: 'inherit', cursor: 'pointer',
  },
  methodOn: {
    flex: 1, padding: '5px 0', borderRadius: 8, border: `1px solid ${SEAL}`,
    background: 'rgba(154,59,47,.08)', color: SEAL, font: 'inherit', cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, letterSpacing: '.18em', color: 'rgba(44,42,38,.62)' },
  row: { display: 'flex', gap: 8, alignItems: 'stretch' },
  input: {
    flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9,
    border: '1px solid rgba(44,42,38,.22)', background: 'rgba(255,253,246,.9)',
    color: INK, font: 'inherit', outline: 'none',
  },
  codeBtn: {
    flex: '0 0 auto', padding: '0 12px', borderRadius: 9, border: `1px solid rgba(154,59,47,.4)`,
    background: 'rgba(154,59,47,.06)', color: SEAL, font: 'inherit', fontSize: 12, cursor: 'pointer',
  },
  eye: {
    flex: '0 0 auto', width: 44, borderRadius: 9, border: '1px solid rgba(44,42,38,.22)',
    background: 'transparent', color: 'rgba(44,42,38,.7)', font: 'inherit', cursor: 'pointer',
  },
  hint: { margin: 0, fontSize: 12, color: 'rgba(44,42,38,.6)' },
  err: { margin: 0, fontSize: 13, color: SEAL },
  submit: {
    marginTop: 4, padding: '11px 0', borderRadius: 10, border: 'none',
    background: 'rgba(44,42,38,.16)', color: 'rgba(44,42,38,.5)', font: 'inherit',
    fontSize: 15, letterSpacing: '.16em', cursor: 'not-allowed',
  },
  submitOn: {
    marginTop: 4, padding: '11px 0', borderRadius: 10, border: 'none',
    background: SEAL, color: '#fdf8ee', font: 'inherit', fontSize: 15,
    letterSpacing: '.16em', cursor: 'pointer',
  },
};
