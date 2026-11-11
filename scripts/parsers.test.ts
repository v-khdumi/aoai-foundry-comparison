import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Catalog, ModelSpec } from '../src/types.ts'
import { classify, inferUnit, matchSpecs, parsePricing, parseSpecs } from './parsers.ts'

const price = (value: number) => `<span data-amount='{"regional":{"europe-west":${value},"us-east":${value * 2}}}'>$-</span>`
const fill = Array.from({ length: 80 }, (_, i) => `<tr><td>Model ${i} Global</td><td>Input: ${price(2)}<br>Cached Input: ${price(0.5)}<br>Output: ${price(8)}</td></tr>`).join('')
const table = (rows: string, header = '<th>Model</th><th>Pricing (1M Tokens)</th>') => `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`
const base = `<h2>GPT test</h2>${table(fill)}`

describe('pricing parser', () => {
  it('reads embedded prices, regions and three independent components', () => {
    const result = parsePricing(base, [])
    expect(result).toHaveLength(80)
    expect(result[0]?.rates.map(r => r.label)).toEqual(['Input', 'Cached Input', 'Output'])
    expect(result[0]?.rates[0]?.prices).toEqual({ 'europe-west': 2, 'us-east': 4 })
    expect(result[0]?.rates[0]?.unit).toBe('1M tokens')
  })
  it('preserves audio/text/image modality and grader headings', () => {
    const html = `${base}<h2>Audio</h2>${table(`<tr><td>gpt-realtime Global</td><td>Text<br>Input: ${price(1)}<br>Output: ${price(2)}<br>Audio<br>Input: ${price(3)}<br>Cached Input: ${price(4)}<br>Image<br>Input: ${price(5)}<br></td></tr>`)}<h2>Fine-tuning</h2>${table(`<tr><td>o4-mini</td><td>Grader input:<br>GPT-4o: ${price(1)}/1M tokens<br>Grader output:<br>GPT-4o: ${price(2)}/1M tokens</td></tr>`, '<th>Model</th><th>Pricing</th>')}`
    const result = parsePricing(html, [])
    expect(result[80]?.rates.map(r => r.label)).toEqual(['Text Input', 'Text Output', 'Audio Input', 'Audio Cached Input', 'Image Input'])
    expect(result[81]?.rates.map(r => r.label)).toEqual(['Grader input: GPT-4o', 'Grader output: GPT-4o'])
  })
  it('resolves rowspans, deployment columns and image quality dimensions', () => {
    const rows = `<tr><td rowspan="2">Test fine-tuning</td><td>Global</td><td>Input: ${price(1)}/1M tokens<br>Hosting: ${price(2)}/hour</td></tr><tr><td>Data Zone</td><td>Input: ${price(3)}/1M tokens</td></tr>`
    const result = parsePricing(`${base}<h2>Fine-tuning</h2>${table(rows, '<th>Model</th><th></th><th>Pricing</th>')}`, [])
    expect(result[80]?.deployment).toBe('Global')
    expect(result[81]?.deployment).toBe('Data Zone')
    expect(result[81]?.name).toBe('Test fine-tuning Data Zone')
    expect(result[80]?.rates[1]?.unit).toBe('hour')
  })
  it('does not invent Batch discounts or missing N/A prices', () => {
    const result = parsePricing(`${base}${table(`<tr><td>Model Global</td><td>Input: ${price(3)}</td><td>Input: ${price(1.7)}</td><td>N/A</td></tr>`, '<th>Model</th><th>Pricing (1M Tokens)</th><th>Batch API (1M Tokens)</th><th>Priority</th>')}`, [])
    expect(result.slice(80).map(o => o.mode)).toEqual(['Standard', 'Batch'])
    expect(result[81]?.rates[0]?.prices['europe-west']).toBe(1.7)
  })
  it('keeps Sora duration bands in seconds and storage/session units explicit', () => {
    const result = parsePricing(`${base}<h2>Sora</h2>${table(`<tr><td>480p Global</td><td>${price(0.1)}</td></tr>`, '<th>Price per second</th><th>1-5s</th>')}`, [])
    expect(result[80]?.name).toBe('Sora · 480p Global')
    expect(result[80]?.rates[0]?.unit).toBe('second')
    expect(inferUnit('Input', '/1K tool calls', '')).toBe('1K tool calls')
    expect(inferUnit('Input', '/GB of vector-storage per day (1 GB free)', '')).toBe('GB / day')
    expect(inferUnit('Input', '/session', '')).toBe('session')
    expect(inferUnit('Per PTU Yearly Reservation Pricing', '', '')).toBe('PTU / year')
  })
  it('fails loudly when upstream structure stops matching', () => {
    expect(() => parsePricing('<p>Different source structure</p>', [])).toThrow('structure changed')
  })
})

