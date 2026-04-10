import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { mubuPost } from './utils.js';

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
  total: number;
  nodes: SearchNode[];
  encrypted: number;
}

interface SearchResponse {
  folders: SearchFolder[];
  documents: SearchDocument[];
}

cli({
  site: 'mubu',
  name: 'search',
  description: '全局搜索幕布文档和文件夹（标题+内容，服务端全量匹配）',
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 100, help: '最多显示条数（默认 100，结果被截断时用 --limit N 调大）' },
  ],
  columns: ['type', 'id', 'name', 'path', 'snippet'],
  func: async (page: IPage, kwargs) => {
    const query = kwargs.query as string;
    const limit = (kwargs.limit as number) ?? 50;

    await page.goto('https://mubu.com/app');

    const data = await mubuPost<SearchResponse>(page, '/list/search', { keywords: query });

    const formatPath = (paths: SearchPath[]) =>
      paths.map((p) => p.name).join(' > ');

    const folders = (data.folders ?? []).map((f) => ({
      type: 'folder',
      id: f.id,
      name: f.name,
      path: formatPath(f.paths),
      snippet: '',
    }));

    const docs = (data.documents ?? []).map((d) => ({
      type: 'doc',
      id: d.id,
      name: d.name,
      path: formatPath(d.paths),
      snippet: d.nodes[0]?.text ?? '',
    }));

    const all = [...folders, ...docs];
    const result = all.slice(0, limit);

    if (all.length > limit) {
      result.push({
        type: '...',
        id: '',
        name: `还有 ${all.length - limit} 条未显示，用 --limit ${all.length} 查看全部`,
        path: '',
        snippet: '',
      });
    }

    return result;
  },
});
