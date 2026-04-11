import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { formatDate, mubuPost, type MubuDocument, type MubuFolder, type ListResponse } from './utils.js';

cli({
  site: 'mubu',
  name: 'docs',
  description: '列出幕布文档（默认根目录）',
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'folder', default: '0', help: '文件夹 ID（默认根目录 0）' },
    { name: 'limit', type: 'int', default: 50, help: '最多显示条数' },
  ],
  columns: ['type', 'id', 'name', 'updated', 'stared'],
  func: async (page: IPage, kwargs) => {
    const folderId = (kwargs.folder as string) ?? '0';
    const limit = (kwargs.limit as number) ?? 50;

    await page.goto('https://mubu.com/app');
    const data = await mubuPost<ListResponse>(page, '/list/get', { folderId });

    const folders = (data.folders ?? []).map((f) => ({
      type: '📁',
      id: f.id,
      name: f.name,
      updated: formatDate(f.updateTime),
      stared: '',
    }));

    const docs = (data.documents ?? []).map((doc) => ({
      type: '📄',
      id: doc.id,
      name: doc.name,
      updated: formatDate(doc.updateTime),
      stared: doc.stared ? '★' : '',
    }));

    return [...folders, ...docs].slice(0, limit);
  },
});
