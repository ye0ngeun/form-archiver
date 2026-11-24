import { makeFilename, TIMING_LABEL, toMarkdown } from '../../lib/markdown';
import { describeBlock } from '../../lib/preview';
import type { Block, PageRecord, RecordTiming } from '../../lib/types';

/**
 * 팝업 화면. 추출 결과를 받아 미리보기·제외·마크다운 저장을 한다.
 * 결과를 어디서 가져오는지(load)는 바깥에서 정한다:
 * - 확장 팝업(main.ts): 현재 탭에서 읽는다.
 * - 개발용 미리보기(tests/preview): 시험 페이지에서 읽는다.
 *
 * ⚠️ 페이지에서 읽은 글자는 반드시 textContent 로만 넣는다(innerHTML 금지).
 * 지원서 페이지의 글자가 팝업 안에서 HTML 로 해석되면 안 되기 때문이다.
 */

export interface PopupOptions {
  load: () => Promise<PageRecord>;
  now?: () => Date;
}

type Tab = 'items' | 'markdown';
type Filter = 'all' | 'fields';

interface State {
  record: PageRecord | null;
  error: string | null;
  excluded: Set<string>;
  timing: RecordTiming;
  tab: Tab;
  filter: Filter;
  savedAs: string | null;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function blockKey(b: Block): string {
  switch (b.type) {
    case 'field':
    case 'skipped':
      return `${b.type}:${b.label}`;
    case 'heading':
    case 'text':
      return `${b.type}:${b.text}`;
    case 'list':
      return `list:${b.items.join('\n')}`;
    case 'table':
      return `table:${b.caption}:${b.rows[0]?.cells.join('|') ?? ''}`;
  }
}

export function mountPopup(root: HTMLElement, opts: PopupOptions) {
  const now = opts.now ?? (() => new Date());
  const state: State = {
    record: null,
    error: null,
    excluded: new Set(),
    timing: 'before-submit',
    tab: 'items',
    filter: 'all',
    savedAs: null,
  };

  async function reload() {
    // 다시 읽어도 사용자가 뺀 항목은 계속 빼 둔다. 블록 id 는 다시 매겨지므로 모양(종류+항목명/글)으로 맞춘다.
    const prev = state.record;
    const excludedKeys = new Set(
      prev ? prev.blocks.filter((b) => state.excluded.has(b.id)).map(blockKey) : [],
    );
    state.record = null;
    state.error = null;
    state.savedAs = null;
    render();
    try {
      const next = await opts.load();
      state.excluded = new Set(
        next.blocks.filter((b) => excludedKeys.has(blockKey(b))).map((b) => b.id),
      );
      state.record = next;
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    render();
  }

  function currentMarkdown(savedAt: Date): string {
    if (!state.record) return '';
    return toMarkdown(state.record, { savedAt, timing: state.timing, excluded: state.excluded });
  }

  function download() {
    if (!state.record) return;
    const savedAt = now();
    const md = currentMarkdown(savedAt);
    const filename = makeFilename(state.record, { savedAt, timing: state.timing });
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    state.savedAs = filename;
    render();
  }

  // ---------- 그리기 ----------

  function renderHeader(r: PageRecord) {
    const s = r.stats;
    const chips = h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip' }, `입력칸 ${s.fields}`),
      s.emptyFields ? h('span', { class: 'chip warn' }, `빈칸 ${s.emptyFields}`) : null,
      s.guessedLabels ? h('span', { class: 'chip warn' }, `항목명 짐작 ${s.guessedLabels}`) : null,
      s.skipped ? h('span', { class: 'chip muted' }, `민감칸 제외 ${s.skipped}`) : null,
    );
    return h(
      'header',
      { class: 'head' },
      h('div', { class: 'title', title: r.title }, r.title),
      h('div', { class: 'url', title: r.url }, r.url),
      chips,
    );
  }

  function renderTabs() {
    const tab = (id: Tab, label: string) => {
      const b = h(
        'button',
        { class: `tab${state.tab === id ? ' on' : ''}`, type: 'button', role: 'tab' },
        label,
      );
      b.setAttribute('aria-selected', String(state.tab === id));
      b.addEventListener('click', () => {
        state.tab = id;
        render();
      });
      return b;
    };
    return h(
      'nav',
      { class: 'tabs', role: 'tablist' },
      tab('items', '항목'),
      tab('markdown', '마크다운'),
    );
  }

  function renderToolbar(r: PageRecord) {
    const filter = h('select', { 'aria-label': '보기' });
    for (const [v, label] of [
      ['all', '전체 보기'],
      ['fields', '입력칸만 보기'],
    ] as const) {
      const o = h('option', { value: v }, label);
      if (state.filter === v) o.selected = true;
      filter.append(o);
    }
    filter.addEventListener('change', () => {
      state.filter = filter.value as Filter;
      render();
    });

    const textIds = r.blocks
      .filter((b) => b.type !== 'field' && b.type !== 'skipped')
      .map((b) => b.id);
    const allTextOut = textIds.length > 0 && textIds.every((id) => state.excluded.has(id));
    const toggleText = h(
      'button',
      { type: 'button', class: 'link' },
      allTextOut ? '화면 글 다시 넣기' : '화면 글 모두 빼기',
    );
    toggleText.addEventListener('click', () => {
      for (const id of textIds) {
        if (allTextOut) state.excluded.delete(id);
        else state.excluded.add(id);
      }
      render();
    });
    return h('div', { class: 'toolbar' }, filter, textIds.length ? toggleText : null);
  }

  function renderItems(r: PageRecord) {
    const list = h('ul', { class: 'items' });
    for (const b of r.blocks) {
      if (state.filter === 'fields' && b.type !== 'field' && b.type !== 'skipped') continue;
      const s = describeBlock(b);
      const out = state.excluded.has(b.id);
      const li = h('li', {
        class: `item type-${b.type}${out ? ' out' : ''}${b.type === 'field' && b.empty ? ' empty' : ''}`,
      });
      let control: HTMLElement;
      if (s.excludable) {
        const cb = h('input', { type: 'checkbox', 'aria-label': `${s.title || s.kind} 포함` });
        cb.checked = !out;
        cb.addEventListener('change', () => {
          if (cb.checked) state.excluded.delete(b.id);
          else state.excluded.add(b.id);
          state.savedAs = null;
          render();
        });
        control = cb;
      } else {
        control = h('span', { class: 'lock', title: '저장하지 않음' }, '—');
      }
      const badges = h('span', { class: 'badges' });
      for (const bd of s.badges) badges.append(h('span', { class: `badge ${bd.tone}` }, bd.text));
      li.append(
        h(
          'label',
          { class: 'row' },
          control,
          h(
            'span',
            { class: 'main' },
            h(
              'span',
              { class: 'line1' },
              h('span', { class: 'kind' }, s.kind),
              s.title ? h('span', { class: 'label' }, s.title) : null,
              badges,
            ),
            s.body ? h('span', { class: 'body' }, s.body) : null,
          ),
        ),
      );
      list.append(li);
    }
    if (!list.childElementCount) list.append(h('li', { class: 'none' }, '보여줄 항목이 없습니다.'));
    return list;
  }

  function renderMarkdown() {
    return h('pre', { class: 'md' }, currentMarkdown(now()));
  }

  function renderFooter() {
    const timing = h('div', { class: 'timing', role: 'radiogroup', 'aria-label': '기록 시점' });
    for (const t of Object.keys(TIMING_LABEL) as RecordTiming[]) {
      const input = h('input', { type: 'radio', name: 'timing', value: t });
      input.checked = state.timing === t;
      input.addEventListener('change', () => {
        state.timing = t;
        state.savedAs = null;
        render();
      });
      timing.append(h('label', { class: 'seg' }, input, h('span', {}, TIMING_LABEL[t])));
    }
    const save = h('button', { type: 'button', class: 'primary' }, '마크다운 저장');
    save.addEventListener('click', download);
    const reloadBtn = h(
      'button',
      { type: 'button', class: 'ghost', title: '페이지를 다시 읽습니다' },
      '다시 읽기',
    );
    reloadBtn.addEventListener('click', reload);
    return h(
      'footer',
      { class: 'foot' },
      timing,
      h('div', { class: 'actions' }, reloadBtn, save),
      state.savedAs
        ? h('div', { class: 'saved', role: 'status' }, `저장했습니다: ${state.savedAs}`)
        : null,
    );
  }

  function render() {
    // 체크박스를 누를 때마다 다시 그리므로, 목록의 스크롤 위치를 유지한다.
    const prevScroll = root.querySelector('.content')?.scrollTop ?? 0;
    const prevTab = root.dataset.tab;
    root.dataset.tab = state.tab;
    root.replaceChildren();
    queueMicrotask(() => {
      const c = root.querySelector('.content');
      if (c && prevTab === state.tab) c.scrollTop = prevScroll;
    });
    if (state.error) {
      const retry = h('button', { type: 'button', class: 'ghost' }, '다시 시도');
      retry.addEventListener('click', reload);
      root.append(
        h('div', { class: 'message error', role: 'alert' }, h('p', {}, state.error), retry),
      );
      return;
    }
    if (!state.record) {
      root.append(h('div', { class: 'message' }, h('p', {}, '페이지를 읽는 중…')));
      return;
    }
    const r = state.record;
    root.append(
      renderHeader(r),
      renderTabs(),
      state.tab === 'items' ? renderToolbar(r) : '',
      h('section', { class: 'content' }, state.tab === 'items' ? renderItems(r) : renderMarkdown()),
      renderFooter(),
    );
  }

  void reload();
}
