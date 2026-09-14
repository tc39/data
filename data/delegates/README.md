# @tc39/data-delegates <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

TC39 delegates data, public source of truth.

The package exports an object keyed by each delegate's two- or three-letter uppercase abbreviation, as used to identify them in meeting notes. Each entry has the delegate's `name`, and may have their `github` username and their `affiliation` (an employer, or a status such as "Invited Expert").

## Example

```js
import delegates from '@tc39/data-delegates' with { type: 'json' };

delegates.AWB; // { name: 'Allen Wirfs-Brock', github: 'allenwb', affiliation: 'Ecma Fellow' }
```

```js
const delegates = require('@tc39/data-delegates');
```

The package is a JSON module, so ESM consumers must include the `with { type: 'json' }` import attribute. TypeScript does not report its absence, but node will throw at runtime without it.

## Types

TypeScript declarations are included: the exported value is a `Delegates` object, and each entry is a `Delegate`.

```ts
import type { Delegate, Delegates } from '@tc39/data-delegates';
```

## Schema

[`schema.json`](./schema.json) is a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing `index.json`, and is importable as `@tc39/data-delegates/schema.json`. It is the source of truth for the shape of the data: the data is validated against it, and the type declarations are generated from it.

[package-url]: https://npmjs.org/package/@tc39/data-delegates
[npm-version-svg]: https://versionbadg.es/tc39/data.svg
[npm-badge-png]: https://nodei.co/npm/@tc39/data-delegates.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/@tc39/data-delegates.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/@tc39/data-delegates.svg
[downloads-url]: https://npm-stat.com/charts.html?package=@tc39/data-delegates
[codecov-image]: https://codecov.io/gh/tc39/data/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/tc39/data/
[actions-image]: https://img.shields.io/github/check-runs/tc39/data/main
[actions-url]: https://github.com/tc39/data/actions
