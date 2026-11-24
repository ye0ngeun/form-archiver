# Form Archiver

어느 채용 사이트에서 지원하든, 지금 보고 있거나 작성 중인 페이지를 내 마크다운 기록으로 남기는 크롬 확장 프로그램.

- 기획: [docs/기획.md](docs/기획.md)
- 완료 조건과 검증 기록: [docs/harness.md](docs/harness.md)
- 구조 설명: [docs/구조.md](docs/구조.md)

## 개발

```bash
npm install      # 처음 한 번
npm run dev      # 확장이 올라간 크롬이 열리고, 코드를 고치면 자동으로 다시 불러온다
npm test         # 자동 검사
npm run check    # 코드 형식·린트 검사
npm run build    # .output/chrome-mv3 에 확장 결과물 생성
npm run zip      # 웹스토어 업로드용 zip 생성
```

### 내 크롬에 직접 올려 보기

1. `npm run build`
2. 크롬에서 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → `.output/chrome-mv3` 폴더 선택
