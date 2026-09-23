import type { SidebarItem } from '@cloudflare/nimbus-docs/types';
import { pages } from '../../content-map.mjs';

export function navigation(pathname: string): SidebarItem[] {
  const current = pathname.replace(/\/$/, '');
  const groups = [...new Set(pages.map((page) => page.group))];
  return [
    { type: 'link', label: 'Przegląd', href: '/docs/', isCurrent: current === '/docs', order: -1 },
    ...groups.map((group, order): SidebarItem => ({
      type: 'group',
      label: group,
      order,
      collapsed: false,
      children: pages
        .filter((page) => page.group === group)
        .map((page, index) => ({
          type: 'link',
          label: page.title,
          href: `/docs/${page.slug}/`,
          isCurrent: current === `/docs/${page.slug}`,
          order: index,
        })),
    })),
  ];
}
