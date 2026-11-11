export type Category = 'text' | 'image' | 'audio' | 'video' | 'embeddings' | 'fine-tuning' | 'ptu' | 'tools'
export type Mode = 'Standard' | 'Batch' | 'Priority' | 'Flex' | 'Reservation'
export type Deployment = 'Global' | 'Data Zone' | 'Regional'

export interface Rate {
  label: string
  unit: string
  prices: Record<string, number>
}

export interface ModelSpec {
  id: string
  modelId: string
  version: string
  description: string
  context: string
  maxOutput: string
  training: string
  dimensions: string
  section: string
  sourceUrl: string
}

export interface Offering {
  id: string
  name: string
  family: string
  section: string
  category: Category
  mode: Mode
  deployment: Deployment
  dimensions: Record<string, string>
  rates: Rate[]
  specIds: string[]
}

export interface RetailMeter {
  id: string
  name: string
  product: string
  sku: string
  region: string
  location: string
  price: number
  unit: string
  type: string
  effective: string
  reservation?: string
  tier: number
}

export interface Catalog {
  schemaVersion: 1
  updatedAt: string
  currency: 'USD'
  sources: { pricing: string; models: string; retail: string }
  offerings: Offering[]
  specs: ModelSpec[]
  regions: string[]
  retailMeters: RetailMeter[]
  warnings: string[]
}
