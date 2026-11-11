import { load } from 'cheerio'
import type { Category, ModelSpec, Offering, Rate } from '../src/types.ts'

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function classify(name: string, section: string): Category {
  const text = `${name} ${section}`.toLowerCase()
  if (/provision|ptu/.test(text)) return 'ptu'
  if (/fine.tun|reinforcement/.test(text)) return 'fine-tuning'
  if (/embedding|^ada\b/.test(text)) return 'embeddings'
  if (/sora|video/.test(text)) return 'video'
  if (/image|dall.e/.test(text)) return 'image'
  if (/audio|realtime|whisper|tts|speech|gpt-live/.test(text)) return 'audio'
  if (/tool|computer use \(responses/.test(text)) return 'tools'
  return 'text'
}

export function family(name: string): string {
  return name.match(/GPT[- ](\d+(?:\.\d+)?o?)/i)?.[0].toUpperCase().replace(' ', '-')
    ?? name.match(/^(o[134]|Sora|Dall-E|text-embedding|Whisper|TTS|Image|gpt-oss|computer-use)/i)?.[0].toUpperCase()
    ?? 'Other'
}

export function inferUnit(header: string, suffix: string, section: string): string {
  const text = `${header} ${suffix}`.toLowerCase()
  if (/100 images/.test(text)) return '100 images'
  if (/1,?000 tokens|1k tokens/.test(text)) return '1K tokens'
  if (/1m tokens|1 million tokens/.test(text)) return '1M tokens'
  if (/1m characters|million characters/.test(text)) return '1M characters'
  if (/year|annual/.test(text)) return 'PTU / year'
  if (/month/.test(text)) return 'PTU / month'
  if (/ptu.*hour/.test(text)) return 'PTU / hour'
  if (/hour/.test(text)) return 'hour'
  if (/second/.test(text)) return 'second'
  if (/1k characters|1,000 characters/.test(text)) return '1K characters'
  if (/per image/.test(text)) return 'image'
  if (/1k tool calls/.test(text)) return '1K tool calls'
  if (/gb.*per day/.test(text)) return 'GB / day'
  if (/session/.test(text)) return 'session'
  if (/token/.test(text)) return '1M tokens'
  if (/computer.use|deep research/i.test(section)) return '1M tokens'
  return 'unit (see source)'
}

export function parseSpecs(html: string, sourceUrl: string): ModelSpec[] {
  const $ = load(html)
  const specs: ModelSpec[] = []
  $('[data-pivot="azure-openai"] table').each((tableIndex, table) => {
    const headers = $(table).find('thead th').map((_, el) => clean($(el).text())).get()
    if (!headers[0]?.includes('Model ID') || !headers.some(h => /Description|Context|request|dimensions/i.test(h))) return
    const heading = $(table).prevAll('h2,h3,h4').first()
    $(table).find('tbody tr').each((rowIndex, row) => {
      const cells = $(row).children('td')
      const cellText = (index: number) => {
        if (index < 0) return ''
        const copy = cells.eq(index).clone()
        copy.find('br').replaceWith(' · ')
        return clean(copy.text())
      }
      const field = (re: RegExp) => cellText(headers.findIndex(h => re.test(h)))
      const ids = cells.first().find('code').map((_, el) => clean($(el).text())).get()
      if (!ids.length) {
        const id = cellText(0).match(/^[a-z][a-z0-9.-]+/i)?.[0]
        if (id) ids.push(id)
      }
      for (const modelId of ids) {
        specs.push({
          id: `${slug(modelId)}-${tableIndex}-${rowIndex}`,
          modelId,
          version: cellText(0).replaceAll(modelId, '').trim(),
          description: field(/Description/i),
          context: field(/Context|Max request/i),
          maxOutput: field(/Max [Oo]utput/i),
          training: field(/Training [Dd]ata/i),
          dimensions: field(/dimensions/i),
          section: clean(heading.text()),
          sourceUrl: `${sourceUrl.split('?')[0]}${heading.attr('id') ? `#${heading.attr('id')}` : ''}`,
        })
      }
    })
  })
  if (specs.length < 20) throw new Error(`Model documentation structure changed: only ${specs.length} specifications parsed.`)
  return specs
}

const normalize = (text: string) => text.toLowerCase()
  .replace(/\d{4}-\d{2}-\d{2}|\b\d{8}\b|\b\d{4}\b/g, '')
  .replace(/preview/g, '').replace(/[^a-z0-9.]/g, '')

export function matchSpecs(name: string, specs: ModelSpec[]): string[] {
  const normalized = normalize(name
    .replace(/\([^)]*(context|fine-tuning)[^)]*\)/gi, '')
    .replace(/\b(short context|long context|global|data\s?zone|regional)\b/gi, ''))
  const matches = specs.filter(s => normalized === normalize(s.modelId))
  const longest = Math.max(0, ...matches.map(s => normalize(s.modelId).length))
  return matches.filter(s => normalize(s.modelId).length === longest).map(s => s.id)
}

