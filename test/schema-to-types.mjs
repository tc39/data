import test from 'tape';

import { compile } from '../schema-to-types.mjs';

const HEADER = '// Generated from schema.json by `node generate-types.mjs` at the repository root; do not edit.';

/** @type {(schema: Record<string, unknown>) => string} */
function types(schema) {
	return compile({ title: 'Root', ...schema }, 'schema.json');
}

/** @type {(lines: string[]) => string} */
function namespaced(lines) {
	return [
		HEADER,
		['declare namespace data {', ...lines.map((line) => (line === '' ? '' : `\t${line}`)), '}'].join('\n'),
		'declare const data: data.Root;',
		'export = data;\n',
	].join('\n\n');
}

test('compile: full output for an object root with a $defs reference', (t) => {
	const output = compile({
		title: 'Things',
		description: 'All the things.',
		type: 'object',
		additionalProperties: { $ref: '#/$defs/Thing' },
		$defs: {
			Thing: {
				title: 'Thing',
				description: 'A thing.',
				type: 'object',
				properties: {
					name: { type: 'string' },
					count: { description: 'How many.', type: 'integer' },
				},
				required: ['name'],
				additionalProperties: false,
			},
		},
	}, 'schema.json');

	t.equal(output, [
		HEADER,
		[
			'declare namespace data {',
			'\t/** A thing. */',
			'\tinterface Thing {',
			'\t\tname: string;',
			'\t\t/** How many. */',
			'\t\tcount?: number;',
			'\t}',
			'',
			'\t/** All the things. */',
			'\tinterface Things {',
			'\t\t[key: string]: Thing;',
			'\t}',
			'}',
		].join('\n'),
		'/** All the things. */\ndeclare const data: data.Things;',
		'export = data;\n',
	].join('\n\n'));
	t.end();
});

test('compile: array root with minItems becomes a non-empty tuple', (t) => {
	t.equal(
		types({ type: 'array', items: { $ref: '#/$defs/Item' }, minItems: 1, $defs: { Item: { type: 'string' } } }),
		namespaced(['type Item = string;', '', 'type Root = [Item, ...Item[]];']),
	);
	t.end();
});

test('compile: root title', (t) => {
	t.throws(() => compile({ type: 'object' }, 'schema.json'), /must have a `title`/, 'a missing title throws');
	t.throws(() => compile({ title: '123', type: 'object' }, 'schema.json'), /cannot be turned into a TypeScript identifier/, 'a non-identifier title throws');
	t.ok(types({ title: 'some fancy thing!', type: 'string' }).includes('type SomeFancyThing = string;'), 'the title is PascalCased');
	t.end();
});

test('compile: $defs and definitions', (t) => {
	const output = types({
		type: 'object',
		properties: { a: { $ref: '#/definitions/Old' }, b: { $ref: '#/$defs/new%20key' }, c: { $ref: '#/$defs/with~1slash' } },
		additionalProperties: false,
		definitions: { Old: { type: 'number' } },
		$defs: { 'new key': { title: 'Renamed', type: 'boolean' }, 'with/slash': { type: 'null' } },
	});
	t.ok(output.includes('\ttype Old = number;'), 'draft-07 definitions are emitted');
	t.ok(output.includes('\ttype Renamed = boolean;'), 'a def title overrides its key');
	t.ok(output.includes('\ttype WithSlash = null;'), 'a def key is PascalCased when it has no title');
	t.ok(output.includes('\t\ta?: Old;') && output.includes('\t\tb?: Renamed;') && output.includes('\t\tc?: WithSlash;'), 'refs resolve through percent-encoding and JSON pointer escapes');

	t.throws(() => types({ $defs: { A: { title: 'Same' }, B: { title: 'Same' } } }), /duplicate type name `Same`/);
	t.throws(() => types({ $ref: '#/$defs/Missing' }), /unsupported \$ref `#\/\$defs\/Missing`/);
	t.throws(() => types({ $ref: 'https://example.com/schema.json' }), /unsupported \$ref/);
	t.throws(() => types({ $ref: '#/$defs/bad%' }), /unsupported \$ref `#\/\$defs\/bad%`/, 'a malformed percent-encoding is reported as an unsupported ref');
	t.end();
});

test('compile: self reference', (t) => {
	t.equal(
		types({ anyOf: [{ type: 'string' }, { type: 'array', items: { $ref: '#' } }] }),
		namespaced(['type Root = string | Root[];']),
	);
	t.end();
});

test('compile: literals', (t) => {
	t.ok(types({ const: 'it\'s \\ "quoted"\nnext' }).includes('type Root = \'it\\\'s \\\\ "quoted"\\nnext\';'), 'string literals are escaped');
	t.ok(types({ enum: ['a', 1, true, null] }).includes('type Root = \'a\' | 1 | true | null;'), 'enums become a union of literals');
	t.ok(types({ enum: ['a', 'a'] }).includes('type Root = \'a\';'), 'duplicate members are removed');
	t.ok(types({ enum: [] }).includes('type Root = never;'), 'an empty enum is never');
	t.ok(types({ type: 'string', enum: ['x'] }).includes('type Root = \'x\';'), 'enum wins over type');
	t.throws(() => types({ const: { a: 1 } }), /only string, number, boolean, and null literals/);
	t.end();
});

