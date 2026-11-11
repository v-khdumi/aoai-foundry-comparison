import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown, ArrowDownUp, ArrowRight, AudioLines, BookOpen, Boxes, Braces,
  Calculator, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Code2, Database, Download, ExternalLink, FileJson2, Filter,
  GitCompareArrows, GitFork, Globe2, Image, Info, Layers3, LayoutGrid,
  List, LoaderCircle, Search, Server, ShieldCheck, SlidersHorizontal,
  Sparkles, TextCursorInput, Video, X, Zap,
} from 'lucide-react'
import type { Catalog, Category, ModelSpec, Offering } from './types.ts'
import {
  assertCatalog, categories, download, estimate, featureLabels, money,
  offeringsCsv, perMillion, regionLabel, tokenRate,
} from './lib/catalog.ts'
import type { Workload } from './lib/catalog.ts'
import './App.css'

const REPO = 'https://github.com/v-khdumi/aoai-foundry-comparison'
const query = new URLSearchParams(location.search)
const categoryIcons = { text: Braces, image: Image, audio: AudioLines, video: Video, embeddings: Database, 'fine-tuning': SlidersHorizontal, ptu: Server, tools: Code2 }
const date = (value: string) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const displayName = (name: string) => name.replace(/[- ]?(Global|Data Zone|Regional)$/i, '').trim()
type Tab = 'catalog' | 'calculator' | 'retail' | 'guide'

function Badge({ children, color = '' }: { children: ReactNode; color?: string }) {
  return <span className={`badge ${color}`}>{children}</span>
}

function ModelAvatar({ offering }: { offering: Offering }) {
  const Icon = categoryIcons[offering.category]
  return <span className={`model-avatar avatar-${offering.category}`}><Icon size={20} /></span>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} aria-label={title} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={21} /></button></div>
    <div className="modal-body">{children}</div>
  </dialog>
}

function Price({ offering, kind, region }: { offering: Offering; kind: 'input' | 'cached' | 'output'; region: string }) {
  const value = perMillion(tokenRate(offering, kind), region)
  if (value !== undefined) return <div className={`price ${kind === 'cached' ? 'cached-price' : ''}`}>{money(value, 4)}<small>/ 1M tokens</small></div>
  if (kind === 'input') {
    const rate = offering.rates.find(r => r.prices[region] !== undefined)
    if (rate) return <div className="price">{money(rate.prices[region], 4)}<small>/ {rate.unit}</small><small>{rate.label}</small></div>
  }
  return <span className="unknown" title="Price not published or not applicable to this component">—</span>
}

function SpecDetails({ specs }: { specs: ModelSpec[] }) {
  if (!specs.length) return <div className="notice"><CircleHelp size={18} /><span>No verified specification match. Check Microsoft documentation; capabilities are never inferred from a model name.</span></div>
  return <div className="specs-list">{specs.map(spec => <section key={spec.id} className="spec-version">
    <h4>{spec.modelId} <span>{spec.version}</span></h4>
    <div className="spec-grid">
      {[['Context / request limit', spec.context], ['Maximum output', spec.maxOutput], ['Training data cutoff', spec.training], ['Embedding dimensions', spec.dimensions]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || 'Not published in this specification'}</strong></div>)}
    </div>
    <p className="spec-description">{spec.description || 'No description published in the specification table.'}</p>
    <a className="text-link" href={spec.sourceUrl} target="_blank" rel="noreferrer">Microsoft Learn specification <ExternalLink size={13} /></a>
  </section>)}</div>
}

