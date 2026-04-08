import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { mubuPost, nodesToMarkdown, nodesToText, type MubuNode } from './utils.js';

interface DocResponse {
  name: string;
  definition: string;
}

interface Definition {
  nodes: MubuNode[];
}

cli({
  site: 'mubu',
  name: 'doc',
  description: '读取幕布文档内容，支持纯文本或 Markdown 输出',
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'id', positional: true, required: true, help: '文档 ID' },
    { name: 'output', default: 'text', help: '输出格式：text（默认）或 md' },
  ],
  columns: ['content'],
  func: async (page: IPage, kwargs) => {
    const docId = kwargs.id as string;
    const format = (kwargs.output as string) ?? 'text';

    await page.goto('https://mubu.com/app');

    const data = await mubuPost<DocResponse>(page, '/document/edit/get', { docId });

    let nodes: MubuNode[] = [];
    try {
      const def = JSON.parse(data.definition) as Definition;
      nodes = def.nodes ?? [];
    } catch {
      return [{ content: data.name }];
    }

    const output = format === 'md' ? nodesToMarkdown(nodes) : nodesToText(nodes);

    // 单条长文本直接输出，不走 table 格式
    return [{ content: output }];
  },
});