test('compile: combinators and type arrays', (t) => {
	t.ok(types({ anyOf: [{ type: 'string' }, { type: 'null' }] }).includes('type Root = string | null;'), 'anyOf');
	t.ok(types({ oneOf: [{ type: 'string' }, { type: 'number' }] }).includes('type Root = string | number;'), 'oneOf');
	t.ok(types({ allOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { $ref: '#/$defs/B' }], $defs: { B: { type: 'object', properties: { b: { type: 'string' } } } } }).includes('} & B;'), 'allOf');
	t.ok(types({ type: ['string', 'null'] }).includes('type Root = string | null;'), 'a type array is a union');
	t.ok(types({ type: 'integer' }).includes('type Root = number;'), 'integer is number');
	t.ok(types({ anyOf: [{ type: 'string' }, { type: 'number' }], allOf: [{ type: 'string' }] }).includes('type Root = (string | number) & string;'), 'a union inside an intersection is parenthesized');
	t.ok(types({ type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } }).includes('type Root = (string | number)[];'), 'a union element type is parenthesized');
	t.ok(types({ type: 'array', items: { allOf: [{ $ref: '#/$defs/A' }, { $ref: '#/$defs/B' }] }, $defs: { A: { type: 'string' }, B: { type: 'string' } } }).includes('type Root = (A & B)[];'), 'an intersection element type is parenthesized');
	t.ok(types({}).includes('type Root = unknown;'), 'an empty schema is unknown');
	t.ok(types({ anyOf: [{ type: 'string' }, {}] }).includes('type Root = unknown;'), 'a union with unknown collapses');
	t.ok(types({ allOf: [{}, {}] }).includes('type Root = unknown;'), 'an intersection of unknowns is unknown');
	t.ok(types({ $ref: '#/$defs/S', enum: ['only'], $defs: { S: { type: 'string' } } }).includes('type Root = S & \'only\';'), 'keywords beside $ref are intersected');
	t.throws(() => types({ type: 'date' }), /unsupported type `date`/);
	t.end();
});

test('compile: objects', (t) => {
	const output = types({
		type: 'object',
		properties: {
			plain: { type: 'string' },
			'needs-quotes': { type: 'number', readOnly: true },
			doc: { description: 'first\nsecond', deprecated: true, type: 'boolean' },
			gone: { deprecated: true, type: 'null' },
			nested: { type: 'object', properties: { deep: { type: 'string' } }, required: ['deep'], additionalProperties: false },
		},
		required: ['plain'],
		additionalProperties: false,
	});
	t.ok(output.includes([
		'\tinterface Root {',
		'\t\tplain: string;',
		'\t\treadonly \'needs-quotes\'?: number;',
		'\t\t/**',
		'\t\t * first',
		'\t\t * second',
		'\t\t * @deprecated',
		'\t\t */',
		'\t\tdoc?: boolean;',
		'\t\t/** @deprecated */',
		'\t\tgone?: null;',
		'\t\tnested?: { deep: string };',
		'\t}',
	].join('\n')), 'properties, modifiers, docs, and nested objects');

	t.ok(types({ type: 'object', properties: { a: true, b: false } }).includes('\t\ta?: unknown;\n\t\tb?: never;'), 'boolean property schemas');
	t.ok(types({ type: 'object' }).includes('[key: string]: unknown;'), 'additionalProperties defaults to unknown');
	t.ok(types({ type: 'object', additionalProperties: true }).includes('[key: string]: unknown;'), 'additionalProperties: true is unknown');
	t.ok(types({ properties: { a: { type: 'string' } } }).includes('\tinterface Root {\n\t\ta?: string;\n\t}'), 'an object is implied by properties');
	t.notOk(types({ properties: { a: { type: 'string' } } }).includes('[key: string]'), 'named properties with no additionalProperties get no index signature');
	t.notOk(types({ type: 'object', properties: { a: { type: 'string' } }, patternProperties: {} }).includes('[key: string]'), 'empty patternProperties adds no index signature');
	t.ok(types({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true }).includes('\t\t[key: string]: string | undefined | unknown;') === false, 'unknown absorbs the index signature union');
	t.ok(types({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: { type: 'number' } }).includes('\t\t[key: string]: string | number;'), 'named property types join the index signature');
	t.ok(types({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: { type: 'number' } }).includes('\t\t[key: string]: string | undefined | number;'), 'optional property types include undefined in the index signature');
	t.ok(types({ type: 'object', patternProperties: { '^x': { type: 'string' }, '^y': { type: 'number' } }, additionalProperties: false }).includes('\t\t[key: string]: string | number;'), 'patternProperties');
	t.ok(types({ type: 'object', additionalProperties: false }).includes('type Root = { [key: string]: never };'), 'a closed empty object is a never-valued index signature');
	t.ok(types({ patternProperties: {} }).includes('type Root = { [key: string]: unknown };'), 'an object is implied by patternProperties');
	t.ok(types({ type: 'object', properties: { a: { type: 'string' } }, patternProperties: { '^x': { type: 'number' } } }).includes('\t\t[key: string]: string | undefined | number;'), 'patternProperties alone earns an index signature');
	t.ok(types({ type: 'array', items: { type: 'object', properties: { deep: { type: 'string' } }, required: ['deep'], additionalProperties: false } }).includes('type Root = { deep: string }[];'), 'a single-member object is emitted inline');
	t.ok(types({ type: 'array', items: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, additionalProperties: false } }).includes('type Root = {\n\t\ta?: string;\n\t\tb?: number;\n\t}[];'), 'a multi-member object keeps one member per line');
	t.ok(types({ type: 'object', additionalProperties: { type: 'string' } }).includes('\tinterface Root {\n\t\t[key: string]: string;\n\t}'), 'a map with only additionalProperties is an interface');
	t.ok(types({ description: 'ends with */ inside' }).includes('/** ends with *\\/ inside */'), 'comment terminators are escaped');
	t.throws(() => types({ type: 'object', properties: { a: 'nope' } }), /#\/properties\/a: expected a JSON Schema/);
	t.end();
});

