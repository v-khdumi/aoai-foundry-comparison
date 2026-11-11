import { describe, expect, it } from 'vitest'
import type { Offering } from '../types.ts'
import { assertCatalog, csvCell, estimate, offeringsCsv, perMillion, tokenRate } from './catalog.ts'

const offering: Offering = {
  id: 'test', name: 'Test model', section: 'Test', family: 'Test', category: 'text',
  mode: 'Standard', deployment: 'Global', dimensions: {}, specIds: [],
  rates: [
    { label: 'Input', unit: '1M tokens', prices: { test: 2 } },
    { label: 'Cached Input', unit: '1M tokens', prices: { test: 0.5 } },
    { label: 'Output', unit: '1M tokens', prices: { test: 8 } },
  ],
}

describe('monthly workload costs', () => {
  it('uses uncached input, cached input and output exactly once', () => {
    const result = estimate(offering, 'test', { requests: 1000, input: 2000, output: 500, cache: 25 })
    expect(result).toEqual({ input: 3, cached: 0.25, output: 4, total: 7.25 })
  })

  it('normalizes 1K token prices without rounding', () => {
    expect(perMillion({ label: 'Input', unit: '1K tokens', prices: { test: 0.00015 } }, 'test')).toBeCloseTo(0.15)
  })

  it('does not interpret missing region prices as zero', () => {
    expect(estimate(offering, 'unknown', { requests: 1, input: 1000, output: 500, cache: 0 })).toBeUndefined()
  })

  it('does not substitute full input prices for an unpublished cache rate', () => {
    const noCache = { ...offering, rates: offering.rates.filter(r => r.label !== 'Cached Input') }
    expect(estimate(noCache, 'test', { requests: 1, input: 1000, output: 500, cache: 50 })).toBeUndefined()
    expect(estimate(noCache, 'test', { requests: 1, input: 1000, output: 500, cache: 0 })?.total).toBe(0.006)
  })

  it('distinguishes a real zero price from a missing rate', () => {
    const free = { ...offering, rates: offering.rates.map(r => ({ ...r, prices: { test: 0 } })) }
    expect(estimate(free, 'test', { requests: 1, input: 1000, output: 500, cache: 0 })?.total).toBe(0)
  })

  it('calculates embedding input only, using the published 1K unit', () => {
    const embedding: Offering = { ...offering, category: 'embeddings', rates: [{ label: 'Per 1,000 tokens', unit: '1K tokens', prices: { test: 0.00002 } }] }
    expect(estimate(embedding, 'test', { requests: 1000, input: 1000, output: 500, cache: 0 })?.total).toBe(0.02)
  })

  it('never applies text workload formulas to audio, PTU or fine-tuning', () => {
    for (const category of ['audio', 'image', 'video', 'ptu', 'fine-tuning', 'tools'] as const) {
      expect(estimate({ ...offering, category }, 'test', { requests: 1000, input: 1000, output: 500, cache: 0 })).toBeUndefined()
    }
  })

  it('rejects invalid quantities, percentages and overflow', () => {
    for (const cache of [-1, 101, Infinity, NaN]) {
      expect(estimate(offering, 'test', { requests: 1, input: 1, output: 1, cache })).toBeUndefined()
    }
    expect(estimate(offering, 'test', { requests: 1e308, input: 1e308, output: 1, cache: 0 })).toBeUndefined()
  })

  it('does not confuse audio, image or grader input with text input', () => {
    const rates = [{ label: 'Audio Input', unit: '1M tokens', prices: { test: 32 } }, ...offering.rates]
    expect(tokenRate({ ...offering, rates }, 'input')?.prices.test).toBe(2)
  })
})

describe('CSV and dataset validation', () => {
  it('escapes separators, quotes and spreadsheet formulas', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
  })
  it('exports every component with its exact unit and region', () => {
    const csv = offeringsCsv([offering], 'test')
    expect(csv.split('\r\n')).toHaveLength(4)
    expect(csv).toContain('"Cached Input","0.5","1M tokens"')
  })
  it('rejects missing data or timestamps rather than displaying a fake catalog', () => {
    expect(() => assertCatalog({})).toThrow()
    expect(() => assertCatalog({ schemaVersion: 1, offerings: [{}], specs: [], regions: [], retailMeters: [], updatedAt: 'invalid' })).toThrow()
  })
})
