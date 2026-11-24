import { describe, expect, it } from 'vitest';
import { charCount, describeBlock } from '../lib/preview';
import type { FieldBlock } from '../lib/types';

function field(over: Partial<FieldBlock>): FieldBlock {
  return {
    id: 'b1',
    type: 'field',
    kind: 'textarea',
    label: '지원 동기',
    labelSource: 'label',
    value: '',
    empty: true,
    ...over,
  };
}

describe('describeBlock: 미리보기 한 줄', () => {
  it('빈칸에는 "빈칸" 표시를 붙인다', () => {
    const s = describeBlock(field({}));
    expect(s.body).toBe('(비어 있음)');
    expect(s.badges.map((b) => b.text)).toContain('빈칸');
  });

  it('짐작한 항목명에는 확인을 권하는 표시를 붙인다', () => {
    const s = describeBlock(field({ labelSource: 'adjacent', value: '답', empty: false }));
    expect(s.badges.map((b) => b.text)).toContain('항목명 짐작');
  });

  it('글자 수 제한이 있으면 "현재 / 최대" 를 보여주고, 넘으면 경고한다', () => {
    const ok = describeBlock(field({ value: '가나다', empty: false, maxLength: 5 }));
    expect(ok.badges).toContainEqual({ text: '3 / 5자', tone: 'info' });
    const over = describeBlock(field({ value: '가나다라마바', empty: false, maxLength: 5 }));
    expect(over.badges).toContainEqual({ text: '6 / 5자', tone: 'warn' });
  });

  it('민감 입력칸은 뺄 수 없는 "제외" 줄로 보인다', () => {
    const s = describeBlock({
      id: 'b2',
      type: 'skipped',
      label: '비밀번호',
      reason: '민감 입력칸',
    });
    expect(s.excludable).toBe(false);
    expect(s.kind).toBe('제외');
  });

  it('긴 답변은 줄여 보여주고 줄바꿈은 ⏎ 로 표시한다', () => {
    const s = describeBlock(field({ value: `첫 줄\n${'가'.repeat(300)}`, empty: false }));
    expect(s.body.startsWith('첫 줄 ⏎ ')).toBe(true);
    expect(s.body.endsWith('…')).toBe(true);
  });
});

describe('charCount', () => {
  it('이모지를 한 글자로 센다', () => {
    expect(charCount('합격🎉')).toBe(3);
  });
});
