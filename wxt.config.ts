import { defineConfig } from 'wxt';

// WXT 설정: 여기 적은 내용으로 빌드 시 manifest.json 이 만들어진다.
export default defineConfig({
  manifest: {
    name: 'Form Archiver',
    description: '지금 보고 있거나 작성 중인 페이지를 내 마크다운 기록으로 남깁니다.',
    // activeTab: 아이콘을 누른 그 탭에만 잠깐 접근한다(모든 사이트 읽기 권한 없음).
    // scripting: 그 탭에 추출 코드를 한 번 실행한다.
    permissions: ['activeTab', 'scripting'],
  },
});
