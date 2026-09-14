# @tc39/data-process <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

TC39 process data, public source of truth.

The package exports an array of the stages of the TC39 process, in ascending order. Each stage has its `stage` number (as a string, e.g. `"2.7"`), a `status` describing what it means for a proposal to be at that stage, its `entranceCriteria`, and its `purpose`. The latter two are plain text that may contain a newline-separated Markdown bullet list.

## Example

```js
import stages from '@tc39/data-process' with { type: 'json' };

stages.map((stage) => stage.stage); // ['0', '1', '2', '2.7', '3', '4']
```

```js
const stages = require('@tc39/data-process');
```

The package is a JSON module, so ESM consumers must include the `with { type: 'json' }` import attribute. TypeScript does not report its absence, but node will throw at runtime without it.

## Types

TypeScript declarations are included: the exported value is a `Stages` tuple with one `Stage` per stage of the process, in ascending order, so `stages[3].stage` is known to be `"2.7"`.

```ts
import type { Stage, Stages } from '@tc39/data-process';
```

## Schema

[`schema.json`](./schema.json) is a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing `index.json`, and is importable as `@tc39/data-process/schema.json`. It is the source of truth for the shape of the data: the data is validated against it, and the type declarations are generated from it. It pins each stage to its position, so a missing, duplicated, extra, or out-of-order stage fails validation.

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
