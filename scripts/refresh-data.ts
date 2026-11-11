import { mkdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parsePricing, parseSpecs } from './parsers.ts'
import type { Catalog, RetailMeter } from '../src/types.ts'

const sources = {
  pricing: 'https://azure.microsoft.com/en-us/pricing/details/azure-openai/',
  models: 'https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure?pivots=azure-openai',
  retail: "https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode='USD'&$filter=contains(productName,'OpenAI')",
}

async function fetchChecked(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
    if (response.ok) return response
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      console.warn(`Retrying HTTP ${response.status}: ${url}`)
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
      continue
    }
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  throw new Error(`Could not fetch ${url}`)
}

interface ApiMeter {
  meterId: string; meterName: string; productName: string; skuName: string
  armRegionName: string; location: string; retailPrice: number; unitOfMeasure: string
  type: string; effectiveStartDate: string; reservationTerm?: string
  tierMinimumUnits: number; currencyCode: string
}

async function fetchRetail(): Promise<RetailMeter[]> {
  let url: string | null = sources.retail
  const meters: RetailMeter[] = []
  const seen = new Set<string>()
  const now = new Date().toISOString()
  let pages = 0
  while (url) {
    if (seen.has(url) || ++pages > 300) throw new Error('Invalid retail pagination')
    const parsedUrl = new URL(url)
    if (parsedUrl.hostname !== 'prices.azure.com' || parsedUrl.protocol !== 'https:') throw new Error('Untrusted retail pagination URL')
    seen.add(url)
    const data = await (await fetchChecked(url)).json() as { Items: ApiMeter[]; NextPageLink: string | null }
    if (!Array.isArray(data.Items)) throw new Error('Invalid Azure Retail Prices response')
    for (const item of data.Items) {
      if (item.currencyCode !== 'USD' || !Number.isFinite(item.retailPrice) || item.retailPrice < 0) throw new Error('Invalid retail price/currency')
      if (item.effectiveStartDate > now) continue
      meters.push({
        id: item.meterId, name: item.meterName, product: item.productName, sku: item.skuName,
        region: item.armRegionName, location: item.location, price: item.retailPrice,
        unit: item.unitOfMeasure, type: item.type, effective: item.effectiveStartDate,
        ...(item.reservationTerm ? { reservation: item.reservationTerm } : {}),
        tier: item.tierMinimumUnits,
      })
    }
    console.log(`Retail page ${pages}: ${meters.length} meters`)
    url = data.NextPageLink
  }
  if (!meters.length) throw new Error('Azure Retail Prices returned no OpenAI meters')
  return meters
}

async function main() {
  const [pricingHtml, modelsHtml, retailMeters] = await Promise.all([
    fetchChecked(sources.pricing).then(r => r.text()),
    fetchChecked(sources.models).then(r => r.text()),
    fetchRetail(),
  ])
  const specs = parseSpecs(modelsHtml, sources.models)
  const offerings = parsePricing(pricingHtml, specs)
  const regions = [...new Set(offerings.flatMap(o => o.rates.flatMap(r => Object.keys(r.prices))))].sort()
  const unknownUnits = offerings.filter(o => o.rates.some(r => r.unit.startsWith('unit')))
  const warnings = unknownUnits.length
    ? [`${unknownUnits.length} variants have an unverified billing unit. Check the Microsoft source; automatic cost estimates are unavailable for these variants.`]
    : []
  const catalog: Catalog = {
    schemaVersion: 1, updatedAt: new Date().toISOString(), currency: 'USD',
    sources, offerings, specs, regions, retailMeters, warnings,
  }
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  const output = fileURLToPath(new URL('../public/catalog.json', import.meta.url))
  await mkdir(publicDir, { recursive: true })
  await writeFile(`${output}.tmp`, JSON.stringify(catalog))
  await rename(`${output}.tmp`, output)
  console.log(`Saved ${offerings.length} pricing variants, ${specs.length} specs, ${regions.length} regions, ${retailMeters.length} retail meters.`)
}

await main()
