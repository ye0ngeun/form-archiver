import type { FieldBlock } from './types';

/**
 * 자기소개서 답변의 글자 수.
 * 사이트마다 세는 방식이 달라 몇 글자 차이가 날 수 있다(줄바꿈을 2자로 세는 곳, 바이트로 세는 곳 등).
 * 여기서는 가장 흔한 두 가지를 센다.
 * - 공백 포함: 모든 글자. 띄어쓰기와 줄바꿈도 1자씩.
 * - 공백 제외: 띄어쓰기·줄바꿈·탭을 뺀 글자.
 * 이모지·한글은 한 글자로 센다(코드 포인트 기준).
 */
export interface CharCount {
  withSpaces: number;
  withoutSpaces: number;
}

export function countChars(text: string): CharCount {
  return {
    withSpaces: Array.from(text).length,
    withoutSpaces: Array.from(text.replace(/\s/g, '')).length,
  };
}

/** 1234 → "1,234" */
export function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 질문 글에 적힌 글자 수 제한을 읽는다.
 * 예: "(1000자 이내)", "1,000자 이하", "최대 500자", "700자 내외"
 * "10년", "3가지" 처럼 제한이 아닌 숫자는 읽지 않도록 "자" 와 제한을 뜻하는 말이 함께 있어야 한다.
 */
export function limitFromLabel(label: string): number | null {
  const m =
    /(\d{1,3}(?:,\d{3})+|\d{2,})\s*자\s*(?:이내|이하|내외|까지|제한)/.exec(label) ??
    /최대\s*(\d{1,3}(?:,\d{3})+|\d{2,})\s*자/.exec(label);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 긴 답변 칸인지: 글자 수를 적어 둘 대상 */
export function isAnswerField(f: FieldBlock): boolean {
  return f.kind === 'textarea' || f.kind === 'editor' || f.kind === 'display';
}

/** 입력칸의 maxlength 가 있으면 그것을, 없으면 질문 글에 적힌 제한을 쓴다. */
export function answerLimit(f: FieldBlock): number | null {
  return f.maxLength ?? limitFromLabel(f.label);
}

/** "공백 포함 812자 · 공백 제외 623자 · 제한 1,000자" */
export function describeCount(f: FieldBlock): string {
  const c = countChars(f.value);
  const parts = [
    `공백 포함 ${formatNumber(c.withSpaces)}자`,
    `공백 제외 ${formatNumber(c.withoutSpaces)}자`,
  ];
  const limit = answerLimit(f);
  if (limit) parts.push(`제한 ${formatNumber(limit)}자`);
  return parts.join(' · ');
}
