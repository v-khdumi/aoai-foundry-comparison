import type { Catalog, Category, ModelSpec, Offering, Rate } from '../types.ts'

export const categories: Record<Category, string> = {
  text: 'Text & reasoning', image: 'Images', audio: 'Audio & speech',
  video: 'Video', embeddings: 'Embeddings', 'fine-tuning': 'Fine-tuning', ptu: 'Provisioned / PTU', tools: 'Tools',
}

export const regionLabel = (region: string) => ({
  'europe-west': 'West Europe', 'sweden-central': 'Sweden Central',
  'us-east': 'East US', 'us-east-2': 'East US 2', 'united-kingdom-south': 'UK South',
}[region] ?? region.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' '))

export function assertCatalog(value: unknown): asserts value is Catalog {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('offerings' in value) || !Array.isArray(value.offerings) || !value.offerings.length
    || !('specs' in value) || !Array.isArray(value.specs)
    || !('regions' in value) || !Array.isArray(value.regions)
    || !('retailMeters' in value) || !Array.isArray(value.retailMeters)
    || !('updatedAt' in value) || typeof value.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('The published catalog is invalid. Check the data refresh workflow.')
}

export function ratePrice(rate: Rate | undefined, region: string): number | undefined {
  return rate?.prices[region]
}

export function tokenRate(offering: Offering, kind: 'input' | 'cached' | 'output'): Rate | undefined {
  return offering.rates.find(rate => {
    if (!/^(1M|1K) tokens$/.test(rate.unit) || /audio|image|grader|training/i.test(rate.label)) return false
    if (offering.category === 'embeddings' && kind === 'input') return true
    if (kind === 'cached') return /cached|cache.*input/i.test(rate.label)
    if (kind === 'input') return /input/i.test(rate.label) && !/cach/i.test(rate.label)
    return /output/i.test(rate.label)
  })
}

export function perMillion(rate: Rate | undefined, region: string): number | undefined {
  const price = ratePrice(rate, region)
  if (price === undefined || !rate) return undefined
  if (rate.unit === '1M tokens') return price
  if (rate.unit === '1K tokens') return price * 1000
  return undefined
}

export interface Workload { requests: number; input: number; output: number; cache: number }
export interface Estimate { total: number; input: number; cached: number; output: number }

export function estimate(offering: Offering, region: string, workload: Workload): Estimate | undefined {
  if (offering.category !== 'text' && offering.category !== 'embeddings') return undefined
  if (Object.values(workload).some(v => !Number.isFinite(v) || v < 0) || workload.cache > 100) return undefined
  const inputPrice = perMillion(tokenRate(offering, 'input'), region)
  const outputPrice = perMillion(tokenRate(offering, 'output'), region)
  const cachedPrice = perMillion(tokenRate(offering, 'cached'), region)
  if (inputPrice === undefined || (workload.output > 0 && outputPrice === undefined && offering.category !== 'embeddings')
    || (workload.cache > 0 && cachedPrice === undefined)) return undefined
  const input = workload.requests * workload.input * (1 - workload.cache / 100) / 1e6 * inputPrice
  const cached = workload.requests * workload.input * workload.cache / 100 / 1e6 * (cachedPrice ?? 0)
  const output = offering.category === 'embeddings' ? 0 : workload.requests * workload.output / 1e6 * (outputPrice ?? 0)
  const total = input + cached + output
  if (!Number.isFinite(total)) return undefined
  return { input, cached, output, total }
}

export function featureLabels(spec: ModelSpec | undefined): string[] {
  if (!spec) return []
  const text = spec.description.toLowerCase()
  return [
    /reasoning/.test(text) ? 'Reasoning' : '',
    /image|vision/.test(text) ? 'Vision' : '',
    /function|tools/.test(text) ? 'Tool calling' : '',
    /structured/.test(text) ? 'Structured outputs' : '',
    /streaming/.test(text) ? 'Streaming' : '',
    /computer use/.test(text) ? 'Computer use' : '',
    /responses api/.test(text) ? 'Responses API' : '',
  ].filter(Boolean)
}

export const money = (value: number | undefined, digits = 2) => value === undefined ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(value)

export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function offeringsCsv(offerings: Offering[], region: string): string {
  const rows: unknown[][] = [['Model', 'Category', 'Mode', 'Deployment', 'Region', 'Component', 'USD', 'Unit', 'Details']]
  for (const offering of offerings) {
    for (const rate of offering.rates) {
      rows.push([offering.name, categories[offering.category], offering.mode, offering.deployment,
        region, rate.label, rate.prices[region], rate.unit, JSON.stringify(offering.dimensions)])
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function download(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
