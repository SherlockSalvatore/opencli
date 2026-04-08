import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { formatDate, mubuPost, type MubuDocument, type MubuFolder } from './utils.js';

interface ListResponse {
  folders: MubuFolder[];
  documents: MubuDocument[];
}

cli({
  site: 'mubu',
  name: 'search',
  description: '按标题关键词搜索幕布文档',
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 20, help: '最多显示条数' },
  ],
  columns: ['id', 'name', 'updated'],
  func: async (page: IPage, kwargs) => {
    const query = (kwargs.query as string).toLowerCase();
    const limit = (kwargs.limit as number) ?? 20;

    await page.goto('https://mubu.com/app');

    const data = await mubuPost<ListResponse>(page, '/list/get', { folderId: '0' });

    return (data.documents ?? [])
      .filter((doc) => doc.name.toLowerCase().includes(query))
      .slice(0, limit)
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        updated: formatDate(doc.updateTime),
      }));
  },
});
