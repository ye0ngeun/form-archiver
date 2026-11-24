import { answerLimit, formatNumber, isAnswerField } from './count';
import type { Block, LabelSource } from './types';

/** 미리보기 목록의 한 줄에 보여줄 내용. 화면(DOM)과 분리해 두어 검사하기 쉽게 한다. */
export interface BlockSummary {
  /** 왼쪽의 작은 분류 표시 */
  kind: string;
  title: string;
  body: string;
  badges: { text: string; tone: 'warn' | 'info' | 'muted' }[];
  /** 사용자가 체크를 해제해 뺄 수 있는지 (민감 입력칸은 이미 빠져 있다) */
  excludable: boolean;
}

const GUESSED: LabelSource[] = ['adjacent', 'placeholder', 'name', 'none'];
const BODY_MAX = 140;

/** 글자 수: 이모지·한글 조합을 한 글자로 센다(코드 포인트 기준). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

function shorten(text: string, max = BODY_MAX): string {
  const one = text.replace(/\s*\n\s*/g, ' ⏎ ');
  return charCount(one) > max ? `${Array.from(one).slice(0, max).join('')}…` : one;
}

export function describeBlock(b: Block): BlockSummary {
  switch (b.type) {
    case 'heading':
      return { kind: `제목${b.level}`, title: b.text, body: '', badges: [], excludable: true };
    case 'text':
      return { kind: '글', title: '', body: shorten(b.text), badges: [], excludable: true };
    case 'list':
      return {
        kind: '목록',
        title: '',
        body: shorten(b.items.join(' · ')),
        badges: [{ text: `${b.items.length}개`, tone: 'muted' }],
        excludable: true,
      };
    case 'table':
      return {
        kind: '표',
        title: b.caption,
        body: shorten(b.rows.map((r) => r.cells.join(' | ')).join(' / ')),
        badges: [{ text: `${b.rows.length}행`, tone: 'muted' }],
        excludable: true,
      };
    case 'pairs':
      return {
        kind: '항목표',
        title: '',
        body: shorten(b.items.map((it) => `${it.label}: ${it.value || '–'}`).join(' · ')),
        badges: [{ text: `${b.items.length}개`, tone: 'muted' }],
        excludable: true,
      };
    case 'skipped':
      return {
        kind: '제외',
        title: b.label,
        body: '민감 입력칸이라 값을 읽지 않았습니다.',
        badges: [],
        excludable: false,
      };
    case 'field': {
      const badges: BlockSummary['badges'] = [];
      if (b.empty) badges.push({ text: '빈칸', tone: 'warn' });
      if (GUESSED.includes(b.labelSource)) badges.push({ text: '항목명 짐작', tone: 'warn' });
      if (b.kind === 'file') badges.push({ text: '파일 이름만', tone: 'muted' });
      if (!b.empty && (isAnswerField(b) || b.maxLength)) {
        // 공백 포함 글자 수. 제한(입력칸 maxlength 또는 질문 글의 "1000자 이내")이 있으면 함께 보여준다.
        const n = charCount(b.value);
        const limit = answerLimit(b);
        badges.push({
          text: limit ? `${formatNumber(n)} / ${formatNumber(limit)}자` : `${formatNumber(n)}자`,
          tone: limit && n > limit ? 'warn' : 'info',
        });
      }
      let body: string;
      if (b.options && (b.kind === 'radio' || b.kind === 'checkbox-group')) {
        body = b.empty ? '(고른 것 없음)' : b.value;
      } else {
        body = b.empty ? '(비어 있음)' : shorten(b.value);
      }
      return {
        kind: b.kind === 'display' ? '답변' : '입력',
        title: b.label,
        body,
        badges,
        excludable: true,
      };
    }
  }
}