function OfferingDetails({ offering, catalog, region }: { offering: Offering; catalog: Catalog; region: string }) {
  return <>
    <div className="detail-summary"><ModelAvatar offering={offering} /><div><h3>{offering.name}</h3><div className="badges"><Badge>{categories[offering.category]}</Badge><Badge color="blue">{offering.deployment}</Badge><Badge>{offering.mode}</Badge></div></div></div>
    <div className="section-heading"><h3>All pricing components</h3><span>{regionLabel(region)} · USD</span></div>
    <div className="table-scroll"><table className="detail-table"><thead><tr><th>Component</th><th>Price (USD)</th><th>Billing unit</th></tr></thead><tbody>
      {offering.rates.map((rate, index) => <tr key={index}><td>{rate.label}</td><td className="mono">{money(rate.prices[region], 6)}</td><td>{rate.unit}</td></tr>)}
    </tbody></table></div>
    {Object.entries(offering.dimensions).length > 0 && <div className="dimension-list">{Object.entries(offering.dimensions).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>}
    <p className="fineprint">Official list prices, excluding tax, negotiated discounts and additional charges. “—” means unpublished or not applicable, never free.</p>
    <a className="text-link" href={catalog.sources.pricing} target="_blank" rel="noreferrer">Verify on the Azure pricing page <ExternalLink size={14} /></a>
    <div className="section-heading"><h3>Specifications & versions</h3><BookOpen size={18} /></div>
    <div className="notice"><Info size={17} /><span>Limits vary by version, deployment type and context length. Specifications do not guarantee deployment availability in the selected region.</span></div>
    <SpecDetails specs={catalog.specs.filter(s => offering.specIds.includes(s.id))} />
  </>
}

function Comparison({ offerings, catalog, region, workload }: { offerings: Offering[]; catalog: Catalog; region: string; workload: Workload }) {
  const rows: { label: string; render: (o: Offering) => ReactNode }[] = [
    { label: 'Category', render: o => categories[o.category] },
    { label: 'Deployment / processing', render: o => `${o.deployment} / ${o.mode}` },
    { label: 'Input / 1M tokens', render: o => <Price offering={o} kind="input" region={region} /> },
    { label: 'Cached input / 1M tokens', render: o => <Price offering={o} kind="cached" region={region} /> },
    { label: 'Output / 1M tokens', render: o => <Price offering={o} kind="output" region={region} /> },
    { label: 'Estimated monthly cost', render: o => money(estimate(o, region, workload)?.total) },
    { label: 'Context limits (specification)', render: o => catalog.specs.find(s => o.specIds.includes(s.id))?.context || 'Not published' },
    { label: 'Maximum output (specification)', render: o => catalog.specs.find(s => o.specIds.includes(s.id))?.maxOutput || 'Not published' },
    { label: 'Documented capabilities', render: o => featureLabels(catalog.specs.find(s => o.specIds.includes(s.id))).join(' · ') || 'Check source' },
    { label: 'All regional rates', render: o => <div className="comparison-rates">{o.rates.map((r, i) => <div key={i}><span>{r.label}</span><strong>{money(r.prices[region], 4)} / {r.unit}</strong></div>)}</div> },
    { label: 'Variant details', render: o => Object.entries(o.dimensions).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—' },
    { label: 'Documented versions', render: o => catalog.specs.filter(s => o.specIds.includes(s.id)).map(s => `${s.modelId} ${s.version}`).join('; ') || 'Not matched' },
  ]
  return <>
    <p className="muted">Comparing prices for <strong>{regionLabel(region)}</strong>. Monthly costs use your simulator workload. Technical limits refer to the first matched specification; check all versions in model details.</p>
    <div className="table-scroll"><table className="comparison-table"><thead><tr><th>Comparison dimension</th>{offerings.map(o => <th key={o.id}><ModelAvatar offering={o} /><strong>{displayName(o.name)}</strong><small>{o.mode} · {o.deployment}</small></th>)}</tr></thead><tbody>
      {rows.map(row => <tr key={row.label}><th>{row.label}</th>{offerings.map(o => <td key={o.id}>{row.render(o)}</td>)}</tr>)}
    </tbody></table></div>
    <div className="notice"><Info size={18} /><span>Audio, images, video, fine-tuning and PTU use different billing components. Use the component calculator rather than the automatic text-token estimate.</span></div>
    <button className="button secondary" onClick={() => download(JSON.stringify({ region, workload, updatedAt: catalog.updatedAt, offerings, specs: catalog.specs.filter(s => offerings.some(o => o.specIds.includes(s.id))) }, null, 2), 'azure-openai-comparison.json', 'application/json')}><FileJson2 size={16} /> Export comparison as JSON</button>
  </>
}

function CalculatorPanel({ catalog, region, selected, workload, onWorkload, onDetails }: {
  catalog: Catalog; region: string; selected: string[]; workload: Workload
  onWorkload: (w: Workload) => void; onDetails: (o: Offering) => void
}) {
  const [componentId, setComponentId] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)
  const available = useMemo(() => catalog.offerings.filter(o => o.rates.some(r => r.prices[region] !== undefined)), [catalog, region])
  const component = available.find(o => o.id === componentId)
  const candidates = available.filter(o => selected.length ? selected.includes(o.id) : o.category === 'text' && o.mode === 'Standard' && o.deployment === 'Global')
  const estimates = candidates.map(o => ({ offering: o, value: estimate(o, region, workload) }))
    .sort((a, b) => (a.value?.total ?? Infinity) - (b.value?.total ?? Infinity))
  const maximum = Math.max(1, ...estimates.map(e => e.value?.total ?? 0))
  const quantity = (index: number) => quantities[`${componentId}-${index}`] ?? ''
  const componentInvalid = component?.rates.some((_, i) => quantity(i) !== '' && (!Number.isFinite(Number(quantity(i))) || Number(quantity(i)) < 0))
  const componentMissing = component?.rates.some((r, i) => Number(quantity(i)) > 0 && r.prices[region] === undefined)
  const componentUnsupported = component?.rates.some((r, i) => Number(quantity(i)) > 0 && r.unit.startsWith('unit'))
  const componentTotal = component?.rates.reduce((sum, r, i) => sum + Number(quantity(i) || 0) * (r.prices[region] ?? 0), 0)
  const hasWorkload = component?.rates.some((_, i) => Number(quantity(i)) > 0)
  return <div className="calculator-layout">
    <aside className="panel workload-panel">
      <div className="panel-title"><span className="soft-icon"><Calculator size={19} /></span><div><h3>Your workload</h3><p>One scenario. A fair comparison.</p></div></div>
      {([
        ['requests', 'Requests per month', 'number of API calls', 1000],
        ['input', 'Input tokens per request', 'include the prompt and conversation history', 100],
        ['output', 'Output tokens per request', 'include billable reasoning tokens', 100],
        ['cache', 'Cached input share', 'percentage of input tokens served from cache', 5],
      ] as const).map(([key, label, help, step]) => <label className="field" key={key}><span>{label}{key === 'cache' && <b>{workload.cache}%</b>}</span>
        <input aria-label={label} type={key === 'cache' ? 'range' : 'number'} min="0" max={key === 'cache' ? 100 : 1e12} step={step} value={workload[key]} onChange={event => onWorkload({ ...workload, [key]: Math.min(key === 'cache' ? 100 : 1e12, Math.max(0, Number(event.target.value))) })} />
        <small>{help}</small>
      </label>)}
      <div className="workload-total"><span>Monthly input volume</span><strong>{new Intl.NumberFormat('en-US', { notation: 'compact' }).format(workload.requests * workload.input)} <small>tokens</small></strong></div>
      <p className="fineprint">Cache hits are not guaranteed. Missing required prices make an estimate unavailable. Embeddings have no output-token charge.</p>
    </aside>
    <div className="calculator-results">
      <section className="panel">
        <div className="section-heading"><div><h3>Monthly cost comparison</h3><p>{selected.length ? `${selected.length} selected variants` : 'Text variants · Standard · Global'} · {regionLabel(region)}</p></div><Badge color="green">USD / month</Badge></div>
        <div className="chart-legend"><span><i className="legend-input" />Input</span><span><i className="legend-cache" />Cache</span><span><i className="legend-output" />Output</span></div>
        <div className="cost-chart">{estimates.slice(0, showAll ? undefined : 12).map(({ offering, value }, i) => <div className="chart-row" key={offering.id}>
          <div className="chart-label"><button onClick={() => onDetails(offering)}>{displayName(offering.name)}</button>{i === 0 && value && <Badge color="green">Lowest cost in this list</Badge>}</div>
          <div className="chart-track" title={value ? `Input ${money(value.input)}, cache ${money(value.cached)}, output ${money(value.output)}` : 'Not all required rates are published'}>
            {value && <div className="chart-bar" style={{ width: `${Math.max(0.5, value.total / maximum * 100)}%` }}>
              <i className="legend-input" style={{ flex: value.input }} /><i className="legend-cache" style={{ flex: value.cached }} /><i className="legend-output" style={{ flex: value.output }} />
            </div>}
          </div><strong>{money(value?.total)}</strong>
        </div>)}</div>
        {!estimates.length && <div className="empty"><CircleHelp /><p>No available variants. Choose another region or model selection.</p></div>}
        {estimates.length > 12 && <button className="text-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show first 12' : `Show all ${estimates.length} variants`}<ChevronDown size={15} /></button>}
        <div className="notice"><Info size={17} /><span>This ranks cost, not quality. Estimates exclude taxes, tools, networking, storage and negotiated discounts. Choose the correct short- or long-context pricing variant for your workload.</span></div>
      </section>
      <section className="panel">
        <div className="section-heading"><div><h3>Component calculator</h3><p>Images, audio, video, fine-tuning, PTU or any other published rate.</p></div><Layers3 size={20} /></div>
        <label className="field"><span>Pricing variant</span><select value={componentId} onChange={e => setComponentId(e.target.value)}><option value="">Choose a catalog variant</option>{available.map(o => <option key={o.id} value={o.id}>{o.name} · {o.mode} · {Object.values(o.dimensions).join(' / ')}</option>)}</select></label>
        {component && <>
          <div className="component-rates">{component.rates.map((rate, i) => <label className="component-row" key={i}><span><strong>{rate.label}</strong><small>{money(rate.prices[region], 6)} / {rate.unit}</small></span><input aria-label={`Quantity ${rate.label} ${i + 1}`} type="number" min="0" step="any" placeholder="0" value={quantity(i)} onChange={e => setQuantities({ ...quantities, [`${componentId}-${i}`]: e.target.value })} /><span className="unit">{rate.unit}</span></label>)}</div>
          <div className="component-total"><span>Cost for the entered quantities</span><strong>{componentInvalid || componentMissing || componentUnsupported || !Number.isFinite(componentTotal) ? 'Invalid inputs' : money(componentTotal)}</strong></div>
          {componentInvalid && <p className="error-text" role="alert">Quantities must be finite numbers greater than or equal to zero.</p>}
          {componentMissing && <p className="error-text" role="alert">A selected component has no published price in this region.</p>}
          {componentUnsupported && <p className="error-text" role="alert">A billing unit could not be verified. Check the official source; this component cannot be estimated.</p>}
          {!hasWorkload && <p className="fineprint">Enter at least one quantity to build a scenario.</p>}
          <p className="fineprint">Enter quantities in the displayed billing unit: 2 means 2 million tokens for “1M tokens”, or 200 images for “100 images”. For PTU, check minimum capacity in variant details and the contract duration. Free allowances are not automatically deducted.</p>
        </>}
      </section>
    </div>
  </div>
}

function RetailExplorer({ catalog }: { catalog: Catalog }) {
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('eastus2')
  const [type, setType] = useState('')
  const [count, setCount] = useState(50)
  const regions = useMemo(() => [...new Set(catalog.retailMeters.map(m => m.region))].sort(), [catalog])
  const meters = useMemo(() => catalog.retailMeters.filter(m => (!region || m.region === region) && (!type || m.type === type)
    && `${m.name} ${m.product} ${m.sku}`.toLowerCase().includes(search.toLowerCase())), [catalog, region, type, search])
  return <section className="panel retail-panel">
    <div className="section-heading"><div><h3>Azure Retail Prices · original data</h3><p>All Azure OpenAI meters with their original SKU, billing unit and region.</p></div><a className="text-link" href={catalog.sources.retail} target="_blank" rel="noreferrer">Microsoft API <ExternalLink size={14} /></a></div>
    <div className="notice"><Info size={18} /><span>A billing meter does not guarantee deployment availability. API SKU names can differ from commercial model names. These meters are not automatically mapped to the model catalog.</span></div>
    <div className="retail-filters">
      <div className="search-field"><Search size={17} /><input aria-label="Search Azure meters" placeholder="Search a model, SKU or meter…" value={search} onChange={e => { setSearch(e.target.value); setCount(50) }} /></div>
      <select aria-label="Retail API region" value={region} onChange={e => { setRegion(e.target.value); setCount(50) }}><option value="">All regions</option>{regions.map(r => <option key={r} value={r}>{r || '(global)'}</option>)}</select>
      <select aria-label="Price type" value={type} onChange={e => { setType(e.target.value); setCount(50) }}><option value="">All price types</option>{[...new Set(catalog.retailMeters.map(m => m.type))].map(t => <option key={t}>{t}</option>)}</select>
    </div>
    <p className="result-count">{meters.length.toLocaleString('en-US')} meters · USD · no unit conversions</p>
    <div className="table-scroll"><table className="retail-table"><thead><tr><th>Meter / product</th><th>SKU</th><th>Region</th><th>Price (USD)</th><th>Unit</th><th>Type / term</th><th>Tier minimum</th><th>Effective from</th></tr></thead><tbody>{meters.slice(0, count).map((m, i) => <tr key={`${m.id}-${i}`}><td><strong>{m.name}</strong><small>{m.product}</small><small className="mono">{m.id}</small></td><td>{m.sku}</td><td>{m.region || m.location}</td><td className="mono">{money(m.price, 6)}</td><td>{m.unit}</td><td>{m.type}{m.reservation && <small>{m.reservation}</small>}</td><td>{m.tier}</td><td>{m.effective.slice(0, 10)}</td></tr>)}</tbody></table></div>
    {!meters.length && <div className="empty"><Search /><h3>No matching meters</h3><p>Try a different SKU or region.</p></div>}
    {count < meters.length && <div className="load-more"><button className="button secondary" onClick={() => setCount(count + 100)}>Load 100 more <ChevronDown size={16} /></button></div>}
  </section>
}

function Guide({ catalog }: { catalog: Catalog }) {
  const guides = [
    { icon: Globe2, title: 'Where is data processed?', text: 'Global allows global processing. Data Zone restricts processing to the applicable geographic zone, such as the EU or US. Regional uses the deployment region. A billing region is not a data residency guarantee.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types' },
    { icon: Zap, title: 'Standard, Batch, Priority or Flex?', text: 'Standard is pay-as-you-go. Batch is asynchronous and can take up to 24 hours. Priority and Flex have their own latency and availability terms. Published prices are used directly; discounts are never assumed.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/batch' },
    { icon: Server, title: 'PTU & capacity reservations', text: 'PTU buys capacity, not individual tokens. Check minimum PTUs, hourly rates and monthly or annual reservations separately. Throughput depends on the model and workload; there is no universal PTU-to-token conversion.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/provisioned-throughput' },
    { icon: ShieldCheck, title: 'Availability, quotas & lifecycle', text: 'A published price does not guarantee access, quota or deployment availability. Check preview status, retirement dates, service-level agreements and request limits in Microsoft documentation and your own subscription.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/model-retirements' },
    { icon: TextCursorInput, title: 'Context, caching & reasoning', text: 'Context, maximum input and maximum output are not independent budgets you can freely add. Billable reasoning tokens count as output where applicable. Some models price short and long context differently. Cache hits depend on service conditions.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/prompt-caching' },
    { icon: SlidersHorizontal, title: 'Fine-tuning & additional costs', text: 'Training, hosting, inference and grading can be separate charges. Add each relevant component to the calculator. An inference estimate alone does not represent the total cost of a fine-tuned model.', href: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/fine-tuning-considerations' },
  ]
  return <div className="guide-layout">
    <section className="panel methodology"><Badge color="blue">EVIDENCE, NOT ASSUMPTIONS</Badge><h2>Make an informed comparison</h2><p>The right model for your use case is not always the cheapest. Compare the same region, modality and billing unit.</p>
      <div className="method-steps">
        <div><span>01</span><div><h4>Official prices, not invented estimates</h4><p>The catalog reads embedded USD prices from the Azure page, per region and component. Original retail meters are fetched separately from every page of the Retail Prices API.</p></div></div>
        <div><span>02</span><div><h4>Documentation-backed capabilities</h4><p>Context, output, training cutoff and features come from Microsoft Learn tables. A missing label means unverified, not unsupported. Specifications require an exact normalized model match, never a generic family fallback.</p></div></div>
        <div><span>03</span><div><h4>No fabricated quality or speed scores</h4><p>Quality, latency and throughput require benchmarks on your own data. No arbitrary scores are assigned. Check API compatibility and actual limits before migrating.</p></div></div>
        <div><span>04</span><div><h4>An automatically refreshed public snapshot</h4><p>GitHub Actions downloads official sources daily and redeploys the site. Failed updates leave the previous version online. The timestamp below makes data freshness visible.</p></div></div>
      </div>
      <div className="source-list"><h4>Sources & last refresh</h4><span>{date(catalog.updatedAt)} · USD</span>
        {Object.entries(catalog.sources).map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} />{label === 'pricing' ? 'Azure OpenAI pricing' : label === 'models' ? 'Microsoft Learn · models & capabilities' : 'Azure Retail Prices API'}</a>)}
      </div>
      {catalog.warnings.map(w => <div className="notice warning" key={w}><Info size={17} /><span>{w}</span></div>)}
    </section>
    <div className="guide-cards">{guides.map(g => <a className="panel guide-card" href={g.href} target="_blank" rel="noreferrer" key={g.title}><g.icon size={22} /><h3>{g.title}</h3><p>{g.text}</p><span>Microsoft documentation <ArrowUpRightIcon /></span></a>)}</div>
  </div>
}

function ArrowUpRightIcon() { return <ExternalLink size={13} /> }

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now] = useState(Date.now)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<Tab>('catalog')
  const [category, setCategory] = useState(query.get('category') ?? 'text')
  const [search, setSearch] = useState(query.get('q') ?? '')
  const [region, setRegion] = useState(query.get('region') ?? 'europe-west')
  const [deployment, setDeployment] = useState(query.get('deployment') ?? 'Global')
  const [mode, setMode] = useState(query.get('mode') ?? 'Standard')
  const [family, setFamily] = useState('')
  const [feature, setFeature] = useState('')
  const [sort, setSort] = useState('default')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [selected, setSelected] = useState<string[]>((query.get('compare') ?? '').split(',').filter(Boolean).slice(0, 4))
  const [detail, setDetail] = useState<Offering>()
  const [comparing, setComparing] = useState(false)
  const [limit, setLimit] = useState(30)
  const [toast, setToast] = useState('')
  const [workload, setWorkload] = useState<Workload>({ requests: 100000, input: 1000, output: 500, cache: 0 })

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}catalog.json${reload ? `?refresh=${Date.now()}` : ''}`, { signal: controller.signal, cache: 'no-cache' })
        if (!response.ok) throw new Error(`Could not load the catalog (HTTP ${response.status}).`)
        const data: unknown = await response.json()
        assertCatalog(data)
        if (!controller.signal.aborted) setCatalog(data)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'An unknown error occurred while loading the catalog.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries({ category, q: search, region, deployment, mode, compare: selected.join(',') })) params.set(key, value)
    history.replaceState(null, '', `${location.pathname}?${params}`)
  }, [category, search, region, deployment, mode, selected])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(timeout)
  }, [toast])

  const offerings = useMemo(() => {
    if (!catalog) return []
    let result = catalog.offerings.filter(o => (!category || o.category === category)
      && (!deployment || o.deployment === deployment) && (!mode || o.mode === mode)
      && (!family || o.family === family)
      && `${o.name} ${o.section} ${Object.values(o.dimensions).join(' ')}`.toLowerCase().includes(search.toLowerCase())
      && o.rates.some(r => r.prices[region] !== undefined)
      && (!feature || o.specIds.some(id => featureLabels(catalog.specs.find(s => s.id === id)).includes(feature))))
    if (sort === 'name') result = result.toSorted((a, b) => a.name.localeCompare(b.name))
    if (sort === 'input' || sort === 'output') result = result.toSorted((a, b) => (perMillion(tokenRate(a, sort), region) ?? Infinity) - (perMillion(tokenRate(b, sort), region) ?? Infinity))
    return result
  }, [catalog, category, deployment, mode, family, search, region, feature, sort])
  const selectedOfferings = catalog?.offerings.filter(o => selected.includes(o.id)) ?? []
  const spec = (o: Offering) => catalog?.specs.find(s => o.specIds.includes(s.id))
  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter(x => x !== id))
    else if (selected.length >= 4) setToast('Compare up to 4 variants. Remove one to add another.')
    else setSelected([...selected, id])
  }
  const reset = () => { setSearch(''); setCategory(''); setDeployment(''); setMode(''); setFamily(''); setFeature(''); setLimit(30) }
  const stale = catalog ? now - Date.parse(catalog.updatedAt) > 3 * 86400000 : false
  const tabHeading = {
    catalog: ['Explore the model catalog', 'Compare pricing variants and documented capabilities, side by side.'],
    calculator: ['Turn tokens into a budget', 'Simulate the same workload. Understand every cost component.'],
    retail: ['Look beyond the model name', 'Explore original Microsoft billing meters, SKUs and regional rates.'],
    guide: ['Make decisions with context', 'Official sources, methodology and what a price alone cannot tell you.'],
  }

  return <div className="app-shell">
    <header className="site-header"><div className="header-inner">
      <a className="brand" href={location.pathname} aria-label="Foundry Compare home"><span className="brand-symbol"><Boxes size={24} /></span><span>Foundry<span className="brand-divider">|</span><strong>Compare</strong></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>Model catalog</button>
        <button className={tab === 'calculator' ? 'active' : ''} onClick={() => setTab('calculator')}>Cost simulator</button>
        <button className={tab === 'retail' ? 'active' : ''} onClick={() => setTab('retail')}>Azure meters</button>
        <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>Resources</button>
      </nav>
      <a className="github-link" href={REPO} target="_blank" rel="noreferrer"><GitFork size={17} /><span>GitHub</span><ExternalLink size={12} /></a>
    </div></header>

    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> AZURE OPENAI · MODEL EXPLORER <Badge>Independent tool</Badge></div>
          <h1>Find the right model.<br /><span>Make every token count.</span></h1>
          <p>Official pricing. Documented capabilities. Clearer decisions.<br className="desktop-break" /> Explore Azure OpenAI models with the full picture in view.</p>
          <div className="hero-actions"><button className="button primary" onClick={() => { setTab('catalog'); document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore models <ArrowRight size={16} /></button><button className="hero-secondary" onClick={() => setTab('calculator')}><Calculator size={16} /> Estimate your costs</button></div>
        </div>
        <div className="hero-visual" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="visual-dot dot-one" /><div className="visual-dot dot-two" />
          <div className="visual-card visual-back"><div className="mini-model"><AudioLines size={17} /><span>Audio & speech</span><span className="tiny-pill">MULTIMODAL</span></div><div className="mock-line" /><div className="mock-line short" /></div>
          <div className="visual-card visual-front"><div className="visual-card-top"><span className="visual-icon"><Sparkles size={21} /></span><span className="visual-check"><Check size={14} /> Official data</span></div><strong>One model. Every perspective.</strong><div className="visual-metrics"><span><i className="blue-dot" />Pricing<span>USD / billing unit</span></span><span><i className="teal-dot" />Capabilities<span>Microsoft Learn</span></span></div><div className="visual-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="visual-foot"><GitCompareArrows size={14} /><span>Compare. Simulate. Decide.</span><ArrowRight size={14} /></div></div>
          <div className="visual-chip"><ShieldCheck size={16} /><span>No API keys. No sign-in required.</span></div>
        </div>
      </section>

      <section className="stats-row" aria-label="Catalog statistics">
        <div><span className="stat-icon"><Boxes size={20} /></span><div><strong>{catalog ? new Set(catalog.offerings.map(o => displayName(o.name))).size : '—'}</strong><span>model variants</span></div></div>
        <div><span className="stat-icon teal"><Globe2 size={20} /></span><div><strong>{catalog?.regions.length ?? '—'}</strong><span>pricing regions</span></div></div>
        <div><span className="stat-icon violet"><Layers3 size={20} /></span><div><strong>{Object.keys(categories).length}</strong><span>model categories</span></div></div>
        <div><span className="stat-icon amber"><Clock3 size={20} /></span><div><strong className="stat-update">{catalog ? new Date(catalog.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}{stale && <Badge color="orange">Outdated</Badge>}</strong><span>last data refresh</span></div></div>
      </section>

      <section id="workspace" className="workspace">
        <div className="workspace-heading"><div><div className="section-overline">WORKSPACE</div><h2>{tabHeading[tab][0]}</h2><p>{tabHeading[tab][1]}</p></div><div className="workspace-tools">
          {tab !== 'guide' && tab !== 'retail' && <label className="region-select"><Globe2 size={16} /><select aria-label="Pricing region" value={region} onChange={e => { setRegion(e.target.value); setLimit(30) }}>{(catalog?.regions ?? [region]).map(r => <option key={r} value={r}>{regionLabel(r)}</option>)}</select><ChevronDown size={14} /></label>}
          <span className="currency-badge">USD <span>excl. tax</span></span>
        </div></div>

        {error && <div className="error-banner" role="alert"><Info size={20} /><div><strong>Unable to load data</strong><p>{error} {catalog && 'The previous catalog remains visible.'}</p></div><button className="button secondary" onClick={() => setReload(reload + 1)}>Try again</button></div>}
        {loading && !catalog && <div className="loading-state"><LoaderCircle className="spin" size={30} /><h3>Getting the full picture…</h3><p>Loading the official catalog and pricing meters.</p></div>}
        {catalog && <>
          {stale && <div className="notice warning"><Clock3 size={18} /><span>This snapshot is over 3 days old. Last refreshed: {date(catalog.updatedAt)}. Check GitHub Actions before making budget decisions.</span></div>}
          {tab === 'catalog' && <>
            <div className="category-tabs" aria-label="Model categories"><button className={!category ? 'selected' : ''} onClick={() => { setCategory(''); setLimit(30) }}><Boxes size={16} />All models</button>{Object.entries(categories).map(([key, label]) => {
              const Icon = categoryIcons[key as Category]
              return <button key={key} className={category === key ? 'selected' : ''} onClick={() => { setCategory(key); setLimit(30); setMode(''); setDeployment(''); setFamily(''); setFeature('') }}><Icon size={16} />{label}</button>
            })}</div>
            <div className="filter-panel">
              <div className="search-field"><Search size={18} /><input aria-label="Search models" placeholder="Search a model or version…" value={search} onChange={e => { setSearch(e.target.value); setLimit(30) }} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</div>
              <label className="filter-select"><span>Deployment</span><select aria-label="Deployment" value={deployment} onChange={e => { setDeployment(e.target.value); setLimit(30) }}><option value="">All deployments</option><option>Global</option><option>Data Zone</option><option>Regional</option></select></label>
              <label className="filter-select"><span>Processing</span><select aria-label="Processing" value={mode} onChange={e => { setMode(e.target.value); setLimit(30) }}><option value="">All modes</option>{['Standard', 'Batch', 'Priority', 'Flex', 'Reservation'].map(m => <option key={m}>{m}</option>)}</select></label>
              <label className="filter-select"><span>Family</span><select aria-label="Model family" value={family} onChange={e => { setFamily(e.target.value); setLimit(30) }}><option value="">All families</option>{[...new Set(catalog.offerings.map(o => o.family))].sort().map(f => <option key={f}>{f}</option>)}</select></label>
              <label className="filter-select"><span>Capabilities</span><select aria-label="Capabilities" value={feature} onChange={e => { setFeature(e.target.value); setLimit(30) }}><option value="">All capabilities</option>{['Reasoning', 'Vision', 'Tool calling', 'Structured outputs', 'Streaming', 'Computer use', 'Responses API'].map(f => <option key={f}>{f}</option>)}</select></label>
              <button className="reset-button" onClick={reset} title="Reset all filters"><Filter size={15} />Reset</button>
            </div>
            <div className="results-toolbar"><div><strong>{offerings.length}</strong><span> pricing variants</span><span className="toolbar-divider" /><span className="subtle-text">Select up to 4 to compare</span></div><div>
              <button className="export-button" onClick={() => download(offeringsCsv(offerings, region), 'azure-openai-pricing.csv')}><Download size={15} /><span>Export CSV</span></button>
              <label className="sort-control"><ArrowDownUp size={14} /><select aria-label="Sort models" value={sort} onChange={e => setSort(e.target.value)}><option value="default">Microsoft order</option><option value="name">Name A–Z</option><option value="input">Input price: low to high</option><option value="output">Output price: low to high</option></select></label>
              <div className="view-switch"><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} aria-label="Table view" aria-pressed={view === 'table'}><List size={17} /></button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Card view" aria-pressed={view === 'grid'}><LayoutGrid size={16} /></button></div></div>
            </div>
            {view === 'table' ? <div className="models-table-wrapper"><table className="models-table"><thead><tr><th className="select-col"><GitCompareArrows size={15} /></th><th>MODEL <ArrowDown size={12} /></th><th>INPUT / RATE</th><th>CACHED INPUT</th><th>OUTPUT</th><th>CONTEXT / LIMIT</th><th>CAPABILITIES</th><th /></tr></thead><tbody>
              {offerings.slice(0, limit).map(o => <tr key={o.id} className={selected.includes(o.id) ? 'row-selected' : ''}>
                <td><input type="checkbox" aria-label={`Compare ${o.name} ${o.mode} ${o.id}`} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} /></td>
                <td><div className="model-cell"><ModelAvatar offering={o} /><div><button className="model-name" onClick={() => setDetail(o)}>{displayName(o.name)}</button><div className="model-meta"><span>{o.deployment}</span><i />{o.mode}{/preview/i.test(o.name) && <Badge color="orange">Preview</Badge>}</div></div></div></td>
                <td><Price offering={o} kind="input" region={region} /></td><td><Price offering={o} kind="cached" region={region} /></td><td><Price offering={o} kind="output" region={region} /></td>
                <td><span className="context-value" title={spec(o)?.context}>{spec(o)?.context || '—'}</span>{o.specIds.length > 1 && <small className="subtle-text">check version</small>}</td>
                <td><div className="feature-tags">{featureLabels(spec(o)).slice(0, 2).map(f => <Badge key={f}>{f}</Badge>)}{featureLabels(spec(o)).length > 2 && <span className="feature-more" title={featureLabels(spec(o)).join(' · ')}>+{featureLabels(spec(o)).length - 2}</span>}{!featureLabels(spec(o)).length && <span className="unknown">View details</span>}</div></td>
                <td><button className="icon-button detail-arrow" aria-label={`Details ${o.name}`} onClick={() => setDetail(o)}><ChevronRight size={18} /></button></td>
              </tr>)}
            </tbody></table></div> : <div className="model-grid">{offerings.slice(0, limit).map(o => <article key={o.id} className={`model-card ${selected.includes(o.id) ? 'selected-card' : ''}`}>
              <div className="model-card-head"><ModelAvatar offering={o} /><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Compare ${o.name} ${o.mode} ${o.id}`} /></div>
              <button className="model-name" onClick={() => setDetail(o)}>{displayName(o.name)}</button><div className="model-meta">{o.deployment} <i />{o.mode}</div>
              <div className="card-prices"><div><span>Input / rate</span><Price offering={o} kind="input" region={region} /></div><div><span>Output</span><Price offering={o} kind="output" region={region} /></div></div>
              <div className="feature-tags">{featureLabels(spec(o)).slice(0, 3).map(f => <Badge key={f}>{f}</Badge>)}</div>
              <button className="card-details" onClick={() => setDetail(o)}>Specifications & all rates <ArrowRight size={15} /></button>
            </article>)}</div>}
            {!offerings.length && <div className="empty"><Search size={28} /><h3>No variants match your filters</h3><p>Try a different region, category or processing mode.</p><button className="button secondary" onClick={reset}>Reset filters</button></div>}
            {limit < offerings.length && <div className="load-more"><button className="button secondary" onClick={() => setLimit(limit + 30)}>Load more models <ChevronDown size={15} /></button><span>{Math.min(limit, offerings.length)} of {offerings.length} variants</span></div>}
            <div className="catalog-note"><Info size={15} /><span>Prices are per displayed unit, excluding tax. “—” = unpublished / not applicable. A price does not guarantee deployment availability.</span><button onClick={() => setTab('guide')}>Methodology <ArrowRight size={13} /></button></div>
            <div className="bottom-cta"><div className="soft-icon"><Calculator size={23} /></div><div><h3>Your workload. Your model. A clearer budget.</h3><p>Add your token volume and see estimated costs for your scenario.</p></div><button className="button secondary" onClick={() => setTab('calculator')}>Open cost simulator <ArrowRight size={15} /></button></div>
          </>}
          {tab === 'calculator' && <CalculatorPanel catalog={catalog} region={region} selected={selected} workload={workload} onWorkload={setWorkload} onDetails={setDetail} />}
          {tab === 'retail' && <RetailExplorer catalog={catalog} />}
          {tab === 'guide' && <Guide catalog={catalog} />}
        </>}
      </section>
    </main>
    <footer><div><a className="footer-brand" href={REPO} target="_blank" rel="noreferrer"><Boxes size={17} />Foundry Compare</a><span>An independent tool. Not affiliated with Microsoft.</span></div><div><span className="live-dot" />{catalog ? `Data refreshed: ${date(catalog.updatedAt)}` : 'Official Microsoft sources'}<a href={REPO} target="_blank" rel="noreferrer">Source code <ExternalLink size={12} /></a></div></footer>
    {selectedOfferings.length > 0 && <div className="compare-tray"><div className="tray-count"><GitCompareArrows size={20} /><strong>{selectedOfferings.length}<span> / 4</span></strong></div><div className="tray-models">{selectedOfferings.map(o => <span key={o.id}>{displayName(o.name)}<small>{o.mode}</small><button onClick={() => toggle(o.id)} aria-label={`Remove ${o.name}`}><X size={13} /></button></span>)}</div><button className="clear-selection" onClick={() => setSelected([])}>Clear</button><button className="button primary" disabled={selectedOfferings.length < 2} onClick={() => setComparing(true)}>Compare models <ArrowRight size={16} /></button></div>}
    {detail && catalog && <Modal title="Model details" onClose={() => setDetail(undefined)}><OfferingDetails offering={detail} catalog={catalog} region={region} /></Modal>}
    {comparing && catalog && <Modal title="Side-by-side comparison" onClose={() => setComparing(false)} wide><Comparison offerings={selectedOfferings} catalog={catalog} region={region} workload={workload} /></Modal>}
    {toast && <div className="toast" role="status"><CheckCheck size={18} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}
