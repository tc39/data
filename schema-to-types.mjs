/** @typedef {{ [keyword: string]: unknown }} SchemaObject */
/** @typedef {boolean | SchemaObject} Schema */
/** @typedef {{ defNames: Map<string, string>, indent: string, path: string, rootName: string }} Context */

const EXPORT_NAME = 'data';
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LOCAL_REF = /^#\/(?:\$defs|definitions)\/(?<key>[^/]+)$/;
/** @type {Record<string, string>} */
const PRIMITIVES = {
	boolean: 'boolean',
	integer: 'number',
	null: 'null',
	number: 'number',
	string: 'string',
};
const COMBINATORS = [
	'anyOf',
	'oneOf',
	'allOf',
];
const UNSUPPORTED = [
	'$dynamicRef',
	'$recursiveRef',
	'dependentSchemas',
	'else',
	'if',
	'not',
	'then',
	'unevaluatedItems',
	'unevaluatedProperties',
];

/**
 * @param {unknown} value
 * @returns {value is SchemaObject}
 */
function isObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Schema}
 */
function asSchema(value, path) {
	if (typeof value === 'boolean' || isObject(value)) {
		return value;
	}
	throw new TypeError(`${path}: expected a JSON Schema (an object or a boolean)`);
}

/** @type {(schema: Schema, path: string) => void} */
function assertSupported(schema, path) {
	const unsupported = isObject(schema) ? UNSUPPORTED.filter((keyword) => keyword in schema) : [];
	if (unsupported.length > 0) {
		throw new TypeError(`${path}: unsupported keyword(s): ${unsupported.join(', ')}`);
	}
}

/** @type {(str: string, path: string) => string} */
function toIdentifier(str, path) {
	const name = str
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');
	if (!IDENTIFIER.test(name)) {
		throw new TypeError(`${path}: \`${str}\` cannot be turned into a TypeScript identifier`);
	}
	return name;
}

/** @type {(str: string) => string} */
function stringLiteral(str) {
	const escaped = JSON.stringify(str).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, '\\\'');
	return `'${escaped}'`;
}

/** @type {(value: unknown, path: string) => string} */
function literal(value, path) {
	if (typeof value === 'string') {
		return stringLiteral(value);
	}
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
		return String(value);
	}
	throw new TypeError(`${path}: only string, number, boolean, and null literals are supported`);
}

