# @tc39/data-process <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

TC39 process data, public source of truth.

The package exports an array containing the numbered stages of the TC39 process in ascending order, followed by its terminal stages. Each entry has a string `stage` identifier, flags indicating whether it is terminal and whether proposals remain on the path to inclusion, a `status` describing what it means for a proposal to be at that stage, its `entranceCriteria`, and its `purpose`. The latter two are plain text that may contain a newline-separated Markdown bullet list.

## Example

```js
import stages from '@tc39/data-process' with { type: 'json' };

stages.filter(({ isTerminal }) => isTerminal).map(({ stage }) => stage);
// ['4', 'abandoned', 'rejected', 'subsumed', 'withdrawn']
```

```js
const stages = require('@tc39/data-process');
```

The package is a JSON module, so ESM consumers must include the `with { type: 'json' }` import attribute. TypeScript does not report its absence, but node will throw at runtime without it.

## Types

TypeScript declarations are included: the exported value is a `Stages` array of `Stage` values.

```ts
import type { Stage, Stages } from '@tc39/data-process';
```

## Schema

[`schema.json`](./schema.json) is a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing `index.json`, and is importable as `@tc39/data-process/schema.json`. It is the source of truth for the shape of the data and its allowable stage identifiers: the data is validated against it, and the type declarations are generated from it.

[package-url]: https://npmjs.org/package/@tc39/data-process
[npm-version-svg]: https://versionbadg.es/tc39/data.svg
[npm-badge-png]: https://nodei.co/npm/@tc39/data-process.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/@tc39/data-process.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/@tc39/data-process.svg
[downloads-url]: https://npm-stat.com/charts.html?package=@tc39/data-process
[codecov-image]: https://codecov.io/gh/tc39/data/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/tc39/data/
[actions-image]: https://img.shields.io/github/check-runs/tc39/data/main
[actions-url]: https://github.com/tc39/data/actions
