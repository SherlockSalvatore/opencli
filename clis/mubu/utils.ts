import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/types';

export const API_BASE = 'https://api2.mubu.com/v3/api';
const MUBU_DOMAIN = 'mubu.com';
const AUTH_HINT = 'Mubu requires a logged-in browser session at mubu.com';

export interface MubuResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
}

export interface MubuDocument {
  id: string;
  name: string;
  createTime: number;
  updateTime: number;
  folderId: string;
  stared: number;
  type: number;
  encrypted: number;
  deleted?: number;
}

export interface MubuFolder {
  id: string;
  name: string;
  createTime: number;
  updateTime: number;
  parentId: string;
}

export interface MubuNode {
  id: string;
  text: string;
  modified?: number;
  heading?: number;
  collapsed?: boolean;
  children?: MubuNode[];
  images?: { id: string; uri: string; w: number; oh: number; ow: number }[];
}

function isAuthFailure(code: number, message?: string): boolean {
  if (code === 401 || code === 403) return true;
  if (!message) return false;
  return /not logged in|login required|unauthorized|未登录|请先登录|需要登录|login expired/i.test(message);
}

/**
 * 在浏览器页面上下文里用 XHR 发 POST 请求（参考 zsxq 适配器模式）。
 * mubu app 自身也是这个机制：从 localStorage 读 Jwt-Token，通过同名 header 发到 api2.mubu.com。
 * 不经过 Node.js 进程发网络请求，避免 CORS 问题和 extension fetch 拦截。
 */
export async function mubuPost<T = unknown>(
  page: IPage,
  path: string,
  body: object,
): Promise<T> {
  const url = `${API_BASE}${path}`;

  type XhrResult = { ok: boolean; status: number; data: MubuResponse<T> | null; error?: string };

  const result = await page.evaluate(`
    (async () => {
      const token = localStorage.getItem('Jwt-Token');
      if (!token) return { ok: false, status: 0, data: null, error: 'no token' };
      return await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', ${JSON.stringify(url)}, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Jwt-Token', token);
        xhr.onload = () => {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch {}
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
        };
        xhr.onerror = () => resolve({ ok: false, status: 0, data: null, error: 'network error' });
        xhr.send(${JSON.stringify(JSON.stringify(body))});
      });
    })()
  `) as XhrResult;

  if (!result || result.error === 'no token') {
    throw new AuthRequiredError(MUBU_DOMAIN, AUTH_HINT);
  }
  if (!result.ok || !result.data) {
    throw new CommandExecutionError(`mubu: ${path}: HTTP ${result.status} ${result.error ?? ''}`);
  }

  const { data } = result;
  if (data.code !== 0) {
    if (isAuthFailure(data.code, data.message)) {
      throw new AuthRequiredError(MUBU_DOMAIN, AUTH_HINT);
    }
    throw new CommandExecutionError(`mubu: ${path}: code=${data.code} ${data.message ?? ''}`);
  }

  return data.data;
}

export function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
}

/** 将幕布 HTML text 转为纯文本 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 将幕布 HTML text 转为 Markdown inline 标记 */
export function htmlToMarkdown(html: string): string {
  let md = html;
  // bold
  md = md.replace(/<span class="bold">([^<]*)<\/span>/g, '**$1**');
  // italic
  md = md.replace(/<span class="italic">([^<]*)<\/span>/g, '*$1*');
  // links（幕布链接格式：<a href="..."><span class="content-link-text">text</span></a>）
  md = md.replace(/<a href="([^"]+)"[^>]*>(?:<span[^>]*>)?([^<]*)(?:<\/span>)?<\/a>/g, '[$2]($1)');
  // 普通 span
  md = md.replace(/<span[^>]*>([^<]*)<\/span>/g, '$1');
  // 其余标签
  md = md.replace(/<[^>]+>/g, '');
  // HTML 实体
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return md.trim();
}

/** 递归将节点树渲染为缩进纯文本 */
export function nodesToText(nodes: MubuNode[], depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const text = htmlToText(node.text);
    if (text) lines.push('  '.repeat(depth) + text);
    if (node.children?.length) {
      lines.push(nodesToText(node.children, depth + 1));
    }
  }
  return lines.filter(Boolean).join('\n');
}

/** 递归将节点树渲染为 Markdown（大纲 = 缩进列表，不映射为标题） */
export function nodesToMarkdown(nodes: MubuNode[], depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const text = htmlToMarkdown(node.text);
    if (!text) continue;

    lines.push('  '.repeat(depth) + '- ' + text);

    if (node.children?.length) {
      lines.push(nodesToMarkdown(node.children, depth + 1));
    }
  }
  return lines.filter(Boolean).join('\n');
}
