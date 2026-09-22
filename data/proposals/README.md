# @tc39/data-proposals <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

TC39 proposal data.

The package exports a JSON-formatted description of all TC39 proposals, past and present, for programmatic consumption. The data can be consumed in a human-readable form at [tc39/proposals](https://github.com/tc39/proposals).

Delegate authors, champions, and reviewers are referenced by the abbreviations exported from [`@tc39/data-delegates`][delegates-package].

## Example

```js
import proposals from '@tc39/data-proposals' with { type: 'json' };

proposals.find(({ id }) => id === 'temporal');
```

```js
const proposals = require('@tc39/data-proposals');
```

The package is a JSON module, so ESM consumers must include the `with { type: 'json' }` import attribute.

## Types

TypeScript declarations are included. The exported value is a `Proposals` array, with supporting `Proposal`, `ProposalStage`, `Specification`, `Person`, `DelegateReference`, `CommunityMember`, `Presentation`, and `Test262Coverage` types.

```ts
import type { Proposal, Proposals } from '@tc39/data-proposals';
```

## Schema

[`schema.json`](./schema.json) is a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing `index.json`, and is importable as `@tc39/data-proposals/schema.json`. The data is validated against it, and the type declarations are generated from it.

[package-url]: https://npmjs.org/package/@tc39/data-proposals
[delegates-package]: https://npmjs.org/package/@tc39/data-delegates
[npm-version-svg]: https://versionbadg.es/tc39/data.svg
[npm-badge-png]: https://nodei.co/npm/@tc39/data-proposals.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/@tc39/data-proposals.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/@tc39/data-proposals.svg
[downloads-url]: https://npm-stat.com/charts.html?package=@tc39/data-proposals
[codecov-image]: https://codecov.io/gh/tc39/data/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/tc39/data/
[actions-image]: https://img.shields.io/github/check-runs/tc39/data/main
[actions-url]: https://github.com/tc39/data/actions
