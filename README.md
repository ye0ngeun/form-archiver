# Form Archiver

어느 채용 사이트에서 지원하든, 지금 보고 있거나 작성 중인 페이지를 내 마크다운 기록으로 남기는 크롬 확장 프로그램.

- 기획: [docs/기획.md](docs/기획.md)
- 완료 조건과 검증 기록: [docs/harness.md](docs/harness.md)
- 구조 설명: [docs/구조.md](docs/구조.md)
- AI 작업 규칙: [AGENTS.md](AGENTS.md) (Claude 는 [CLAUDE.md](CLAUDE.md) 를 거쳐 읽는다), 권한·표기 설정은 `.claude/settings.json`

## 개발

```bash
npm install      # 처음 한 번
npm run dev      # 확장이 올라간 크롬이 열리고, 코드를 고치면 자동으로 다시 불러온다
npm test         # 자동 검사
npm run preview:popup  # 확장 없이 브라우저에서 팝업 화면 확인 → http://localhost:5180/tests/preview/popup.html
npm run check    # 코드 형식·린트 검사
npm run build    # .output/chrome-mv3 에 확장 결과물 생성
npm run zip      # 웹스토어 업로드용 zip 생성
```

### 내 크롬에 직접 올려 보기

1. `npm run build`
2. 크롬에서 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → `.output/chrome-mv3` 폴더 선택

### 커밋 전 자동 검사

`npm install` 하면 Husky 가 git 에 연결되어, 커밋할 때마다 `.husky/pre-commit` 의 검사
(`npm run check` → `npm run compile` → `npm test`)를 실행한다. 하나라도 실패하면 커밋이 만들어지지 않는다.

## 사용법

1. 저장할 페이지(예: 작성 중인 지원서)를 연다.
2. 툴바의 Form Archiver 아이콘을 누른다.
3. **항목** 탭에서 읽힌 내용을 확인한다. `빈칸`, `항목명 짐작` 표시가 붙은 줄은 원본 화면과 대조한다.
   필요 없는 줄은 체크를 해제한다. 메뉴·안내문 같은 화면 글은 "화면 글 모두 빼기"로 한 번에 뺄 수 있다.
4. **마크다운** 탭에서 저장될 내용을 미리 본다.
5. 기록 시점(제출 전/제출 후/기타)을 고르고 **마크다운 저장**을 누르면 다운로드 폴더에 `.md` 파일이 생긴다.

페이지에서 값을 고친 뒤에는 **다시 읽기**를 누른다. 이미 뺀 항목은 그대로 빠져 있다.
