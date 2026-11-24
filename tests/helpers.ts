import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

/** 시험 페이지를 jsdom 으로 연다. 스크립트는 실행하지 않는다. */
export function openFixture(name: string, url = 'https://apply.example.com/jobs/123/form') {
  const html = readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
  const dom = new JSDOM(html, { url });
  return { dom, doc: dom.window.document, win: dom.window as unknown as Window };
}
