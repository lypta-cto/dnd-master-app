import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Markdown → safe HTML, with [[wiki links]] turned into real anchors.
 *
 * Resolution happens against the names the API already linked, so the renderer
 * agrees with the backend about what exists: resolved names become links to the
 * entity, unresolved ones render muted with a dotted underline.
 */
export function useMarkdown() {
  function render(
    body: string | null | undefined,
    linked: { name: string, slug: string, id: string }[] = []
  ): string {
    if (!body) {
      return ''
    }

    const byName = new Map(linked.map(e => [e.name.toLowerCase(), e]))

    const withLinks = body.replace(
      /\[\[([^[\]|]{1,200}?)(?:\|([^[\]]{0,200}?))?\]\]/g,
      (_match, target: string, label?: string) => {
        const entity = byName.get(target.trim().toLowerCase())
        const text = (label ?? target).trim()

        if (entity) {
          return `<a href="/entities/${entity.id}" class="wiki-link" data-entity="${entity.id}">${text}</a>`
        }
        return `<span class="wiki-link-unresolved" title="No entity named “${target.trim()}” yet">${text}</span>`
      }
    )

    const html = marked.parse(withLinks, { async: false, gfm: true, breaks: true })

    return DOMPurify.sanitize(html, {
      ALLOWED_ATTR: ['href', 'class', 'data-entity', 'title', 'src', 'alt']
    })
  }

  return { render }
}