describe('documentation parser', () => {
  it('only reads Azure OpenAI model specifications, preserving version caveats', () => {
    const rows = Array.from({ length: 21 }, (_, i) => `<tr><td><code>gpt-test-${i}</code> (2026-01-01)</td><td>Reasoning; structured outputs</td><td>128,000 (Standard only)</td><td>16,384</td><td>April 2025</td></tr>`).join('')
    const html = `<div data-pivot="azure-openai"><h3 id="test">Models</h3>${table(rows, '<th>Model ID</th><th>Description</th><th>Context Window</th><th>Max Output Tokens</th><th>Training Data (up to)</th>')}</div>`
    const specs = parseSpecs(html, 'https://learn.microsoft.com/test')
    expect(specs).toHaveLength(21)
    expect(specs[0]?.context).toBe('128,000 (Standard only)')
    expect(specs[0]?.version).toBe('(2026-01-01)')
  })
  it('prefers the specific mini model over a generic family match', () => {
    const makeSpec = (id: string, modelId: string): ModelSpec => ({ id, modelId, version: '', description: '', context: '', maxOutput: '', training: '', dimensions: '', section: '', sourceUrl: '' })
    const specs = [makeSpec('full', 'gpt-4.1'), makeSpec('mini', 'gpt-4.1-mini')]
    expect(matchSpecs('GPT-4.1-mini-2025-04-14 Global', specs)).toEqual(['mini'])
    expect(matchSpecs('GPT-4.1-turbo Global', specs)).toEqual([])
    expect(matchSpecs('GPT-4.1.1 Global', specs)).toEqual([])
    expect(matchSpecs('Unrelated model', specs)).toEqual([])
  })
  it('classifies provisioning, fine-tuning and embedding correctly', () => {
    expect(classify('GPT-5 Global', 'Provisioned throughput')).toBe('ptu')
    expect(classify('GPT-4.1', 'Fine-tuning')).toBe('fine-tuning')
    expect(classify('text-embedding-3-small', 'Embedding models')).toBe('embeddings')
  })
})

describe('published snapshot', () => {
  const data = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8')) as Catalog
  it('covers all requested categories, regions and fully paginated retail meters', () => {
    expect(new Set(data.offerings.map(o => o.category)).size).toBe(8)
    expect(data.offerings.length).toBeGreaterThan(300)
    expect(data.regions.length).toBeGreaterThan(20)
    expect(data.retailMeters.length).toBeGreaterThan(1000)
    expect(data.specs.length).toBeGreaterThan(30)
  })
  it('has unique variant identifiers and no dangling specification references', () => {
    expect(new Set(data.offerings.map(o => o.id)).size).toBe(data.offerings.length)
    const ids = new Set(data.specs.map(s => s.id))
    expect(data.offerings.every(o => o.specIds.every(id => ids.has(id)))).toBe(true)
  })
  it('only contains finite nonnegative USD prices and explicit billing units', () => {
    expect(data.currency).toBe('USD')
    for (const o of data.offerings) for (const r of o.rates) {
      expect(r.unit).not.toContain('unit (see source)')
      expect(Object.values(r.prices).every(p => Number.isFinite(p) && p >= 0)).toBe(true)
    }
  })
})
