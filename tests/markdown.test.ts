import { describe, expect, it } from 'vitest';
import { escapeLineStarts, makeFilename } from '../lib/markdown';
import type { PageRecord } from '../lib/types';

describe('escapeLineStarts: 원문이 마크다운 서식으로 바뀌지 않게', () => {
  it('줄 첫머리의 제목·목록·인용 기호 앞에 \\ 를 붙인다', () => {
    expect(escapeLineStarts('# 제목\n- 항목\n> 인용\n1. 번호')).toBe(
      '\\# 제목\n\\- 항목\n\\> 인용\n1\\. 번호',
    );
  });
  it('문장 중간의 기호와 일반 문장은 그대로 둔다', () => {
    const s = '성과는 #1 이었고 - 라고 생각합니다.\n2026년에 입사';
    expect(escapeLineStarts(s)).toBe(s);
  });
});

describe('makeFilename', () => {
  it('날짜_시점_제목.md 형태로, 파일 이름에 쓸 수 없는 글자를 뺀다', () => {
    const record = { title: 'A/B 회사: 지원서?' } as PageRecord;
    expect(
      makeFilename(record, { savedAt: new Date(2026, 10, 24, 21, 30), timing: 'after-submit' }),
    ).toBe('2026-11-24_2130_제출후_A B 회사 지원서.md');
  });
});