test('compile: arrays', (t) => {
	t.ok(types({ type: 'array' }).includes('type Root = unknown[];'), 'items defaults to unknown');
	t.ok(types({ type: 'array', items: false }).includes('type Root = [];'), 'items: false is an empty tuple');
	t.ok(types({ items: { type: 'string' } }).includes('type Root = string[];'), 'an array is implied by items');
	t.ok(types({ prefixItems: [{ type: 'string' }] }).includes('type Root = [string?, ...unknown[]];'), 'an array is implied by prefixItems');
	t.ok(types({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false, minItems: 1 }).includes('type Root = [string, number?];'), 'a closed tuple with optional members');
	t.ok(types({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' }, minItems: 3 }).includes('type Root = [string, number, number, ...number[]];'), 'minItems pads the tuple');
	t.ok(types({ type: 'array', items: { type: 'string' }, minItems: 2 }).includes('type Root = [string, string, ...string[]];'), 'minItems on a plain array');
	t.ok(types({ type: 'array', items: false, minItems: 1 }).includes('type Root = [];'), 'a contradictory closed array is an empty tuple');
	t.ok(types({ type: 'array', prefixItems: 'nope' }).includes('type Root = unknown[];'), 'a malformed prefixItems is ignored');
	t.end();
});

test('compile: definitions decide between interfaces and aliases', (t) => {
	const output = types({
		type: 'string',
		$defs: {
			Iface: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false },
			Implied: { properties: { a: { type: 'string' } }, additionalProperties: false },
			Empty: { type: 'object', additionalProperties: false },
			Enum: { type: 'object', enum: ['a'] },
			Combined: { type: 'object', anyOf: [{ type: 'string' }] },
			Bare: true,
			Multi: { type: ['object', 'null'], additionalProperties: false },
		},
	});
	t.ok(output.includes('\tinterface Iface {\n\t\ta?: string;\n\t}'), 'a plain object is an interface');
	t.ok(output.includes('\tinterface Implied {'), 'an object implied by properties is an interface');
	t.ok(output.includes('\ttype Empty = { [key: string]: never };'), 'an empty closed object is an alias');
	t.ok(output.includes('\ttype Enum = \'a\';'), 'an enum is an alias');
	t.ok(output.includes('\ttype Combined = string & { [key: string]: unknown };'), 'a combinator schema is an alias');
	t.ok(output.includes('\ttype Bare = unknown;'), 'a boolean schema is an alias');
	t.ok(output.includes('\ttype Multi = { [key: string]: never } | null;'), 'a type array is an alias');
	t.end();
});

test('compile: unsupported keywords fail loudly everywhere', (t) => {
	t.throws(() => types({ type: 'object', if: {}, then: {} }), /#: unsupported keyword\(s\): if, then/, 'on the root');
	t.throws(() => types({ $defs: { A: { type: 'object', not: {} } } }), /#\/\$defs\/A: unsupported keyword\(s\): not/, 'on a definition');
	t.throws(() => types({ type: 'object', properties: { a: { $dynamicRef: '#x' } } }), /#\/properties\/a: unsupported keyword\(s\): \$dynamicRef/, 'on a property');
	t.throws(() => types({ type: 'array', items: { unevaluatedProperties: false } }), /#\/items: unsupported/, 'on items');
	t.throws(() => types({ anyOf: [{ dependentSchemas: {} }] }), /#\/anyOf\/0: unsupported/, 'inside a combinator');
	t.throws(() => types({ $defs: { A: 'nope' } }), /#\/\$defs\/A: expected a JSON Schema/, 'a non-schema definition');
	t.end();
});
