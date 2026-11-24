import { describe, expect, it } from 'vitest';
import { countChars, describeCount, formatNumber, limitFromLabel } from '../lib/count';
import type { FieldBlock } from '../lib/types';

describe('countChars', () => {
  it('공백 포함은 띄어쓰기·줄바꿈까지, 공백 제외는 그것을 뺀 글자를 센다', () => {
    expect(countChars('안녕 하세요\n반갑습니다')).toEqual({ withSpaces: 12, withoutSpaces: 10 });
  });
  it('이모지를 한 글자로 센다', () => {
    expect(countChars('합격🎉').withSpaces).toBe(3);
  });
});

describe('limitFromLabel: 질문 글 속 글자 수 제한', () => {
  it.each([
    ['1. 지원 동기를 작성해 주세요. (1000자 이내)', 1000],
    ['지원 동기 (1,000자 이하)', 1000],
    ['최대 500자까지 작성하세요', 500],
    ['700자 내외로 서술', 700],
    ['(공백 포함 1500자 제한)', 1500],
  ])('%s → %i', (label, n) => {
    expect(limitFromLabel(label)).toBe(n);
  });

  it.each([
    '*신한카드를 선택한 이유와 그 안에서 10년이 흐른 뒤, 본인과 회사의 모습을 서술해 주세요.',
    '본인의 강점 3가지를 서술해 주세요.',
    '문제 해결 경험',
  ])('제한이 아닌 숫자는 읽지 않는다: %s', (label) => {
    expect(limitFromLabel(label)).toBeNull();
  });
});

describe('describeCount', () => {
  const f = (over: Partial<FieldBlock>): FieldBlock => ({
    id: 'b1',
    type: 'field',
    kind: 'display',
    label: '지원 동기',
    labelSource: 'table',
    value: '가 나',
    empty: false,
    ...over,
  });
  it('제한이 없으면 두 가지 글자 수만 적는다', () => {
    expect(describeCount(f({}))).toBe('공백 포함 3자 · 공백 제외 2자');
  });
  it('입력칸 maxlength 를 질문 글의 제한보다 먼저 쓴다', () => {
    expect(describeCount(f({ label: '지원 동기 (500자 이내)', maxLength: 1200 }))).toBe(
      '공백 포함 3자 · 공백 제외 2자 · 제한 1,200자',
    );
    expect(describeCount(f({ label: '지원 동기 (500자 이내)' }))).toBe(
      '공백 포함 3자 · 공백 제외 2자 · 제한 500자',
    );
  });
  it('천 단위 쉼표', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