/** @type {(schema: Schema, indent: string) => string[]} */
function tsdoc(schema, indent) {
	if (!isObject(schema)) {
		return [];
	}
	const lines = typeof schema.description === 'string'
		? schema.description.replace(/\*\//g, '*\\/').split('\n')
		: [];
	if (schema.deprecated === true) {
		lines.push('@deprecated');
	}
	if (lines.length === 0) {
		return [];
	}
	if (lines.length === 1) {
		return [`${indent}/** ${lines[0]} */`];
	}
	return [
		`${indent}/**`,
		...lines.map((line) => `${indent} * ${line}`.trimEnd()),
		`${indent} */`,
	];
}

/** @type {(types: string[]) => string} */
function union(types) {
	const unique = [...new Set(types)];
	if (unique.includes('unknown')) {
		return 'unknown';
	}
	return unique.length === 0 ? 'never' : unique.join(' | ');
}

/** @type {(types: string[]) => string} */
function intersection(types) {
	const unique = [...new Set(types)].filter((type) => type !== 'unknown');
	if (unique.length === 0) {
		return 'unknown';
	}
	return unique.map((type) => (unique.length > 1 && type.includes(' | ') ? `(${type})` : type)).join(' & ');
}

/** @type {(type: string) => string} */
function arrayOf(type) {
	return type.includes(' | ') || type.includes(' & ') ? `(${type})[]` : `${type}[]`;
}

/** @type {(ctx: Context, path: string) => Context} */
function withPath(ctx, path) {
	return { ...ctx, path };
}

/** @type {(value: unknown, ctx: Context, suffix: string) => string} */
function emitChild(value, ctx, suffix) {
	const child = withPath(ctx, `${ctx.path}/${suffix}`);
	return emitType(asSchema(value, child.path), child); // eslint-disable-line no-use-before-define
}

/** @type {(schema: SchemaObject, ctx: Context) => string} */
function emitArray(schema, ctx) {
	const rest = schema.items === false ? null : emitChild(schema.items ?? true, ctx, 'items');
	const min = Number.isInteger(schema.minItems) ? Number(schema.minItems) : 0;
	const prefix = Array.isArray(schema.prefixItems)
		? schema.prefixItems.map((item, i) => emitChild(item, ctx, `prefixItems/${i}`))
		: [];
	if (prefix.length === 0 && min === 0) {
		return rest === null ? '[]' : arrayOf(rest);
	}
	const members = prefix.map((member, i) => (i < min ? member : `${member}?`));
	const padding = rest === null ? [] : Array.from({ length: Math.max(0, min - prefix.length) }, () => rest);
	const tail = rest === null ? [] : [`...${arrayOf(rest)}`];
	return `[${members.concat(padding, tail).join(', ')}]`;
}

/** @type {(schema: SchemaObject, ctx: Context) => string[]} */
function emitObjectBody(schema, ctx) {
	const inner = { ...ctx, indent: `${ctx.indent}\t` };
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	const properties = isObject(schema.properties) ? Object.entries(schema.properties) : [];
	/** @type {string[]} */
	const lines = [];
	/** @type {string[]} */
	const indexTypes = [];
	properties.forEach(([name, value]) => {
		const property = asSchema(value, `${ctx.path}/properties/${name}`);
		const type = emitChild(property, inner, `properties/${name}`);
		const isRequired = required.has(name);
		const modifier = isObject(property) && property.readOnly === true ? 'readonly ' : '';
		const key = IDENTIFIER.test(name) ? name : stringLiteral(name);
		lines.push(...tsdoc(property, inner.indent));
		lines.push(`${inner.indent}${modifier}${key}${isRequired ? '' : '?'}: ${type};`);
		indexTypes.push(isRequired ? type : `${type} | undefined`);
	});
	const patterns = isObject(schema.patternProperties) ? Object.entries(schema.patternProperties) : [];
	const extraTypes = patterns.map(([pattern, value]) => emitChild(value, inner, `patternProperties/${pattern}`));
	/*
	 * An absent `additionalProperties` only earns an index signature when nothing else describes the shape;
	 * once properties are named, TypeScript already allows extra ones, and the index signature would turn a
	 * typo into `unknown` instead of an error, and pollute every intersection the schema takes part in.
	 */
	const additional = schema.additionalProperties;
	if (additional !== false && (typeof additional !== 'undefined' || properties.length === 0)) {
		extraTypes.push(emitChild(additional ?? true, inner, 'additionalProperties'));
	}
	if (extraTypes.length > 0) {
		lines.push(`${inner.indent}[key: string]: ${union([...indexTypes, ...extraTypes])};`);
	}
	return lines;
}

/** @type {(key: string) => string} */
function decodePointerKey(key) {
	try {
		return decodeURIComponent(key).replace(/~1/g, '/').replace(/~0/g, '~');
	} catch {
		return key;
	}
}

/** @type {(ref: string, ctx: Context) => string} */
function emitRef(ref, ctx) {
	if (ref === '#') {
		return ctx.rootName;
	}
	const key = LOCAL_REF.exec(ref)?.groups?.key;
	const name = typeof key === 'string' && ctx.defNames.get(decodePointerKey(key));
	if (!name) {
		throw new TypeError(`${ctx.path}: unsupported $ref \`${ref}\`; only \`#\` and local \`#/$defs/…\` references are supported`);
	}
	return name;
}

/** @type {(schema: SchemaObject, type: string, ctx: Context) => string} */
function emitTyped(schema, type, ctx) {
	if (type === 'array') {
		return emitArray(schema, ctx);
	}
	if (type === 'object') {
		const lines = emitObjectBody(schema, ctx);
		if (lines.length === 0) {
			return '{ [key: string]: never }';
		}
		if (lines.length === 1) {
			return `{ ${lines[0].trim().replace(/;$/, '')} }`;
		}
		return `{\n${lines.join('\n')}\n${ctx.indent}}`;
	}
	if (Object.hasOwn(PRIMITIVES, type)) {
		return PRIMITIVES[type];
	}
	throw new TypeError(`${ctx.path}: unsupported type \`${type}\``);
}

/** @type {(schema: Schema, ctx: Context) => string} */
function emitType(schema, ctx) {
	if (typeof schema === 'boolean') {
		return schema ? 'unknown' : 'never';
	}
	assertSupported(schema, ctx.path);
	const parts = typeof schema.$ref === 'string' ? [emitRef(schema.$ref, ctx)] : [];
	const hasLiteral = 'const' in schema || Array.isArray(schema.enum);
	if ('const' in schema) {
		parts.push(literal(schema.const, `${ctx.path}/const`));
	} else if (Array.isArray(schema.enum)) {
		parts.push(union(schema.enum.map((value, i) => literal(value, `${ctx.path}/enum/${i}`))));
	}
	COMBINATORS.forEach((keyword) => {
		const subschemas = schema[keyword];
		if (Array.isArray(subschemas)) {
			const types = subschemas.map((sub, i) => emitChild(sub, ctx, `${keyword}/${i}`));
			parts.push(keyword === 'allOf' ? intersection(types) : union(types));
		}
	});
	if (!hasLiteral) {
		const isObjectLike = 'properties' in schema || 'additionalProperties' in schema || 'patternProperties' in schema;
		const isArrayLike = 'items' in schema || 'prefixItems' in schema;
		const implied = isObjectLike ? ['object'] : isArrayLike ? ['array'] : [];
		const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter((type) => typeof type === 'string');
		const typed = (types.length > 0 ? types : implied).map((type) => emitTyped(schema, type, ctx));
		if (typed.length > 0) {
			parts.push(union(typed));
		}
	}
	return intersection(parts);
}

/** @type {(name: string, schema: Schema, ctx: Context) => string[]} */
function emitDef(name, schema, ctx) {
	assertSupported(schema, ctx.path);
	const isPlainObject = isObject(schema)
		&& (schema.type === 'object' || (!('type' in schema) && 'properties' in schema))
		&& !('$ref' in schema || 'const' in schema || 'enum' in schema || COMBINATORS.some((keyword) => keyword in schema));
	const body = isPlainObject ? emitObjectBody(schema, ctx) : [];
	if (body.length > 0) {
		return [
			...tsdoc(schema, ctx.indent),
			`${ctx.indent}interface ${name} {`,
			...body,
			`${ctx.indent}}`,
		];
	}
	return [
		...tsdoc(schema, ctx.indent),
		`${ctx.indent}type ${name} = ${emitType(schema, ctx)};`,
	];
}

/** @type {(schema: SchemaObject, schemaName: string) => string} */
function compile(schema, schemaName) {
	if (typeof schema.title !== 'string') {
		throw new TypeError(`${schemaName}: the root schema must have a \`title\`, which names the exported type`);
	}
	const rootName = toIdentifier(schema.title, `${schemaName}#/title`);
	const defs = Object.entries({
		...isObject(schema.definitions) ? schema.definitions : {},
		...isObject(schema.$defs) ? schema.$defs : {},
	});
	/** @type {Context} */
	const ctx = {
		defNames: new Map(),
		indent: '\t',
		path: '#',
		rootName,
	};
	const names = new Set([rootName]);
	defs.forEach(([key, def]) => {
		const name = toIdentifier(isObject(def) && typeof def.title === 'string' ? def.title : key, `${schemaName}#/$defs/${key}`);
		if (names.has(name)) {
			throw new TypeError(`${schemaName}#/$defs/${key}: duplicate type name \`${name}\``);
		}
		names.add(name);
		ctx.defNames.set(key, name);
	});
	const blocks = [
		...defs.map(([key, def]) => emitDef(
			String(ctx.defNames.get(key)),
			asSchema(def, `#/$defs/${key}`),
			withPath(ctx, `#/$defs/${key}`),
		)),
		emitDef(rootName, schema, ctx),
	];
	return [
		`// Generated from ${schemaName} by \`node generate-types.mjs\` at the repository root; do not edit.`,
		`declare namespace ${EXPORT_NAME} {\n${blocks.map((lines) => lines.join('\n')).join('\n\n')}\n}`,
		[...tsdoc(schema, ''), `declare const ${EXPORT_NAME}: ${EXPORT_NAME}.${rootName};`].join('\n'),
		`export = ${EXPORT_NAME};\n`,
	].join('\n\n');
}

export { compile, isObject };
