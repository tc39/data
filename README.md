# data
TC39's source of truth for programmatically available delegate, process, and proposal data.

## Packages

 - [`@tc39/data-delegates`](./data/delegates): TC39 delegates, keyed by the abbreviation used in meeting notes
 - [`@tc39/data-process`](./data/process): the stages of the TC39 process
 - [`@tc39/data-proposals`](./data/proposals): TC39 proposals across supported specifications and process stages

Each package under `data/` publishes an `index.json` data file, a `schema.json` ([JSON Schema](https://json-schema.org/), draft 2020-12) describing it, and an `index.d.ts` generated from the schema.

## Development

Each package's `schema.json` is the source of truth for the shape of its data. `node generate-types.mjs` regenerates every package's `index.d.ts` from its schema; this also happens on install, before linting, and before packing, and the generated files are not committed. `npm test` validates each package's `index.json` against its schema, and tests the generator.
