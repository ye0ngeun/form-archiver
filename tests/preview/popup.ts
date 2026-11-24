// 개발용 팝업 미리보기: 크롬 확장으로 올리지 않고도 팝업 화면을 브라우저에서 확인한다.
// 확장에서는 현재 탭을 읽지만, 여기서는 옆 iframe 의 시험 페이지를 같은 extractPage 로 읽는다.
import { mountPopup } from '../../entrypoints/popup/view';
import { extractPage } from '../../lib/extract-page';

const frame = document.getElementById('page') as HTMLIFrameElement;
const select = document.getElementById('fixture') as HTMLSelectElement;
const app = document.getElementById('app') as HTMLElement;

function loadFixture(src: string) {
  return new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.src = src;
  });
}

async function start() {
  await loadFixture(select.value);
  mountPopup(app, {
    load: async () => {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) throw new Error('시험 페이지를 열지 못했습니다.');
      return extractPage(doc, win as unknown as Window);
    },
  });
}

select.addEventListener('change', () => {
  app.replaceChildren();
  void start();
});

void start();
