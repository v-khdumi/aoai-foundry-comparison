# Foundry Compare

An independent Azure OpenAI model comparison tool with an English,
Microsoft Fluent-inspired interface: Segoe UI system typography, neutral
surfaces, Azure blue accents and responsive layouts.

**Website:** https://v-khdumi.github.io/aoai-foundry-comparison/

Built with React, TypeScript and Vite. Fully static: no backend, sign-in or
Azure subscription keys. Not affiliated with Microsoft.

## Features

- Text/reasoning, images, audio, video, embeddings, fine-tuning, tools and PTU.
- Search and filter by pricing region, family, deployment, processing mode and
  documented capabilities. Table and card views.
- Compare up to four variants side by side. Share the URL to preserve the
  selection and primary filters, including explicitly cleared filters.
- Standard, Batch, Priority, Flex and reservation prices where published.
  Every pricing component retains its original billing unit.
- Microsoft Learn specifications with model versions, context/output limits,
  training cutoff, embedding dimensions and documented features.
- Monthly text-token cost simulator with cache share and a generic component
  calculator for images, audio, video, training/hosting and PTU.
- Original Azure Retail Prices meters, including SKU, product, region, unit,
  price type, reservation term, tier minimum and effective date.
- CSV pricing export and JSON comparison export.
- Keyboard-accessible controls and native modal dialogs.

## Local development

Requires Node.js 24 and npm.

```shell
npm ci
npm run dev
```

The committed `public/catalog.json` snapshot allows local development without
contacting Microsoft. Refresh and validate it with:

```shell
npm run data:refresh
npm test
npm run lint
npm run build
npm run preview
```

Refresh downloads every API page and atomically replaces the catalog only after
all sources pass parsing. HTTP, schema or pagination errors stop the refresh
instead of publishing fake zero prices or incomplete data.

## GitHub Pages deployment

1. In **Settings > Pages > Build and deployment > Source**, select
   **GitHub Actions**.
2. Push to `main`, or manually run **Refresh data and deploy GitHub Pages**
   from the repository's **Actions** tab.
3. The workflow refreshes official data, runs tests/lint/build and publishes
   the `dist` artifact. No secrets or Azure keys are required.

The deployment workflow also runs daily at 05:17 UTC. GitHub schedules can be
delayed or disabled after prolonged inactivity. The interface displays the
snapshot timestamp and warns when it is more than three days old.

Scheduled updates publish data in the Pages artifact, without automatically
committing it to the repository. Failed refreshes or checks leave the last
successful deployment online; inspect Actions for errors.

Pull requests run **Validate changes** using the committed snapshot.
Vite's relative `base: './'` supports project-site subdirectories. No server
route rewrites are required.

## Sources and interpretation

1. [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/):
   embedded USD regional prices in official pricing tables.
2. [Microsoft Learn model specifications](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure?pivots=azure-openai):
   Azure OpenAI model/version tables and documented capabilities.
3. [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices):
   every page for products containing `OpenAI`, in USD. Future-effective meters
   are excluded; original units, tiers and reservation terms are preserved.

The pricing catalog and Retail explorer are separate views. Sources can update
at different times. SKU names are not speculatively matched to commercial model
names. Pricing-page region identifiers and Retail API ARM region identifiers
remain separate.

Specification matching requires the same normalized model identifier after
removing dates, deployment labels and context qualifiers. It never falls back
to a generic family for an undocumented variant. Missing feature labels mean
unverified, not unsupported. Multiple versions and conditional limits remain
visible in model details.

A price does not guarantee deployment availability, quota, access, capacity or
fine-tuning support. Confirm preview/retirement status, SLA, residency, effective
limits and performance in Microsoft documentation and your own subscription.
No quality, latency or throughput scores are invented.

The simulator does not assume Batch discounts, free cache or PTU/token
conversions. A missing required rate makes the estimate unavailable, not zero.
Component quantities use the displayed billing unit; free allowances are not
automatically deducted. Prices exclude tax, negotiated discounts, currency
conversion and auxiliary services.

System fonts require no third-party font requests. Browsing and calculations
run locally; prompts and workload values are not sent to Azure.
