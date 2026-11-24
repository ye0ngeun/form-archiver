import { describeCount, isAnswerField } from './count';
import type { Block, FieldBlock, PageRecord, TableBlock } from './types';

export interface MarkdownOptions {
  savedAt: Date;
  /** 미리보기에서 사용자가 뺀 블록 id */
  excluded?: ReadonlySet<string>;
}

/** 2026-11-24 21:30 (사용자 컴퓨터의 시간대 기준) */
export function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 원문을 마크다운 서식으로 오해받지 않게 줄 첫머리의 기호만 가린다.
 * 예: 답변의 "# 성과" 가 제목으로, "- 항목" 이 목록으로 보이지 않게 앞에 \ 를 붙인다.
 * 글자 자체는 바꾸지 않으므로 마크다운으로 보면 원문과 똑같이 보인다.
 */
export function escapeLineStarts(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)([#>*+\-|=]|`{3}|~{3})/, '$1\\$2')
        .replace(/^(\s*\d+)([.)])(\s)/, '$1\\$2$3'),
    )
    .join('\n');
}

function escapeTableCell(text: string): string {
  // 칸 안의 줄바꿈은 <br> 로 살린다. 그래서 원문의 < > 는 글자로 보이게 바꾼다.
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function heading(level: number, text: string): string {
  return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`;
}

function renderTable(t: TableBlock): string {
  const width = Math.max(...t.rows.map((r) => r.cells.length));
  const pad = (cells: string[]) =>
    `| ${[...cells, ...Array(width - cells.length).fill('')].map(escapeTableCell).join(' | ')} |`;
  const [first, ...rest] = t.rows;
  if (!first) return '';
  const lines = [pad(first.cells), `|${' --- |'.repeat(width)}`, ...rest.map((r) => pad(r.cells))];
  return (t.caption ? `**${t.caption}**\n\n` : '') + lines.join('\n');
}

function renderFieldValue(f: FieldBlock): string {
  switch (f.kind) {
    case 'radio':
    case 'checkbox-group':
      return (f.options ?? []).map((o) => `- [${o.checked ? 'x' : ' '}] ${o.label}`).join('\n');
    case 'checkbox':
      return `- [${f.options?.[0]?.checked ? 'x' : ' '}] ${f.value}`;
    case 'file':
      return f.empty
        ? '_(첨부 없음)_'
        : `${(f.files ?? []).map((n) => `- 📎 ${n}`).join('\n')}\n\n_(파일 내용은 저장하지 않음)_`;
    default:
      return f.empty ? '_(비어 있음)_' : escapeLineStarts(f.value);
  }
}

export function toMarkdown(record: PageRecord, opts: MarkdownOptions): string {
  const excluded = opts.excluded ?? new Set<string>();
  const out: string[] = [
    heading(1, `작성 기록: ${record.title}`),
    [
      `- 페이지: ${record.title}`,
      `- URL: ${record.url}`,
      `- 저장 시각: ${formatDateTime(opts.savedAt)}`,
      `- 읽은 화면: ${describeScreen(record)}`,
    ].join('\n'),
  ];

  // 페이지의 h1 은 마크다운 ## 부터 시작한다(# 는 문서 제목).
  // 입력칸 항목명은 지금 있는 제목보다 한 단계 아래 제목으로 쓴다.
  let sectionLevel = 1;
  const shownHeadings = new Set<string>();

  for (const b of record.blocks as Block[]) {
    if (excluded.has(b.id)) continue;
    switch (b.type) {
      case 'heading':
        sectionLevel = Math.min(6, b.level + 1);
        shownHeadings.add(b.id);
        out.push(heading(sectionLevel, b.text));
        break;
      case 'text':
        out.push(escapeLineStarts(b.text));
        break;
      case 'list':
        out.push(
          b.items
            .map((it, i) => `${b.ordered ? `${i + 1}.` : '-'} ${it.replace(/\n/g, ' ')}`)
            .join('\n'),
        );
        break;
      case 'table':
        out.push(renderTable(b));
        break;
      case 'pairs':
        out.push(
          b.items
            .map(
              (it) =>
                `- ${it.label}: ${it.value ? it.value.replace(/\n+/g, ' / ') : '_(비어 있음)_'}`,
            )
            .join('\n'),
        );
        break;
      case 'field': {
        // 동의 체크박스처럼 label 이 곧 내용인 단일 체크박스는 한 줄로 쓴다.
        if (b.kind === 'checkbox' && b.labelSource === 'label') {
          out.push(`- [${b.options?.[0]?.checked ? 'x' : ' '}] ${b.label}`);
          break;
        }
        // 항목명이 바로 앞 제목에서 왔고 그 제목이 이미 나왔으면, 제목을 한 번 더 쓰지 않는다.
        const underHeading = b.labelHeadingId && shownHeadings.has(b.labelHeadingId);
        if (!underHeading) out.push(heading(sectionLevel + 1, b.label));
        // 자기소개서처럼 긴 답변은 글자 수를 원문 위에 따로 적는다(원문은 건드리지 않는다).
        if (isAnswerField(b) && !b.empty) out.push(`_글자 수: ${describeCount(b)}_`);
        out.push(renderFieldValue(b));
        break;
      }
      case 'skipped':
        // 민감 입력칸은 기록에 남기지 않는다.
        break;
    }
  }
  return `${out.join('\n\n')}\n`;
}

/**
 * 어떤 화면에서 읽었는지. 사용자가 고르지 않고 읽은 내용으로 정한다.
 * 입력할 수 있는 칸이 있으면 작성 화면, 없으면 보기 화면(제출 후 화면 등)이다.
 */
export function describeScreen(record: PageRecord): string {
  // 답변을 보여주기만 하는 칸(display)은 입력칸이 아니다. 민감 입력칸은 세지 않지만, 있으면 작성 화면이다.
  const editable = record.blocks.filter((b) => b.type === 'field' && b.kind !== 'display').length;
  const sensitive = record.blocks.some((b) => b.type === 'skipped');
  if (editable > 0) return `작성 화면 (입력칸 ${editable}개)`;
  return sensitive ? '작성 화면' : '보기 화면 (입력칸 없음)';
}

/** 2026-11-24_2130_○○기업 신입 개발자 지원.md */
export function makeFilename(record: PageRecord, opts: Pick<MarkdownOptions, 'savedAt'>) {
  const d = formatDateTime(opts.savedAt).replace(' ', '_').replace(':', '');
  const title = record.title
    .replace(/[\\/:*?"<>|#]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${d}_${title || 'page'}.md`;
}
