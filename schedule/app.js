'use strict';

/* ========== 保存 ========== */
const STORE_KEY = 'myschedule.events.v1';
const FIRED_KEY = 'myschedule.fired.v1';

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('保存できませんでした（ストレージが無効です）'); return false; }
}

let events = load(STORE_KEY, []);
function persist() { save(STORE_KEY, events); }

/* ========== 日付ユーティリティ（すべてローカル時刻） ========== */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 86400000);
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const fmtDate = d => `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ========== 繰り返し判定 ========== */
// ev.repeat = { freq: 'none'|'daily'|'weekly'|'monthly'|'yearly', interval, byDay: [0-6], until: 'YYYY-MM-DD'|'' }
function occursOn(ev, date) {
  const key = ymd(date);
  if (key < ev.date) return false;
  const r = ev.repeat || { freq: 'none' };
  if (r.freq === 'none') return key === ev.date;
  if (r.until && key > r.until) return false;
  if (ev.exdates && ev.exdates.includes(key)) return false;
  const start = parseYmd(ev.date);
  const interval = Math.max(1, Number(r.interval) || 1);
  switch (r.freq) {
    case 'daily':
      return dayDiff(start, date) % interval === 0;
    case 'weekly': {
      const days = r.byDay && r.byDay.length ? r.byDay : [start.getDay()];
      if (!days.includes(date.getDay())) return false;
      const weekStart = d => addDays(d, -d.getDay());
      const weeks = Math.round(dayDiff(weekStart(start), weekStart(date)) / 7);
      return weeks % interval === 0;
    }
    case 'monthly': {
      if (date.getDate() !== start.getDate()) return false;
      const months = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
      return months % interval === 0;
    }
    case 'yearly': {
      if (date.getDate() !== start.getDate() || date.getMonth() !== start.getMonth()) return false;
      return (date.getFullYear() - start.getFullYear()) % interval === 0;
    }
  }
  return false;
}

function eventsOn(date) {
  return events
    .filter(ev => occursOn(ev, date))
    .sort((a, b) => (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}

function repeatLabel(r) {
  if (!r || r.freq === 'none') return '';
  const n = Number(r.interval) || 1;
  let s = {
    daily: n > 1 ? `${n}日ごと` : '毎日',
    weekly: (n > 1 ? `${n}週ごと` : '毎週') + (r.byDay && r.byDay.length ? ' ' + r.byDay.map(d => WEEK[d]).join('・') : ''),
    monthly: n > 1 ? `${n}か月ごと` : '毎月',
    yearly: n > 1 ? `${n}年ごと` : '毎年',
  }[r.freq];
  if (r.until) s += `（${r.until.replaceAll('-', '/')}まで）`;
  return s;
}
const remindLabel = m => m === '' || m == null ? '' :
  Number(m) === 0 ? '開始時刻に通知' : Number(m) === 1440 ? '1日前に通知' : Number(m) === 60 ? '1時間前に通知' : `${m}分前に通知`;

/* ========== 画面描画 ========== */
const $ = s => document.querySelector(s);
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
let viewMonth = new Date(today().getFullYear(), today().getMonth(), 1);
let selected = today();

function render() {
  $('#monthLabel').textContent = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;
  const grid = $('#grid');
  grid.replaceChildren();
  const first = addDays(viewMonth, -viewMonth.getDay());
  const t = ymd(today()), s = ymd(selected);
  const maxPills = window.matchMedia('(min-width: 640px)').matches ? 3 : 2;

  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i);
    if (i === 35 && d.getMonth() !== viewMonth.getMonth()) break; // 5週で収まる月は6週目を省略
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    btn.setAttribute('role', 'gridcell');
    if (d.getMonth() !== viewMonth.getMonth()) btn.classList.add('other');
    if (d.getDay() === 0) btn.classList.add('sun');
    if (d.getDay() === 6) btn.classList.add('sat');
    if (ymd(d) === t) btn.classList.add('today');
    if (ymd(d) === s) btn.classList.add('selected');
    const list = eventsOn(d);
    btn.setAttribute('aria-label', `${fmtDate(d)} 予定${list.length}件`);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = d.getDate();
    btn.append(num);
    list.slice(0, maxPills).forEach(ev => {
      const p = document.createElement('span');
      p.className = `pill c-${ev.color || 'blue'}`;
      p.textContent = ev.title;
      btn.append(p);
    });
    if (list.length > maxPills) {
      const m = document.createElement('span');
      m.className = 'more';
      m.textContent = `+${list.length - maxPills}`;
      btn.append(m);
    }
    btn.addEventListener('click', () => {
      selected = d;
      if (d.getMonth() !== viewMonth.getMonth()) viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    });
    btn.addEventListener('dblclick', () => openForm(null, d));
    grid.append(btn);
  }

  $('#agendaTitle').textContent = fmtDate(selected) + (ymd(selected) === t ? '・今日' : '');
  fillList($('#agendaList'), eventsOn(selected).map(ev => ({ ev, date: selected })), 'この日の予定はありません');

  const upcoming = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today(), i);
    eventsOn(d).forEach(ev => upcoming.push({ ev, date: d, showDate: true }));
  }
  fillList($('#upcomingList'), upcoming, '予定はありません');
}

function fillList(ul, items, emptyText) {
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    ul.append(li);
    return;
  }
  items.forEach(({ ev, date, showDate }) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'event-item';
    const bar = document.createElement('span');
    bar.className = `bar c-${ev.color || 'blue'}`;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = (showDate ? `${date.getMonth() + 1}/${date.getDate()}(${WEEK[date.getDay()]})\n` : '') +
      (ev.allDay ? '終日' : `${ev.start}${ev.end ? '–' + ev.end : ''}`);
    const body = document.createElement('span');
    body.className = 'body';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = ev.title;
    body.append(title);
    const meta = [repeatLabel(ev.repeat), remindLabel(ev.remind), ev.memo].filter(Boolean).join(' ・ ');
    if (meta) {
      const m = document.createElement('div');
      m.className = 'meta';
      m.textContent = meta;
      body.append(m);
    }
    b.append(bar, time, body);
    b.addEventListener('click', () => openForm(ev, date));
    li.append(b);
    ul.append(li);
  });
}

/* ========== 予定フォーム ========== */
const dlg = $('#eventDialog');
const form = $('#eventForm');
let editing = null;     // 編集中の予定
let editingDate = null; // タップした回の日付

function syncFormVisibility() {
  $('#timeRow').hidden = form.allDay.checked;
  const freq = form.freq.value;
  $('#repeatOpts').hidden = freq === 'none';
  $('#byDayField').hidden = freq !== 'weekly';
}
form.allDay.addEventListener('change', syncFormVisibility);
form.freq.addEventListener('change', () => {
  if (form.freq.value === 'weekly' && ![...form.byDay].some(c => c.checked)) {
    const wd = parseYmd(form.date.value || ymd(selected)).getDay();
    form.byDay[wd].checked = true;
  }
  syncFormVisibility();
});
form.start.addEventListener('change', () => {
  // 開始を変えたら終了を1時間後に寄せる（終了が開始以前の場合）
  if (form.end.value && form.end.value > form.start.value) return;
  const [h, m] = form.start.value.split(':').map(Number);
  form.end.value = `${pad(Math.min(23, h + 1))}:${pad(m)}`;
});

function openForm(ev, date) {
  editing = ev;
  editingDate = date || selected;
  form.reset();
  $('#formTitle').textContent = ev ? '予定を編集' : '予定を追加';
  $('#deleteArea').hidden = !ev;
  $('#deleteOneBtn').hidden = !(ev && ev.repeat && ev.repeat.freq !== 'none');
  $('#deleteAllBtn').textContent = ev && ev.repeat && ev.repeat.freq !== 'none' ? 'すべての回を削除' : '削除';
  if (ev) {
    form.title.value = ev.title;
    form.date.value = ev.date;
    form.allDay.checked = !!ev.allDay;
    form.start.value = ev.start || '10:00';
    form.end.value = ev.end || '';
    form.freq.value = ev.repeat?.freq || 'none';
    form.interval.value = String(ev.repeat?.interval || 1);
    form.until.value = ev.repeat?.until || '';
    [...form.byDay].forEach(c => { c.checked = (ev.repeat?.byDay || []).includes(Number(c.value)); });
    form.remind.value = ev.remind ?? '';
    form.color.value = ev.color || 'blue';
    form.memo.value = ev.memo || '';
  } else {
    form.date.value = ymd(editingDate);
    form.remind.value = '10';
  }
  syncFormVisibility();
  dlg.showModal();
  if (!ev) form.title.focus();
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.title.value.trim()) { form.title.focus(); return; }
  const freq = form.freq.value;
  const data = {
    title: form.title.value.trim(),
    date: form.date.value,
    allDay: form.allDay.checked,
    start: form.allDay.checked ? '' : form.start.value,
    end: form.allDay.checked ? '' : form.end.value,
    repeat: {
      freq,
      interval: Number(form.interval.value) || 1,
      byDay: freq === 'weekly' ? [...form.byDay].filter(c => c.checked).map(c => Number(c.value)) : [],
      until: freq === 'none' ? '' : form.until.value,
    },
    remind: form.remind.value,
    color: form.color.value,
    memo: form.memo.value.trim(),
  };
  if (data.repeat.until && data.repeat.until < data.date) { toast('終了日は開始日以降にしてください'); return; }
  if (editing) {
    const changedTiming = editing.date !== data.date || editing.start !== data.start || editing.remind !== data.remind;
    Object.assign(editing, data);
    if (changedTiming) clearFired(editing.id);
  } else {
    events.push({ id: uid(), exdates: [], ...data });
  }
  persist();
  dlg.close();
  selected = parseYmd(data.date);
  viewMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  render();
  scheduleReminders();
  toast('保存しました');
  if (data.remind !== '' && 'Notification' in window && Notification.permission === 'default') {
    setTimeout(() => toast('通知を受け取るには、メニューから通知を有効にしてください'), 1800);
  }
});

$('#deleteAllBtn').addEventListener('click', () => {
  if (!editing || !confirm(`「${editing.title}」を削除しますか？`)) return;
  events = events.filter(e => e !== editing);
  persist(); dlg.close(); render(); scheduleReminders(); toast('削除しました');
});
$('#deleteOneBtn').addEventListener('click', () => {
  if (!editing) return;
  editing.exdates = [...(editing.exdates || []), ymd(editingDate)];
  persist(); dlg.close(); render(); scheduleReminders(); toast(`${fmtDate(editingDate)}の回を削除しました`);
});

document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ========== ナビゲーション ========== */
$('#prevBtn').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); });
$('#nextBtn').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); render(); });
$('#todayBtn').addEventListener('click', () => { selected = today(); viewMonth = new Date(selected.getFullYear(), selected.getMonth(), 1); render(); });
$('#addBtn').addEventListener('click', () => openForm(null, selected));
$('#menuBtn').addEventListener('click', () => { updateNotifyStatus(); $('#menuDialog').showModal(); });

// 左右スワイプで月移動
let touchX = null;
$('#grid').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
$('#grid').addEventListener('touchend', e => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) (dx < 0 ? $('#nextBtn') : $('#prevBtn')).click();
});

/* ========== リマインダー ========== */
let timers = [];
let swReg = null;

function clearFired(id) {
  const fired = load(FIRED_KEY, {});
  Object.keys(fired).forEach(k => { if (k.startsWith(id + '@')) delete fired[k]; });
  save(FIRED_KEY, fired);
}

function upcomingReminders(hours = 48) {
  const now = Date.now();
  const out = [];
  for (let i = -1; i <= Math.ceil(hours / 24) + 1; i++) {
    const d = addDays(today(), i);
    events.forEach(ev => {
      if (ev.remind === '' || ev.remind == null || !occursOn(ev, d)) return;
      const [h, m] = (ev.allDay ? '09:00' : ev.start || '09:00').split(':').map(Number);
      const startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
      const fireAt = startAt - Number(ev.remind) * 60000;
      // 15分以内に過ぎたもの（アプリを閉じていた等）も拾う
      if (fireAt >= now - 15 * 60000 && fireAt <= now + hours * 3600000) {
        out.push({ key: `${ev.id}@${ymd(d)}`, ev, date: d, fireAt, startAt });
      }
    });
  }
  return out;
}

function scheduleReminders() {
  timers.forEach(clearTimeout);
  timers = [];
  const fired = load(FIRED_KEY, {});
  upcomingReminders().forEach(r => {
    if (fired[r.key]) return;
    const delay = Math.max(0, r.fireAt - Date.now());
    if (delay > 2147483647) return;
    timers.push(setTimeout(() => fireReminder(r), delay));
  });
}

async function fireReminder(r) {
  const fired = load(FIRED_KEY, {});
  if (fired[r.key]) return;
  fired[r.key] = Date.now();
  // 古い記録を掃除（7日より前）
  Object.keys(fired).forEach(k => { if (fired[k] < Date.now() - 7 * 86400000) delete fired[k]; });
  save(FIRED_KEY, fired);
  const when = r.ev.allDay ? `${fmtDate(r.date)} 終日` : `${fmtDate(r.date)} ${r.ev.start}${r.ev.end ? '–' + r.ev.end : ''}`;
  await notify(r.ev.title, when + (r.ev.memo ? `\n${r.ev.memo}` : ''), r.key);
}

async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    toast(`⏰ ${title}`);
    return;
  }
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true };
  try {
    const reg = swReg || (await navigator.serviceWorker?.getRegistration());
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fallthrough */ }
  try { new Notification(title, opts); } catch { toast(`⏰ ${title}`); }
}

function updateNotifyStatus() {
  const el = $('#notifyStatus');
  if (!('Notification' in window)) {
    el.textContent = 'この環境は通知に対応していません。iPhone はホーム画面に追加してから開くと通知を使えます（iOS 16.4 以降）。';
    return;
  }
  el.textContent = {
    granted: '通知は有効です。アプリを開いている間（バックグラウンド含む）に通知します。',
    denied: '通知がブロックされています。ブラウザ／端末の設定から許可してください。',
    default: 'まだ通知が許可されていません。',
  }[Notification.permission];
}

$('#notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) { updateNotifyStatus(); return; }
  const p = await Notification.requestPermission();
  updateNotifyStatus();
  if (p === 'granted') { toast('通知を有効にしました'); scheduleReminders(); }
});
$('#testNotifyBtn').addEventListener('click', () => notify('テスト通知', 'リマインダーはこのように届きます', 'test'));

// 再表示時・定期的に再スケジュール（スリープ復帰や日付変更への対応）
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); scheduleReminders(); } });
setInterval(scheduleReminders, 10 * 60000);

/* ========== 書き出し・バックアップ ========== */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
function icsFold(line) {
  const out = [];
  while (line.length > 70) { out.push(line.slice(0, 70)); line = ' ' + line.slice(70); }
  out.push(line);
  return out.join('\r\n');
}
const icsDate = s => s.replaceAll('-', '');
const icsDateTime = (date, time) => `${icsDate(date)}T${time.replace(':', '')}00`;
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function buildIcs() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MySchedule//JA', 'CALSCALE:GREGORIAN'];
  events.forEach(ev => {
    L.push('BEGIN:VEVENT', `UID:${ev.id}@myschedule`, `DTSTAMP:${stamp}`, `SUMMARY:${icsEscape(ev.title)}`);
    if (ev.allDay) {
      L.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`, `DTEND;VALUE=DATE:${icsDate(ymd(addDays(parseYmd(ev.date), 1)))}`);
    } else {
      L.push(`DTSTART:${icsDateTime(ev.date, ev.start)}`);
      if (ev.end && ev.end > ev.start) L.push(`DTEND:${icsDateTime(ev.date, ev.end)}`);
    }
    const r = ev.repeat;
    if (r && r.freq !== 'none') {
      let rule = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
      if (r.freq === 'weekly' && r.byDay?.length) rule += `;BYDAY=${r.byDay.map(d => BYDAY[d]).join(',')}`;
      if (r.until) rule += `;UNTIL=${icsDate(r.until)}${ev.allDay ? '' : 'T235959'}`;
      L.push(rule);
      (ev.exdates || []).forEach(x => L.push(ev.allDay ? `EXDATE;VALUE=DATE:${icsDate(x)}` : `EXDATE:${icsDateTime(x, ev.start)}`));
    }
    if (ev.memo) L.push(`DESCRIPTION:${icsEscape(ev.memo)}`);
    if (ev.remind !== '' && ev.remind != null) {
      // 終日予定は 0:00 基準なので、9:00 に合わせて +9時間
      const mins = ev.allDay ? Number(ev.remind) - 540 : Number(ev.remind);
      const trig = mins >= 0 ? `-PT${mins}M` : `PT${-mins}M`;
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:${trig}`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}

$('#icsBtn').addEventListener('click', () => {
  if (!events.length) { toast('書き出す予定がありません'); return; }
  download('my-schedule.ics', buildIcs(), 'text/calendar');
});
$('#backupBtn').addEventListener('click', () => {
  download(`my-schedule-backup-${ymd(today())}.json`, JSON.stringify({ version: 1, events }, null, 2), 'application/json');
});
$('#restoreInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(list) || list.some(x => !x || typeof x.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date))) throw new Error();
    if (!confirm(`${list.length}件の予定で置き換えます。よろしいですか？`)) return;
    events = list.map(x => ({ id: x.id || uid(), exdates: [], repeat: { freq: 'none' }, ...x }));
    persist(); render(); scheduleReminders();
    $('#menuDialog').close();
    toast('復元しました');
  } catch { toast('ファイルを読み込めませんでした'); }
});

/* ========== トースト ========== */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ========== PWA（インストール・オフライン） ========== */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBanner').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBanner').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#installBanner').hidden = true; toast('インストールしました'); });

// iOS Safari 向け案内（beforeinstallprompt が無いため）
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIos && !standalone) {
  const b = $('#installBanner');
  b.querySelector('span').textContent = '共有ボタン →「ホーム画面に追加」でアプリとして使えます';
  $('#installBtn').hidden = true;
  b.hidden = false;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => { swReg = reg; }).catch(() => {});
}

render();
scheduleReminders();
