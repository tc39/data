import {
	existsSync,
	globSync,
	readFileSync,
	writeFileSync,
} from 'fs';
import {
	basename,
	dirname,
	extname,
	join,
	relative,
	resolve,
} from 'path';

import { compile, isObject } from './schema-to-types.mjs';

/** @type {(path: string) => unknown} */
function readJSON(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

/** @type {(value: unknown, condition: string) => string[]} */
function conditionTargets(value, condition) {
	if (Array.isArray(value)) {
		return value.flatMap((item) => conditionTargets(item, condition));
	}
	if (!isObject(value)) {
		return [];
	}
	return Object.entries(value).flatMap(([key, target]) => (
		key === condition && typeof target === 'string' ? [target] : conditionTargets(target, condition)
	));
}

/** @type {(value: unknown) => string[]} */
function codeTargets(value) {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(codeTargets);
	}
	if (!isObject(value)) {
		return [];
	}
	return Object.entries(value).flatMap(([key, target]) => (key === 'types' ? [] : codeTargets(target)));
}

/*
 * TypeScript only looks for a sibling declaration file next to JS entry points; for a JSON entry point,
 * the generated declarations are unreachable unless exports["."] names them in a "types" condition.
 */
/** @type {(pkg: { [field: string]: unknown }, types: string, pkgPath: string) => void} */
function assertTypesExposed(pkg, types, pkgPath) {
	const entry = isObject(pkg.exports) ? pkg.exports['.'] : undefined;
	if (typeof entry === 'undefined') {
		return;
	}
	const expected = types.startsWith('./') ? types : `./${types}`;
	const typesTargets = conditionTargets(entry, 'types');
	const needsCondition = codeTargets(entry).some((target) => !(/\.[cm]?js$/).test(target));
	if (needsCondition && typesTargets.length === 0) {
		throw new Error(`${pkgPath}: exports["."] must include a "types" condition pointing at ${expected}; without it, TypeScript ignores the generated declarations for a non-JS entry point`);
	}
	const wrong = typesTargets.filter((target) => target !== expected);
	if (wrong.length > 0) {
		throw new Error(`${pkgPath}: the exports["."] "types" condition points at ${wrong.join(', ')} instead of ${expected}`);
	}
}

/** @type {(dir: string) => string} */
function generate(dir) {
	const schemaPath = join(dir, 'schema.json');
	const pkgPath = join(dir, 'package.json');
	[schemaPath, pkgPath].forEach((file) => {
		if (!existsSync(file)) {
			throw new Error(`${dir}: no ${basename(file)} found`);
		}
	});
	const schema = readJSON(schemaPath);
	if (!isObject(schema)) {
		throw new TypeError(`${schemaPath}: the root schema must be an object`);
	}
	const pkg = readJSON(pkgPath);
	const main = isObject(pkg) && typeof pkg.main === 'string' ? pkg.main : 'index.json';
	const types = isObject(pkg) && typeof pkg.types === 'string'
		? pkg.types
		: join(dirname(main), `${basename(main, extname(main))}.d.ts`);
	if (isObject(pkg)) {
		assertTypesExposed(pkg, types, pkgPath);
	}
	const outPath = join(dir, types);
	writeFileSync(outPath, compile(schema, basename(schemaPath)));
	return outPath;
}

/** @type {(args: string[]) => string[]} */
function targetDirs(args) {
	if (args.length > 0) {
		return args.map((arg) => resolve(arg));
	}
	const cwd = process.cwd();
	const pkg = existsSync(join(cwd, 'package.json')) ? readJSON(join(cwd, 'package.json')) : null;
	if (isObject(pkg) && Array.isArray(pkg.workspaces)) {
		return pkg.workspaces
			.flatMap((pattern) => globSync(String(pattern), { cwd }))
			.map((dir) => join(cwd, dir))
			.filter((dir) => existsSync(join(dir, 'schema.json')));
	}
	return [cwd];
}

export { generate };

if (import.meta.main) {
	targetDirs(process.argv.slice(2)).forEach((dir) => {
		console.log(`generated ${relative(process.cwd(), generate(dir))}`);
	});
}
