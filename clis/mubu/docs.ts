import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { formatDate, mubuPost, type MubuDocument, type MubuFolder } from './utils.js';

interface ListResponse {
  folders: MubuFolder[];
  documents: MubuDocument[];
  source: string;
  folderId: string;
}

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
  columns: ['id', 'name', 'updated', 'stared', 'folder'],
  func: async (page: IPage, kwargs) => {
    const folderId = (kwargs.folder as string) ?? '0';
    const limit = (kwargs.limit as number) ?? 50;

    await page.goto('https://mubu.com/app');
    const data = await mubuPost<ListResponse>(page, '/list/get', { folderId });

    const docs = (data.documents ?? []).slice(0, limit).map((doc) => ({
      id: doc.id,
      name: doc.name,
      updated: formatDate(doc.updateTime),
      stared: doc.stared ? '★' : '',
      folder: doc.folderId === '0' ? '根目录' : doc.folderId,
    }));

    return docs;
  },
});
