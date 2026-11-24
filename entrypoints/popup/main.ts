import { browser } from 'wxt/browser';
import { extractPage } from '../../lib/extract-page';
import type { PageRecord } from '../../lib/types';
import { mountPopup } from './view';

// 크롬이 확장 프로그램의 코드 실행을 막는 주소들
const BLOCKED =
  /^(chrome|edge|about|devtools|chrome-extension|view-source):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/;

/** 아이콘을 누른 탭에서 extractPage 를 한 번 실행하고 결과만 받아 온다. */
async function loadFromActiveTab(): Promise<PageRecord> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('현재 탭을 찾지 못했습니다.');
  if (tab.url && BLOCKED.test(tab.url)) {
    throw new Error('이 페이지는 크롬이 확장 프로그램의 접근을 막고 있어 읽을 수 없습니다.');
  }
  try {
    const [res] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPage,
    });
    if (!res?.result) throw new Error('결과가 비어 있습니다.');
    return res.result as PageRecord;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (tab.url?.startsWith('file:')) {
      throw new Error(
        '내 컴퓨터의 파일을 읽으려면 chrome://extensions 의 Form Archiver 세부정보에서 "파일 URL에 대한 액세스 허용"을 켜 주세요.',
      );
    }
    throw new Error(`페이지를 읽지 못했습니다: ${msg}`);
  }
}

const app = document.getElementById('app');
if (app) mountPopup(app, { load: loadFromActiveTab });
