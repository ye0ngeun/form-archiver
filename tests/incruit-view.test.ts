import { describe, expect, it } from 'vitest';
import { extractPage } from '../lib/extract-page';
import { toMarkdown } from '../lib/markdown';
import type { Block, FieldBlock, ListBlock, PairsBlock, TableBlock } from '../lib/types';
import { openFixture } from './helpers';

// 2026-11-24 인크루트 "제출 후 지원서 보기" 화면에서 발견한 문제를 재현한다 (docs/harness.md 누락 사례 참고).
const { doc, win } = openFixture(
  'incruit-view.html',
  'https://example.incruit.com/apply/viewresume.asp',
);
const record = extractPage(doc, win);

/** 제목 바로 다음에 나오는 블록 */
function blockAfter(title: string): Block {
  const i = record.blocks.findIndex((b) => b.type === 'heading' && b.text === title);
  if (i < 0) throw new Error(`제목 "${title}" 없음`);
  const next = record.blocks[i + 1];
  if (!next) throw new Error(`"${title}" 다음 블록 없음`);
  return next;
}

describe('incruit-view.html: 표로 된 제출 후 보기 화면', () => {
  it('항목형 표(머리칸 → 값)는 항목 목록으로, 합쳐진 머리칸의 값은 한 항목으로 묶는다', () => {
    const b = blockAfter('기본지원사항') as PairsBlock;
    expect(b.type).toBe('pairs');
    expect(b.items).toEqual([
      { label: '지원분야', value: '[부문] 2026년 가나다카드 신입 채용\n[분야] ICT 개발' },
    ]);
  });

  it('한 줄에 항목·값이 번갈아 나오는 표도 항목 목록으로 만든다', () => {
    const b = blockAfter('병역사항') as PairsBlock;
    expect(b.type).toBe('pairs');
    expect(b.items).toEqual([
      { label: '군필여부', value: '비대상' },
      { label: '군별', value: '' },
      { label: '계급', value: '' },
      { label: '기간', value: '' },
    ]);
  });

  it('CSS 로 줄을 나눈 글(display:block 인 span)은 줄을 나눠 읽는다', () => {
    const b = blockAfter('학력사항') as TableBlock;
    expect(b.type).toBe('table');
    expect(b.rows[2]?.cells).toEqual([
      '대학교',
      '바사대\n공학',
      '2019년 03월 입학 ~\n2025년 02월 졸업',
      '총점:4.5\n평점:3.80\n전공평점:3.90',
    ]);
  });

  it('여러 줄에 걸쳐 합쳐진 칸을 펼쳐 열이 밀리지 않게 한다', () => {
    const b = blockAfter('외국어사항') as TableBlock;
    expect(b.rows.map((r) => r.cells)).toEqual([
      ['언어', '시험명', '점수'],
      ['영어', 'TOEIC-Speaking', 'IH (150점)'],
      ['영어', 'OPIc', ''],
      ['영어', 'OPI', ''],
      ['일어', 'OPIc', ''],
      ['일어', 'OPI', ''],
    ]);
  });

  it('문서형 표(질문 줄 → 답변 줄)는 질문을 항목명, 답변을 문단을 살린 원문으로 읽는다', () => {
    const answers = record.blocks.filter((b): b is FieldBlock => b.type === 'field');
    expect(answers.map((a) => a.label)).toEqual([
      '*가나다카드를 선택한 이유를 서술해 주세요.',
      '*직무 역량을 쌓아온 경험을 서술해 주세요. : 수행내역, 역할, 사용한 기술 등',
    ]);
    expect(answers[0]?.value).toBe(
      '[연결을 상생으로]\n\n' +
        '지속 가능한 사업은 모두에게 이익이 돌아갈 때 성장한다고 믿습니다. 기술 자체에 매몰되지 않고, 누가 무엇을 얻는지까지 설계하고 싶습니다.\n\n' +
        '- 첫째, 사용자 가까이에서 일하겠습니다.\n- 둘째, 데이터로 확인하겠습니다.',
    );
    expect(answers[1]?.value).toBe(
      '[검증으로 신뢰를 만들다]\n\n정상 상황의 구현에 만족하지 않고 예외까지 검증해 왔습니다.\n\n첫째, 동시성 문제를 비관적 락으로 해결했습니다.',
    );
  });

  it('한 칸짜리 짧은 표는 목록으로, 파일 링크가 걸린 항목에는 📎 를 붙인다', () => {
    const b = blockAfter('첨부서류') as ListBlock;
    expect(b.type).toBe('list');
    expect(b.items).toEqual([
      '📎 [필수] 최종학교 졸업증명서',
      '[해당자] 보훈대상자 증명서 사본',
      '📎 [해당자] 경력증명서',
    ]);
  });

  it('링크 주소는 기록에 남기지 않는다', () => {
    const json = JSON.stringify(record);
    expect(json).not.toContain('fileDown');
    expect(json).not.toContain('download.asp');
  });

  it('마크다운 결과가 예상 파일과 같다', async () => {
    const md = toMarkdown(record, {
      savedAt: new Date(2026, 10, 24, 21, 30),
    });
    await expect(md).toMatchFileSnapshot('./fixtures/incruit-view.expected.md');
  });
});
