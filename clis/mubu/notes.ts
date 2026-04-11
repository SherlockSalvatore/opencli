import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { mubuPost, nodesToMarkdown, htmlToText, type MubuNode, type DocResponse, type Definition } from './utils.js';

// ── 类型 ──────────────────────────────────────────────────

interface DailyDoc {
  id: string;
  name: string; // e.g. "2026年"
}

interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

interface DayEntry {
  dateKey: string; // "2026-04-10"
  label: string;   // "4 月 10 日，周五"
  node: MubuNode;
}

// ── 日期工具 ──────────────────────────────────────────────

function localToday(): SimpleDate {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function parseDate(s: string): SimpleDate {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`日期格式错误：${s}，应为 YYYY-MM-DD`);
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function parseMonth(s: string): { year: number; month: number } {
  const parts = s.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) {
    throw new Error(`月份格式错误：${s}，应为 YYYY-MM`);
  }
  return { year: parts[0], month: parts[1] };
}

function dateToKey(d: SimpleDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 将各种时间参数统一解析为 {start, end} */
function resolveRange(kwargs: Record<string, unknown>): { start: SimpleDate; end: SimpleDate } {
  const dateStr = kwargs.date as string | undefined;
  const monthStr = kwargs.month as string | undefined;
  const yearArg = kwargs.year as number | undefined;
  const fromStr = kwargs.from as string | undefined;
  const toStr = kwargs.to as string | undefined;

  // --from / --to 优先级最高
  if (fromStr || toStr) {
    if (!fromStr) throw new Error('使用 --to 时必须同时指定 --from');
    const start = parseDate(fromStr);
    const end = toStr ? parseDate(toStr) : localToday();
    if (dateToKey(start) > dateToKey(end)) throw new Error('--from 不能晚于 --to');
    return { start, end };
  }

  if (yearArg) {
    return {
      start: { year: yearArg, month: 1, day: 1 },
      end: { year: yearArg, month: 12, day: 31 },
    };
  }

  if (monthStr) {
    const { year, month } = parseMonth(monthStr);
    return {
      start: { year, month, day: 1 },
      end: { year, month, day: lastDayOfMonth(year, month) },
    };
  }

  if (dateStr) {
    const d = parseDate(dateStr);
    return { start: d, end: d };
  }

  // 默认：今天
  const today = localToday();
  return { start: today, end: today };
}

// ── API 工具 ──────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
}

async function getYearDocId(page: IPage, year: number): Promise<string | null> {
  const raw = (await page.evaluate(`localStorage.getItem('daily_notes_doc_list')`)) as string | null;
  if (!raw) return null;
  const list = JSON.parse(raw) as DailyDoc[];
  return list.find((d) => d.name === `${year}年`)?.id ?? null;
}

async function getYearNodes(page: IPage, docId: string): Promise<MubuNode[]> {
  const data = await mubuPost<DocResponse>(page, '/document/edit/get', { docId });
  const def = JSON.parse(data.definition) as Definition;
  return def.nodes ?? [];
}

/** 加载某年的所有 day 节点，返回带 dateKey 的列表 */
async function loadYearEntries(page: IPage, year: number): Promise<DayEntry[]> {
  const docId = await getYearDocId(page, year);
  if (!docId) return [];

  const yearNodes = await getYearNodes(page, docId);
  const entries: DayEntry[] = [];

  for (const monthNode of yearNodes) {
    const monthNum = parseInt(stripHtml(monthNode.text), 10);
    if (!monthNode.children?.length) continue;

    for (const dayNode of monthNode.children) {
      // 节点文本如 "4 月 10 日，周五" → stripHtml → "4月10日，周五"
      const stripped = stripHtml(dayNode.text);
      // 提取日期数字：匹配 "M月D日"
      const match = stripped.match(/^(\d+)月(\d+)日/);
      if (!match) continue;
      const m = parseInt(match[1], 10);
      const d = parseInt(match[2], 10);
      if (m !== monthNum) continue;

      const dateKey = dateToKey({ year, month: m, day: d });
      const label = htmlToText(dayNode.text).replace(/\s+/g, ' ').trim();
      entries.push({ dateKey, label, node: dayNode });
    }
  }

  return entries;
}

