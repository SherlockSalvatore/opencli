import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { mubuPost, htmlToText } from './utils.js';

interface SearchPath {
  id: string;
  name: string;
}

interface SearchFolder {
  id: string;
  name: string;
  paths: SearchPath[];
  encrypted: number;
}

interface SearchNode {
  id: string;
  text: string;
}

interface SearchDocument {
  id: string;
  name: string;
  type: number;
  paths: SearchPath[];
  total: number;   // 文档内所有命中节点总数（服务端统计）
  nodes: SearchNode[]; // 最多 5 条命中节点预览（服务端截断）
  encrypted: number;
}

interface SearchResponse {
  folders: SearchFolder[];
  documents: SearchDocument[];
}

cli({
  site: 'mubu',
  name: 'search',
  description: [
    '全局搜索幕布文档和文件夹（标题+内容，服务端全量匹配，一次返回全部结果）。',
    '',
    '输出字段说明：',
    '  type    — folder（文件夹）或 doc（文档）',
    '            · folder → 用 `mubu docs --folder <id>` 浏览其内容',
    '            · doc    → 用 `mubu doc <id>` 读取完整内容',
    '  id      — 唯一标识符，同名文档仅凭 id 区分',
    '  name    — 文档或文件夹名称，可能重名',
    '  path    — 面包屑路径（如 我的文档 > 个人 > 学习）',
    '  hits    — 文档内命中关键词的节点总数；0 表示仅标题命中，无正文匹配',
    '  snippet — 文档内最多 5 条命中节点文本，用 | 分隔；标题命中时为空',
    '',
    'Agent 歧义处理规范：',
    '  · 单结果：直接使用其 id。',
    '  · 多结果、name 各不同：展示 name + path + snippet，请用户确认目标。',
    '  · 同名文档（含同路径同名）：path 相同时以 hits 数量和 snippet 内容辅助区分；',
    '    若仍无法判断，列出所有 id，告知用户用 `mubu doc <id>` 逐一确认内容后再决定。',
    '  · snippet 有值但 name 不含关键词：属于正文命中而非标题命中，需额外向用户确认。',
  ].join('\n'),
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 100, help: '最多显示条数（默认 100，结果被截断时用 --limit N 调大）' },
  ],
  columns: ['type', 'id', 'name', 'path', 'hits', 'snippet'],
  func: async (page: IPage, kwargs) => {
    const query = kwargs.query as string;
    const limit = (kwargs.limit as number) ?? 100;

    await page.goto('https://mubu.com/app');

    const data = await mubuPost<SearchResponse>(page, '/list/search', { keywords: query });

    const formatPath = (paths: SearchPath[]) => paths.map((p) => p.name).join(' > ');

    const folders = (data.folders ?? []).map((f) => ({
      type: 'folder',
      id: f.id,
      name: f.name,
      path: formatPath(f.paths),
      hits: '',
      snippet: '',
    }));

    const docs = (data.documents ?? []).map((d) => ({
      type: 'doc',
      id: d.id,
      name: d.name,
      path: formatPath(d.paths),
      hits: d.total > 0 ? String(d.total) : '',
      snippet: d.nodes
        .map((n) => htmlToText(n.text))
        .filter(Boolean)
        .join(' | '),
    }));

    const all = [...folders, ...docs];
    const result = all.slice(0, limit);

    if (all.length > limit) {
      result.push({
        type: '...',
        id: '',
        name: `还有 ${all.length - limit} 条未显示，用 --limit ${all.length} 查看全部`,
        path: '',
        hits: '',
        snippet: '',
      });
    }

    return result;
  },
});
