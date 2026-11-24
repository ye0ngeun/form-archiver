// 추출 결과의 모양. 추출기(페이지 안)와 팝업·마크다운 변환(확장 쪽)이 이 약속을 공유한다.
// 페이지에서 팝업으로 넘어올 때 JSON 으로 옮겨지므로 함수·Set·Date 같은 값은 넣지 않는다.

/** 항목명을 어디서 찾았는지. 미리보기에서 "짐작한 항목명"을 표시할 때 쓴다. */
export type LabelSource =
  | 'label' // <label> 요소
  | 'aria' // aria-label / aria-labelledby
  | 'legend' // <fieldset> 의 <legend>
  | 'heading' // 바로 앞 제목
  | 'adjacent' // 바로 앞 짧은 문단 (짐작)
  | 'placeholder' // 입력칸 안의 안내 문구 (짐작)
  | 'name' // HTML name/id 속성 (짐작)
  | 'table' // 표의 머리칸(th)
  | 'none';

export type FieldKind =
  | 'input'
  | 'textarea'
  | 'editor' // contenteditable 등 특수 에디터
  | 'select'
  | 'select-multiple'
  | 'radio'
  | 'checkbox'
  | 'checkbox-group'
  | 'file'
  | 'display'; // 입력칸이 아니라 화면에 보이는 답변(제출 후 보기 화면의 표 등)

export interface ChoiceOption {
  label: string;
  checked: boolean;
}

export interface HeadingBlock {
  id: string;
  type: 'heading';
  level: number; // 페이지의 h1~h6
  text: string;
}

export interface TextBlock {
  id: string;
  type: 'text';
  text: string;
}

export interface ListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface TableBlock {
  id: string;
  type: 'table';
  caption: string;
  rows: { header: boolean; cells: string[] }[];
}

export interface FieldBlock {
  id: string;
  type: 'field';
  kind: FieldKind;
  label: string;
  labelSource: LabelSource;
  /** 항목명이 바로 앞 제목에서 왔을 때 그 제목 블록의 id */
  labelHeadingId?: string;
  /** 사람이 읽는 현재 값. 여러 개를 고른 경우 ", " 로 이어 붙인다. */
  value: string;
  empty: boolean;
  options?: ChoiceOption[];
  files?: string[];
  maxLength?: number;
  inputType?: string;
}

/** 항목형 표: "항목(머리칸) → 값" 이 이어지는 표. 예: 병역사항, 기본지원사항 */
export interface PairsBlock {
  id: string;
  type: 'pairs';
  items: { label: string; value: string }[];
}

/** 민감 입력칸: 값은 읽지 않았고, 제외했다는 사실만 미리보기에 보여준다. */
export interface SkippedBlock {
  id: string;
  type: 'skipped';
  label: string;
  reason: string;
}

export type Block =
  | HeadingBlock
  | TextBlock
  | ListBlock
  | TableBlock
  | PairsBlock
  | FieldBlock
  | SkippedBlock;

export interface PageRecord {
  title: string;
  url: string;
  host: string;
  stats: {
    fields: number;
    emptyFields: number;
    skipped: number;
    /** 항목명을 짐작으로 붙였거나 못 찾은 입력칸 수 */
    guessedLabels: number;
  };
  blocks: Block[];
}

/** 저장 시 사용자가 고르는 기록 시점 */
export type RecordTiming = 'before-submit' | 'after-submit' | 'other';
