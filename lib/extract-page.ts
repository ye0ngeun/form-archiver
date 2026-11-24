import type { Block, ChoiceOption, FieldBlock, LabelSource, PageRecord } from './types';

/**
 * 현재 페이지의 화면 내용과 입력 상태를 문서 순서대로 읽어 블록 목록으로 돌려준다.
 * 페이지를 바꾸지 않는다: 값을 넣거나, 클릭하거나, 제출하지 않는다.
 *
 * ⚠️ 이 함수는 팝업에서 chrome.scripting.executeScript({ func: extractPage }) 로
 * 사용자의 탭 안에 "글자 그대로" 옮겨져 실행된다. 그래서 바깥의 변수·함수·import 를
 * 쓸 수 없고, 필요한 도우미 함수는 모두 이 함수 안에 둔다. (타입 import 는 괜찮다:
 * 빌드할 때 지워진다.)
 *
 * 테스트에서는 jsdom 으로 만든 document/window 를 넘겨 부른다.
 */
export function extractPage(doc: Document = document, win: Window = window): PageRecord {
  const BLOCK_TAGS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DD',
    'DETAILS',
    'DIALOG',
    'DIV',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'HEADER',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'P',
    'PRE',
    'SECTION',
    'SUMMARY',
    'LABEL',
    'LEGEND',
    'OL',
    'UL',
    'TR',
  ]);
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'SVG',
    'CANVAS',
    'VIDEO',
    'AUDIO',
    'OBJECT',
    'EMBED',
    'HEAD',
    'META',
    'LINK',
    'BUTTON',
    'OPTION',
    'DATALIST',
    'IMG',
  ]);
  const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  // 지원 내용과 무관한 민감 입력칸. name·id·autocomplete 에 이런 말이 있으면 값을 읽지 않는다.
  const SENSITIVE_NAME =
    /(passw|pwd|비밀번호|otp|one[-_ ]?time|인증\s*번호|verif\w*[-_ ]?code|auth[-_ ]?code|cvc|cvv|card[-_ ]?num|주민|resident|ssn|captcha)/i;
  const SENSITIVE_AUTOCOMPLETE = /\b(one-time-code|current-password|new-password|cc-\w+)\b/i;
  // 바로 앞 문단을 항목명으로 끌어올 때 허용하는 최대 길이(질문 제목 정도)
  const ADJACENT_LABEL_MAX = 150;

  const blocks: Block[] = [];
  let inlineBuf = '';
  let seq = 0;
  /** 입력칸의 항목명으로 쓰인 label/legend 등. 화면 내용으로 다시 내보내지 않는다. */
  const consumed = new Set<Element>();
  const handledRadioGroups = new Set<string>();
  const handledCheckGroups = new Set<Element>();
  /** fieldset 이 끝난 뒤의 문단은 다음 입력칸이 항목명으로 끌어가지 않게 표시한다. */
  const boundaryIds = new Set<string>();

  const nextId = () => `b${++seq}`;

  // ---------- 글자 다루기 ----------

  function clean(text: string): string {
    return text
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function oneLine(text: string | null | undefined): string {
    return clean(text ?? '').replace(/\n+/g, ' ');
  }

  function isHidden(el: Element): boolean {
    if ((el as HTMLElement).hidden) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    const cs = styleOf(el);
    return !!cs && (cs.display === 'none' || cs.visibility === 'hidden');
  }

  function childrenOf(node: Node): Node[] {
    const list: Node[] = [];
    const sr = (node as Element).shadowRoot;
    if (sr) list.push(...Array.from(sr.childNodes));
    list.push(...Array.from(node.childNodes));
    return list;
  }

  function isEditableRoot(el: Element): boolean {
    const ce = el.getAttribute('contenteditable');
    if (ce === null || ce === 'false') return false;
    // 편집 영역 안쪽 요소가 아니라 바깥 경계만 입력칸으로 본다.
    const parent = el.parentElement?.closest('[contenteditable]');
    return !parent || parent.getAttribute('contenteditable') === 'false';
  }

  function isFormControl(el: Element): boolean {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (isEditableRoot(el)) return true;
    return el.getAttribute('role') === 'textbox' && !el.querySelector('input, textarea');
  }

  function containsControls(el: Element): boolean {
    return !!el.querySelector('input, textarea, select, [contenteditable], [role="textbox"]');
  }

  function isSensitive(el: Element): boolean {
    if ((el.getAttribute('type') ?? '').toLowerCase() === 'password') return true;
    const ac = el.getAttribute('autocomplete') ?? '';
    if (SENSITIVE_AUTOCOMPLETE.test(ac)) return true;
    return SENSITIVE_NAME.test(`${el.getAttribute('name') ?? ''} ${el.id}`);
  }

  /** 표 셀처럼 입력칸이 섞인 영역의 글자: 입력칸 자리에 현재 값을 끼워 넣는다. */
  function textOf(root: Element): string {
    let out = '';
    /** 끝에 줄바꿈이 n 개 이상 있게 한다(블록이 겹쳐도 빈 줄이 불어나지 않게). */
    const breakTo = (n: number) => {
      if (!out.trim()) return;
      const have = /\n*$/.exec(out)?.[0].length ?? 0;
      if (have < n) out += '\n'.repeat(n - have);
    };
    const rec = (node: Node) => {
      if (node.nodeType === 3) {
        out += sourceText(node);
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName) || isHidden(el)) return;
      if (el.tagName === 'BR') {
        out += '\n';
        return;
      }
      if (isFormControl(el)) {
        const v = inlineControlValue(el);
        if (v) out += ` ${v} `;
        return;
      }
      if (isFileLink(el)) out += '📎 ';
      const gap = breakBefore(el);
      breakTo(gap);
      for (const c of childrenOf(el)) rec(c);
      breakTo(gap);
    };
    rec(root);
    return clean(out);
  }

  // ---------- 화면에 보이는 대로 읽기 ----------

  const styleCache = new WeakMap<Element, CSSStyleDeclaration | null>();
  function styleOf(el: Element): CSSStyleDeclaration | null {
    if (!styleCache.has(el)) {
      let cs: CSSStyleDeclaration | null = null;
      try {
        cs = (el.ownerDocument.defaultView ?? win).getComputedStyle(el);
      } catch {
        cs = null;
      }
      styleCache.set(el, cs);
    }
    return styleCache.get(el) ?? null;
  }

  const BLOCK_DISPLAYS = new Set([
    'block',
    'flex',
    'grid',
    'list-item',
    'table',
    'flow-root',
    'table-row',
    'table-caption',
  ]);
  const PARAGRAPH_TAGS = new Set(['P', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'DL', 'TABLE', 'FIGURE']);

  /**
   * 이 요소 앞뒤에 둘 줄바꿈 수: 0(이어짐), 1(줄바꿈), 2(문단 사이 빈 줄).
   * 태그 이름이 아니라 실제 화면 표시 방식(CSS display)을 본다. 예: display:block 인 span 은 줄을 나눈다.
   */
  function breakBefore(el: Element): number {
    const display = styleOf(el)?.display;
    const blockish = display ? BLOCK_DISPLAYS.has(display) : BLOCK_TAGS.has(el.tagName);
    if (!blockish) return 0;
    return PARAGRAPH_TAGS.has(el.tagName) ? 2 : 1;
  }

  /** HTML 소스의 줄바꿈·들여쓰기는 화면에서 공백 하나로 보인다. pre 계열만 그대로 둔다. */
  function sourceText(node: Node): string {
    const v = node.nodeValue ?? '';
    const parent = node.parentElement;
    const ws = parent ? styleOf(parent)?.whiteSpace : '';
    if (ws && /^pre/.test(ws)) return v;
    return v.replace(/[ \t\n\r\f]+/g, ' ');
  }

  /** 파일 다운로드 링크인지. 링크 주소는 기록하지 않고, 📎 표시만 남긴다. */
  function isFileLink(el: Element): boolean {
    if (el.tagName !== 'A') return false;
    const href = el.getAttribute('href') ?? '';
    if (!href || href === '#') return false;
    if (el.hasAttribute('download')) return true;
    if (/\.(pdf|hwpx?|docx?|xlsx?|pptx?|zip|jpe?g|png|gif)([?#]|$)/i.test(href)) return true;
    if (/down|attach|file/i.test(href)) return true;
    let p: Element | null = el;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) {
      if (/file|attach/i.test(typeof p.className === 'string' ? p.className : '')) return true;
    }
    return false;
  }

  function inlineControlValue(el: Element): string {
    if (el.tagName === 'SELECT') {
      return Array.from((el as HTMLSelectElement).selectedOptions)
        .filter((o) => o.value !== '')
        .map((o) => oneLine(o.textContent))
        .join(', ');
    }
    if (isSensitive(el)) return '';
    if (el.tagName === 'INPUT') {
      const input = el as HTMLInputElement;
      const type = input.type.toLowerCase();
      if (type === 'checkbox' || type === 'radio') return input.checked ? '☑' : '☐';
      if (IGNORED_INPUT_TYPES.has(type)) return '';
      return input.value;
    }
    if (el.tagName === 'TEXTAREA') return (el as HTMLTextAreaElement).value;
    return editableText(el);
  }

  /** 특수 에디터(contenteditable) 안의 글자. 문단 사이 줄바꿈을 살린다. */
  function editableText(root: Element): string {
    let out = '';
    const rec = (node: Node) => {
      if (node.nodeType === 3) {
        const v = node.nodeValue ?? '';
        // HTML 소스의 들여쓰기(줄바꿈+공백뿐인 글자)는 사용자가 쓴 내용이 아니다.
        if (/\n/.test(v) && v.trim() === '') return;
        out += v;
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      if (el.tagName === 'BR') {
        out += '\n';
        return;
      }
      const block = BLOCK_TAGS.has(el.tagName) || /^H[1-6]$/.test(el.tagName);
      if (block && out && !out.endsWith('\n')) out += '\n';
      for (const c of Array.from(el.childNodes)) rec(c);
      if (block && !out.endsWith('\n')) out += '\n';
    };
    rec(root);
    // 사용자가 쓴 원문이므로 공백은 건드리지 않고, 앞뒤 빈 줄만 정리한다.
    return out.replace(/^\n+|\n+$/g, '');
  }

  // ---------- 항목명 찾기 ----------

  interface Found {
    text: string;
    source: LabelSource;
    headingId?: string;
  }

  function labelElementsFor(el: Element): Element[] {
    const found: Element[] = [];
    const labels = (el as HTMLInputElement).labels;
    if (labels) found.push(...Array.from(labels));
    if (!found.length) {
      const wrap = el.closest('label');
      if (wrap) found.push(wrap);
    }
    return found;
  }

  /** label 안에서 입력칸 자체를 뺀 글자 */
  function labelText(labelEl: Element): string {
    let out = '';
    const rec = (node: Node) => {
      if (node.nodeType === 3) {
        out += node.nodeValue ?? '';
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName) || isFormControl(el) || isHidden(el)) return;
      for (const c of Array.from(el.childNodes)) rec(c);
    };
    rec(labelEl);
    return oneLine(out);
  }

  function ariaName(el: Element): string {
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const parts = ids
        .split(/\s+/)
        .map((id) => doc.getElementById(id))
        .filter((t): t is HTMLElement => !!t)
        .map((t) => {
          consumed.add(t);
          return oneLine(t.textContent);
        })
        .filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    return oneLine(el.getAttribute('aria-label'));
  }

  function explicitLabel(el: Element): Found | null {
    const texts: string[] = [];
    for (const l of labelElementsFor(el)) {
      consumed.add(l);
      const t = labelText(l);
      if (t) texts.push(t);
    }
    if (texts.length) return { text: texts.join(' '), source: 'label' };
    const a = ariaName(el);
    return a ? { text: a, source: 'aria' } : null;
  }

  /**
   * 바로 앞 내용을 항목명으로 쓴다. ATS 에서 흔한 "<div>질문</div><textarea>" 형태.
   * - 바로 앞이 짧은 한 줄 문단이면 그 문단을 항목명으로 가져온다(문단은 본문에서 빠진다).
   * - 바로 앞이 제목이면 제목은 그대로 두고 항목명으로만 쓴다.
   */
  function adjacentLabel(): Found | null {
    flushInline();
    const last = blocks[blocks.length - 1];
    if (!last) return null;
    if (
      last.type === 'text' &&
      !boundaryIds.has(last.id) &&
      last.text.length <= ADJACENT_LABEL_MAX &&
      !last.text.includes('\n')
    ) {
      blocks.pop();
      return { text: last.text, source: 'adjacent' };
    }
    if (last.type === 'heading') return { text: last.text, source: 'heading', headingId: last.id };
    return null;
  }

  function fallbackLabel(el: Element): Found {
    const ph = oneLine(el.getAttribute('placeholder'));
    if (ph) return { text: ph, source: 'placeholder' };
    const nm = el.getAttribute('name') || el.id;
    if (nm) return { text: nm, source: 'name' };
    return { text: '(항목명 없음)', source: 'none' };
  }

  function resolveLabel(el: Element): Found {
    return explicitLabel(el) ?? adjacentLabel() ?? fallbackLabel(el);
  }

  function groupContainer(el: Element): Element | null {
    return el.closest('fieldset, [role="radiogroup"], [role="group"]');
  }

  function groupLabel(container: Element | null): Found | null {
    if (container) {
      if (container.tagName === 'FIELDSET') {
        const lg = Array.from(container.children).find((c) => c.tagName === 'LEGEND');
        if (lg) {
          consumed.add(lg);
          return { text: oneLine(lg.textContent), source: 'legend' };
        }
      }
      const a = ariaName(container);
      if (a) return { text: a, source: 'aria' };
    }
    return adjacentLabel();
  }

  function optionLabel(input: HTMLInputElement): string {
    const t = labelElementsFor(input)
      .map((l) => {
        consumed.add(l);
        return labelText(l);
      })
      .filter(Boolean)
      .join(' ');
    return t || ariaName(input) || input.value || '(선택지)';
  }

  // ---------- 블록 만들기 ----------

  function flushInline() {
    const t = clean(inlineBuf);
    inlineBuf = '';
    if (t) blocks.push({ id: nextId(), type: 'text', text: t });
  }

  function pushField(f: Omit<FieldBlock, 'id' | 'type' | 'label' | 'labelSource'>, label: Found) {
    flushInline();
    const block: FieldBlock = {
      id: nextId(),
      type: 'field',
      label: label.text,
      labelSource: label.source,
      ...f,
    };
    if (label.headingId) block.labelHeadingId = label.headingId;
    blocks.push(block);
  }

  function pushSkipped(el: Element) {
    const l = explicitLabel(el) ?? fallbackLabel(el);
    flushInline();
    blocks.push({ id: nextId(), type: 'skipped', label: l.text, reason: '민감 입력칸' });
  }

  function choiceSummary(options: ChoiceOption[]) {
    const picked = options.filter((o) => o.checked).map((o) => o.label);
    return { value: picked.join(', '), empty: picked.length === 0 };
  }

  function handleRadio(input: HTMLInputElement) {
    const name = input.name;
    const scope: ParentNode = input.form ?? doc;
    const group = name
      ? Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
          (r) => r.name === name,
        )
      : [input];
    if (name) {
      const key = `${input.form ? 'f' : 'd'}:${name}`;
      if (handledRadioGroups.has(key)) return;
      handledRadioGroups.add(key);
    }
    const options = group.map((r) => ({ label: optionLabel(r), checked: r.checked }));
    const label = groupLabel(groupContainer(input)) ?? fallbackLabel(input);
    pushField({ kind: 'radio', options, ...choiceSummary(options) }, label);
  }

  function handleCheckbox(input: HTMLInputElement) {
    const box = groupContainer(input);
    const boxes = box
      ? Array.from(box.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      : [];
    if (box && boxes.length > 1) {
      if (handledCheckGroups.has(box)) return;
      handledCheckGroups.add(box);
      const options = boxes
        .filter((b) => !isHidden(b) || b.checked)
        .map((b) => ({ label: optionLabel(b), checked: b.checked }));
      const label = groupLabel(box) ?? { text: '(항목명 없음)', source: 'none' as const };
      pushField({ kind: 'checkbox-group', options, ...choiceSummary(options) }, label);
      return;
    }
    const label = resolveLabel(input);
    pushField(
      {
        kind: 'checkbox',
        options: [{ label: label.text, checked: input.checked }],
        value: input.checked ? '선택함' : '선택 안 함',
        empty: false,
      },
      label,
    );
  }

  function handleControl(control: Element) {
    // instanceof 대신 tagName 으로 구분한다: iframe 안 요소는 다른 window 의 클래스라 instanceof 가 틀린다.
    if (control.tagName === 'INPUT') {
      const el = control as HTMLInputElement;
      const type = (el.type || 'text').toLowerCase();
      if (IGNORED_INPUT_TYPES.has(type)) return;
      if (isSensitive(el)) return pushSkipped(el);
      if (type === 'radio') return handleRadio(el);
      if (type === 'checkbox') return handleCheckbox(el);
      const label = resolveLabel(el);
      if (type === 'file') {
        const files = Array.from(el.files ?? []).map((f) => f.name);
        return pushField(
          { kind: 'file', value: files.join(', '), files, empty: files.length === 0 },
          label,
        );
      }
      return pushField(
        {
          kind: 'input',
          inputType: type,
          value: el.value,
          empty: el.value.trim() === '',
          ...(el.maxLength > 0 ? { maxLength: el.maxLength } : {}),
        },
        label,
      );
    }
    if (control.tagName === 'TEXTAREA') {
      const el = control as HTMLTextAreaElement;
      if (isSensitive(el)) return pushSkipped(el);
      const label = resolveLabel(el);
      return pushField(
        {
          kind: 'textarea',
          value: el.value,
          empty: el.value.trim() === '',
          ...(el.maxLength > 0 ? { maxLength: el.maxLength } : {}),
        },
        label,
      );
    }
    if (control.tagName === 'SELECT') {
      const el = control as HTMLSelectElement;
      const label = resolveLabel(el);
      // value="" 인 선택지("선택하세요" 등)는 고르지 않은 것으로 본다.
      const values = Array.from(el.selectedOptions)
        .filter((o) => o.value !== '')
        .map((o) => oneLine(o.textContent));
      return pushField(
        {
          kind: el.multiple ? 'select-multiple' : 'select',
          value: values.join(', '),
          empty: values.length === 0,
        },
        label,
      );
    }
    // contenteditable / role=textbox: 특수 자소서 에디터
    const label = resolveLabel(control);
    const text = editableText(control);
    pushField({ kind: 'editor', value: text, empty: text.trim() === '' }, label);
  }

  // ---------- 표 ----------

  interface GridCell {
    text: string;
    header: boolean;
    /** 여러 줄에 걸친 칸(rowspan)이 아래 줄로 이어진 자리 */
    rowCopy: boolean;
    /** 여러 칸에 걸친 칸(colspan)이 오른쪽으로 이어진 자리 */
    colCopy: boolean;
  }

  /** rowspan/colspan 을 펼쳐 모든 줄의 칸 수가 같은 격자로 만든다. */
  function buildGrid(table: HTMLTableElement): GridCell[][] {
    const trs = Array.from(table.rows).filter(
      (tr) => tr.closest('table') === table && !isHidden(tr),
    );
    const grid: GridCell[][] = trs.map(() => []);
    trs.forEach((tr, r) => {
      let c = 0;
      for (const cell of Array.from(tr.cells)) {
        if (isHidden(cell)) continue;
        const row = grid[r] as GridCell[];
        while (row[c]) c++;
        const text = textOf(cell);
        const header = cell.tagName === 'TH' || /header/.test(cell.getAttribute('role') ?? '');
        const rs =
          cell.rowSpan === 0 ? trs.length - r : Math.min(Math.max(cell.rowSpan, 1), trs.length - r);
        const cs = Math.min(Math.max(cell.colSpan, 1), 50);
        for (let i = 0; i < rs; i++) {
          for (let j = 0; j < cs; j++) {
            const target = grid[r + i] as GridCell[];
            target[c + j] = { text, header, rowCopy: i > 0, colCopy: j > 0 };
          }
        }
        c += cs;
      }
    });
    const width = Math.max(0, ...grid.map((row) => row.length));
    return grid
      .map((row) =>
        Array.from(
          { length: width },
          (_, i) => row[i] ?? { text: '', header: false, rowCopy: false, colCopy: true },
        ),
      )
      .filter((row) => row.length > 0);
  }

  const LONG_TEXT = 200;
  const isLong = (t: string) => t.length >= LONG_TEXT || t.includes('\n\n');

  /**
   * 표를 모양에 따라 세 가지로 기록한다.
   * - 문서형: 긴 글이 든 표(자기소개서 질문·답변 등) → 질문은 항목명, 답변은 줄바꿈을 살린 원문
   * - 항목형: 줄마다 "머리칸 → 값" 인 표(병역사항 등) → 항목 목록
   * - 일반 표: 나머지 → 합쳐진 칸을 펼친 표
   * 한 칸짜리 짧은 표(첨부서류 목록 등)는 목록으로 기록한다.
   */
  function handleTable(table: HTMLTableElement) {
    const grid = buildGrid(table);
    if (!grid.length) return;
    flushInline();
    const width = grid[0]?.length ?? 0;
    const origins = grid.flat().filter((c) => !c.rowCopy && !c.colCopy);

    if (width === 1 || origins.some((c) => !c.header && isLong(c.text))) {
      return handleDocumentTable(grid);
    }
    const topHeader = grid[0]?.every((c) => c.header) ?? false;
    if (!topHeader && grid.every((row) => row[0]?.header) && origins.some((c) => !c.header)) {
      return handlePairsTable(grid);
    }
    blocks.push({
      id: nextId(),
      type: 'table',
      caption: oneLine(table.caption?.textContent),
      rows: grid.map((row) => ({
        header: row.every((c) => c.header),
        // 여러 줄에 걸친 칸은 줄마다 같은 값을 다시 적고, 여러 칸에 걸친 칸은 오른쪽을 비운다.
        cells: row.map((c) => (c.colCopy ? '' : c.text)),
      })),
    });
  }

  function handleDocumentTable(grid: GridCell[][]) {
    let pending: Found | null = null;
    const listItems: string[] = [];
    const flushList = () => {
      if (listItems.length) {
        blocks.push({ id: nextId(), type: 'list', ordered: false, items: listItems.splice(0) });
      }
    };
    for (const row of grid) {
      const cells = row.filter((c) => !c.rowCopy && !c.colCopy);
      cells.forEach((cell, i) => {
        if (cell.header) {
          pending = { text: oneLine(cell.text), source: 'table' };
          return;
        }
        const next = cells[i + 1];
        const nextRowFirst = grid[grid.indexOf(row) + 1]?.[0];
        const followedByLong =
          (next && !next.header && isLong(next.text)) ||
          (!next && nextRowFirst && !nextRowFirst.header && isLong(nextRowFirst.text));
        if (!isLong(cell.text) && !pending && followedByLong) {
          // 머리칸 표시 없이 질문 칸 다음에 긴 답변 칸이 오는 경우
          pending = { text: oneLine(cell.text), source: 'adjacent' };
          return;
        }
        if (pending) {
          flushList();
          pushField({ kind: 'display', value: cell.text, empty: cell.text.trim() === '' }, pending);
          pending = null;
          return;
        }
        if (isLong(cell.text)) {
          flushList();
          blocks.push({ id: nextId(), type: 'text', text: cell.text });
        } else if (cell.text) {
          listItems.push(cell.text.replace(/\n+/g, ' / '));
        }
      });
    }
    // 답변 칸 없이 끝난 질문(머리칸)은 글로 남긴다.
    const left = pending as Found | null;
    if (left) listItems.push(left.text);
    flushList();
  }

  function handlePairsTable(grid: GridCell[][]) {
    const items: { label: string; value: string }[] = [];
    for (const row of grid) {
      let label: GridCell | null = null;
      for (const cell of row) {
        if (cell.colCopy) continue;
        if (cell.header) {
          label = cell;
          continue;
        }
        if (!label || cell.rowCopy) continue;
        const prev = items[items.length - 1];
        if (label.rowCopy && prev && prev.label === oneLine(label.text)) {
          // 머리칸이 여러 줄에 걸쳐 있으면 그 줄들의 값은 한 항목이다.
          prev.value = [prev.value, cell.text].filter(Boolean).join('\n');
        } else {
          items.push({ label: oneLine(label.text), value: cell.text });
        }
      }
    }
    if (items.length) blocks.push({ id: nextId(), type: 'pairs', items });
  }

  function handleList(list: Element) {
    const items = Array.from(list.children)
      .filter((li) => li.tagName === 'LI' && !isHidden(li))
      .map((li) => textOf(li))
      .filter(Boolean);
    if (!items.length) return;
    flushInline();
    blocks.push({ id: nextId(), type: 'list', ordered: list.tagName === 'OL', items });
  }

  /** 입력칸보다 앞에 나오는 label[for]/legend 는 아직 consumed 에 없으므로 미리 알아본다. */
  function isLabelForControl(el: Element): boolean {
    if (consumed.has(el)) return true;
    if (el.tagName === 'LABEL') {
      const control = (el as HTMLLabelElement).control;
      // 민감 입력칸의 label 도 본문에 남기지 않는다(미리보기에서 "제외됨"으로만 보인다).
      return !!control;
    }
    if (el.tagName === 'LEGEND') {
      const fs = el.parentElement;
      return (
        fs?.tagName === 'FIELDSET' &&
        !!fs.querySelector('input[type="radio"], input[type="checkbox"]')
      );
    }
    return false;
  }

  function walk(node: Node) {
    if (node.nodeType === 3) {
      inlineBuf += sourceText(node);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag) || el.hasAttribute('data-form-archiver-ignore') || isHidden(el)) return;

    if (tag === 'BR') {
      inlineBuf += '\n';
      return;
    }
    if (isFormControl(el)) return handleControl(el);

    if (/^H[1-6]$/.test(tag)) {
      flushInline();
      const text = oneLine(textOf(el));
      if (text) blocks.push({ id: nextId(), type: 'heading', level: Number(tag[1]), text });
      return;
    }
    if (tag === 'TABLE' && !containsControls(el)) return handleTable(el as HTMLTableElement);
    if ((tag === 'UL' || tag === 'OL') && !containsControls(el)) return handleList(el);

    if (tag === 'IFRAME') {
      flushInline();
      try {
        const body = (el as HTMLIFrameElement).contentDocument?.body;
        if (body) walk(body);
      } catch {
        // 다른 출처의 iframe 은 읽을 수 없다(1단계 범위 밖).
      }
      return;
    }

    // 항목명으로 쓰이는 label/legend: 글자는 건너뛰고, 안에 든 입력칸만 처리한다.
    const asLabel = isLabelForControl(el);
    const block = BLOCK_TAGS.has(tag) || breakBefore(el) > 0;
    if (block) flushInline();
    if (isFileLink(el)) inlineBuf += '📎 ';
    for (const child of childrenOf(el)) {
      if (asLabel) {
        if (child.nodeType !== 1) continue;
        const c = child as Element;
        if (!isFormControl(c) && !containsControls(c)) continue;
      }
      walk(child);
    }
    if (block) flushInline();
    if (tag === 'FIELDSET') {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'text') boundaryIds.add(last.id);
    }
  }

  // aria-labelledby 가 가리키는 요소는 입력칸보다 앞에 나오는 경우가 많다.
  // 미리 표시해 두어 본문과 항목명에 같은 글자가 두 번 나오지 않게 한다.
  for (const c of Array.from(doc.querySelectorAll('[aria-labelledby]'))) {
    if (!isFormControl(c) && !c.matches('fieldset, [role="radiogroup"], [role="group"]')) continue;
    for (const id of (c.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      const t = id && doc.getElementById(id);
      if (t) consumed.add(t);
    }
  }

  walk(doc.body);
  flushInline();

  const fields = blocks.filter((b): b is FieldBlock => b.type === 'field');
  const GUESSED: LabelSource[] = ['adjacent', 'placeholder', 'name', 'none'];
  return {
    title: oneLine(doc.title) || '(제목 없음)',
    url: doc.location?.href ?? '',
    host: doc.location?.hostname ?? '',
    stats: {
      fields: fields.length,
      emptyFields: fields.filter((f) => f.empty).length,
      skipped: blocks.filter((b) => b.type === 'skipped').length,
      guessedLabels: fields.filter((f) => GUESSED.includes(f.labelSource)).length,
    },
    blocks,
  };
}
