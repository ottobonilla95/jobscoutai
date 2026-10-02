import { load } from 'cheerio';

export function plainText(html: string) {
  const $ = load(html); $('script,style,form').remove(); $('br').replaceWith('\n');
  $('p,li,h1,h2,h3,div').each((_, e) => { $(e).prepend('\n'); });
  return $.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim().slice(0,24000);
}
export function jsonLdObjects(html: string): Record<string, unknown>[] {
  const $ = load(html); const objects: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>; objects.push(object);
    if (object['@graph']) visit(object['@graph']);
  }
  $('script[type="application/ld+json"]').each((_, e) => { try { visit(JSON.parse($(e).text())); } catch {} });
  return objects;
}
