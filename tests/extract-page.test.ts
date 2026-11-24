import { describe, expect, it } from 'vitest';
import { extractPage } from '../lib/extract-page';
import { toMarkdown } from '../lib/markdown';
import type { FieldBlock } from '../lib/types';
import { openFixture } from './helpers';

function fields(record: ReturnType<typeof extractPage>) {
  return record.blocks.filter((b): b is FieldBlock => b.type === 'field');
}
function field(record: ReturnType<typeof extractPage>, label: string) {
  const f = fields(record).find((x) => x.label === label);
  if (!f)
    throw new Error(
      `항목 "${label}" 을 찾지 못함. 있는 항목: ${fields(record)
        .map((x) => x.label)
        .join(' / ')}`,
    );
  return f;
}

describe('apply-basic.html: 일반적인 입력칸', () => {
  const { doc, win } = openFixture('apply-basic.html');
  // 사용자가 화면에서 입력한 값(HTML 속성이 아니라 현재 값)도 읽는지 확인한다.
  (doc.querySelector('textarea[name="essay2"]') as HTMLTextAreaElement).value =
    '배포 중 장애가 났을 때 로그를 먼저 확인했습니다.';
  const record = extractPage(doc, win);

  it('페이지 정보를 읽는다', () => {
    expect(record.title).toBe('가나다전자 2026 하반기 신입 개발자 지원');
    expect(record.url).toBe('https://apply.example.com/jobs/123/form');
  });

  it('label 로 연결된 입력칸의 항목명과 값을 짝짓는다', () => {
    expect(field(record, '이름').value).toBe('홍길동');
    expect(field(record, '이메일').value).toBe('gildong@example.com');
    expect(field(record, '회사명').value).toBe('라마바소프트');
  });

  it('항목명이 없으면 placeholder 를 쓰고 짐작으로 표시한다', () => {
    const f = field(record, '휴대폰 번호');
    expect(f.labelSource).toBe('placeholder');
    expect(f.value).toBe('010-0000-0000');
  });

  it('비밀번호·인증번호·hidden 값은 읽지 않는다', () => {
    const json = JSON.stringify(record);
    expect(json).not.toContain('secret-pw-1234');
    expect(json).not.toContain('928374');
    expect(json).not.toContain('HIDDEN-TOKEN');
    expect(record.stats.skipped).toBe(2);
  });

  it('드롭다운: 고른 값을 쓰고, "선택하세요"는 빈칸으로 본다', () => {
    expect(field(record, '최종 학력').value).toBe('대학교 졸업(4년)');
    expect(field(record, '희망 근무지').empty).toBe(true);
  });

  it('라디오·체크박스 묶음은 legend 를 항목명으로, 고른 것을 값으로 쓴다', () => {
    expect(field(record, '병역 사항').value).toBe('군필');
    expect(field(record, '사용 가능한 언어').value).toBe('TypeScript, Java');
    expect(field(record, '개인정보 수집·이용에 동의합니다.').value).toBe('선택함');
  });

  it('반복 항목(경력 1·2)을 화면 순서대로 남기고 빈칸을 표시한다', () => {
    const companies = fields(record).filter((f) => f.label === '회사명');
    expect(companies.map((f) => f.value)).toEqual(['라마바소프트', '']);
    expect(companies[1]?.empty).toBe(true);
  });

  it('자소서: 바로 앞 질문 문단을 항목명으로 쓰고 답변 원문을 그대로 남긴다', () => {
    const f = field(record, '1. 지원 동기를 작성해 주세요. (1000자 이내)');
    expect(f.labelSource).toBe('adjacent');
    expect(f.maxLength).toBe(1000);
    expect(f.value).toBe(
      '제가 이 직무에 지원한 이유는 두 가지입니다.\n\n# 첫째, 사용자 가까이에서 일하고 싶습니다.\n1. 고객 문의를 직접 분석해 본 경험이 있습니다.',
    );
  });

  it('제목 바로 아래 입력칸은 제목을 항목명으로 쓰고, 화면에서 입력한 값을 읽는다', () => {
    const f = field(record, '문제 해결 경험');
    expect(f.labelSource).toBe('heading');
    expect(f.value).toBe('배포 중 장애가 났을 때 로그를 먼저 확인했습니다.');
  });

  it('특수 에디터(contenteditable)의 문단을 줄바꿈으로 남긴다', () => {
    const f = field(record, '3. 입사 후 포부');
    expect(f.kind).toBe('editor');
    expect(f.value).toBe(
      '첫 1년은 서비스 구조를 익히겠습니다.\n이후에는 운영 자동화에 기여하고 싶습니다.',
    );
  });

  it('숨겨진 영역은 읽지 않는다', () => {
    expect(JSON.stringify(record)).not.toContain('보이지 않아야 함');
  });

  it('항목명으로 쓴 label 글자를 본문에 중복으로 남기지 않는다', () => {
    const texts = record.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text);
    expect(texts).not.toContain('이름');
    expect(texts).not.toContain('병역 사항');
    expect(texts).not.toContain('지원서 비밀번호');
    expect(texts).not.toContain('3. 입사 후 포부');
  });

  it('마크다운 결과가 예상 파일과 같다', async () => {
    const md = toMarkdown(record, {
      savedAt: new Date(2026, 10, 24, 21, 30),
    });
    await expect(md).toMatchFileSnapshot('./fixtures/apply-basic.expected.md');
  });
});

describe('extractPage 는 페이지 안에 그대로 옮겨 실행할 수 있다', () => {
  it('바깥 변수·함수에 기대지 않는다(executeScript 의 func 조건)', async () => {
    const { JSDOM } = await import('jsdom');
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('./fixtures/apply-basic.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://apply.example.com/', runScripts: 'outside-only' });
    // 함수 소스 글자만 페이지에 넣어 실행한다. 바깥 것을 참조하면 여기서 ReferenceError 가 난다.
    const result = dom.window.eval(`(${extractPage.toString()})()`) as ReturnType<
      typeof extractPage
    >;
    expect(result.stats.fields).toBeGreaterThan(10);
  });
});