export function parsePricing(html: string, specs: ModelSpec[]): Offering[] {
  const $ = load(html)
  const offerings: Offering[] = []
  let section = ''
  $('h2,h3,h4,table').each((tableIndex, element) => {
    if (element.tagName !== 'table') {
      section = clean($(element).text())
      return
    }
    const table = $(element)
    if (!table.find('[data-amount]').length) return
    const headers = table.find('thead tr').last().children().toArray()
      .flatMap(el => Array<string>(Number($(el).attr('colspan') ?? 1)).fill(clean($(el).text())))
    const rowSpans = new Map<number, { html: string; remaining: number }>()
    table.find('tbody tr').each((rowIndex, row) => {
      const rawCells = $(row).children('td,th').toArray()
      const cellHtml: string[] = []
      let rawIndex = 0
      for (let col = 0; col < headers.length; col++) {
        const span = rowSpans.get(col)
        if (span) {
          cellHtml.push(span.html)
          if (--span.remaining === 0) rowSpans.delete(col)
        } else {
          const cell = rawCells[rawIndex++]
          if (!cell) { cellHtml.push(''); continue }
          const html = $(cell).html() ?? ''
          cellHtml.push(html)
          const rowspan = Number($(cell).attr('rowspan') ?? 1)
          if (rowspan > 1) rowSpans.set(col, { html, remaining: rowspan - 1 })
        }
      }
      const first = load(cellHtml[0] ?? '')
      let name = clean(first.text())
      if (!name) return
      const dimensions: Record<string, string> = {}
      cellHtml.forEach((html, col) => {
        const cell = load(html)
        if (!cell('[data-amount]').length && col > 0) dimensions[headers[col] || `Column ${col}`] = clean(cell.text())
      })
      const dimensionDeployment = Object.values(dimensions).find(value => /^(Global|Regional|Data Zone)$/i.test(value))
      if (dimensionDeployment && !/Global|Regional|Data.?Zone/i.test(name)) name += ` ${dimensionDeployment}`
      if (/sora/i.test(section) && !/sora/i.test(name)) name = `${section} · ${name}`
      cellHtml.forEach((html, col) => {
        const cell = load(`<div id="cell">${html}</div>`)
        const rates: Rate[] = []
        let preceding = ''
        let modality = ''
        let group = ''
        cell('#cell').contents().each((_, node) => {
          if (node.type === 'text') {
            preceding += node.data
          } else if (node.type === 'tag' && node.attribs['data-amount']) {
            const amount: unknown = JSON.parse(node.attribs['data-amount'])
            if (!amount || typeof amount !== 'object' || !('regional' in amount)) throw new Error(`Invalid price data: ${name}`)
            const prices = amount.regional
            if (!prices || typeof prices !== 'object') throw new Error(`Missing regional price map: ${name}`)
            const valid: Record<string, number> = {}
            for (const [region, price] of Object.entries(prices)) {
              if (typeof price === 'number' && Number.isFinite(price) && price >= 0) valid[region] = price
            }
            if (!Object.keys(valid).length) return
            let label = clean(preceding).replace(/^[:;,/ ]+|[: ]+$/g, '')
            const modalityMatch = label.match(/^(Text|Audio|Image)\s+(Input|Output|Cached)/i)
            if (modalityMatch) modality = modalityMatch[1]!
            if (modality && /^(Input|Output|Cached)/i.test(label) && !/^(Text|Audio|Image)/i.test(label)) label = `${modality} ${label}`
            if (group) label = `${group}: ${label}`
            const nextText = node.next?.type === 'text' ? node.next.data : node.next?.type === 'tag' ? cell(node.next).text() : ''
            rates.push({
              label: label || headers[col] || 'Price',
              unit: inferUnit(`${headers[col] ?? ''} ${/per second/i.test(headers[0] ?? '') ? 'per second' : ''}`, nextText, section),
              prices: valid,
            })
            preceding = ''
          } else if (node.type === 'tag' && node.name === 'br') {
            const heading = clean(preceding).replace(/:$/, '')
            if (/^(Text|Audio|Image)$/i.test(heading)) { modality = heading; group = '' }
            if (/^Grader (input|cached input|output)$/i.test(heading)) { group = heading; modality = '' }
            preceding = ''
          } else if (node.type === 'tag') {
            preceding += cell(node).text()
          }
        })
        if (!rates.length) return
        const header = headers[col] ?? ''
        const mode = /batch/i.test(header) ? 'Batch' : /priority/i.test(header) ? 'Priority'
          : /flex/i.test(header) ? 'Flex' : /reservation/i.test(header) ? 'Reservation' : 'Standard'
        const category = classify(name, section)
        offerings.push({
          id: `${slug(name)}-${tableIndex}-${rowIndex}-${col}`,
          name, family: family(name), section, category, mode,
          deployment: /global/i.test(name) ? 'Global' : /data.?zone/i.test(name) ? 'Data Zone' : 'Regional',
          dimensions: { ...dimensions, ...(category === 'ptu' ? { 'PTU plan': header } : {}) },
          rates, specIds: matchSpecs(name, specs),
        })
      })
    })
  })
  if (offerings.length < 80) throw new Error(`Pricing page structure changed: only ${offerings.length} offerings parsed.`)
  return offerings
}