/** 收集 [start, end] 范围内涉及的所有年份 */
function yearsInRange(start: SimpleDate, end: SimpleDate): number[] {
  const years: number[] = [];
  for (let y = start.year; y <= end.year; y++) years.push(y);
  return years;
}

// ── 命令 ──────────────────────────────────────────────────

cli({
  site: 'mubu',
  name: 'notes',
  description: [
    '读取幕布今日速记。--list 为概览模式（日期+条数，不含内容），默认为内容模式。',
    '',
    '时间范围参数（任选其一，可与 --list 自由组合）：',
    '  (无参数)                       今天',
    '  --date YYYY-MM-DD              单日',
    '  --month YYYY-MM                整月',
    '  --year YYYY                    整年',
    '  --from YYYY-MM-DD              起始日（须与 --to 同用）',
    '  --to YYYY-MM-DD                截止日（须与 --from 同用）',
    '',
    '示例：',
    '  notes                          今天完整内容',
    '  notes --date 2026-04-10        4月10日完整内容',
    '  notes --month 2026-04          4月每天完整内容',
    '  notes --year 2025              2025年每天完整内容',
    '  notes --from 2026-01-01 --to 2026-03-31   Q1完整内容',
    '  notes --list                   今年所有有记录日期+条数',
    '  notes --list --month 2026-04   4月日期+条数',
    '  notes --list --from 2026-01-01 --to 2026-03-31  Q1日期+条数',
  ].join('\n'),
  domain: 'mubu.com',
  strategy: Strategy.COOKIE,
  args: [
    {
      name: 'list',
      type: 'bool',
      default: false,
      help: '概览模式：只输出日期和条数，不含速记内容。可与任意时间范围参数组合。',
    },
    {
      name: 'date',
      help: '单日，格式 YYYY-MM-DD。不指定时间范围则默认今天（系统本地时间）。',
    },
    {
      name: 'month',
      help: '整月，格式 YYYY-MM。',
    },
    {
      name: 'year',
      type: 'int',
      help: '整年，格式 YYYY（整数）。',
    },
    {
      name: 'from',
      help: '范围起始日，格式 YYYY-MM-DD。须与 --to 同时使用。',
    },
    {
      name: 'to',
      help: '范围截止日，格式 YYYY-MM-DD。须与 --from 同时使用。',
    },
  ],
  columns: ['date', 'content'],
  func: async (page: IPage, kwargs) => {
    const isList = kwargs.list as boolean;

    await page.goto('https://mubu.com/app');

    const { start, end } = resolveRange(kwargs);
    const startKey = dateToKey(start);
    const endKey = dateToKey(end);

    // 加载所有涉及年份的 day 节点，并按范围过滤
    const allEntries: DayEntry[] = [];
    for (const year of yearsInRange(start, end)) {
      const entries = await loadYearEntries(page, year);
      for (const entry of entries) {
        if (entry.dateKey >= startKey && entry.dateKey <= endKey) {
          allEntries.push(entry);
        }
      }
    }

    if (allEntries.length === 0) {
      const label = startKey === endKey ? startKey : `${startKey} ~ ${endKey}`;
      return [{ date: label, content: '该时间段暂无速记' }];
    }

    // 概览模式
    if (isList) {
      return allEntries.map((e) => ({
        date: e.label,
        content: `${e.node.children?.length ?? 0} 条记录`,
      }));
    }

    // 内容模式
    return allEntries
      .filter((e) => e.node.children?.length)
      .map((e) => ({
        date: e.label,
        content: nodesToMarkdown(e.node.children ?? []) || '（空）',
      }));
  },
});
