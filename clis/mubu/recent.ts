import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { formatDate, mubuPost, type MubuDocument, type MubuFolder } from './utils.js';

interface ListResponse {
  folders: MubuFolder[];
  documents: MubuDocument[];
  source: string;
}

cli({
  site: 'mubu',
  name: 'recent',
  description: '最近编辑的幕布文档',
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '最多显示条数' },
  ],
  columns: ['id', 'name', 'updated'],
  func: async (page: IPage, kwargs) => {
    const limit = (kwargs.limit as number) ?? 20;

    await page.goto('https://mubu.com/app');

    // source=recent 返回最近编辑列表
    const data = await mubuPost<ListResponse>(page, '/list/get', { folderId: 'recent' });

    return (data.documents ?? []).slice(0, limit).map((doc) => ({
      id: doc.id,
      name: doc.name,
      updated: formatDate(doc.updateTime),
    }));
  },
});
