import test from 'tape';
import { spawnSync } from 'child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import {
	join,
	relative,
	resolve,
} from 'path';
import { fileURLToPath } from 'url';

import { generate } from '../generate-types.mjs';
import { compile } from '../schema-to-types.mjs';

const generator = fileURLToPath(new URL('../generate-types.mjs', import.meta.url));

const schema = {
	title: 'Things',
	type: 'object',
	additionalProperties: { type: 'string' },
};
const expected = compile(schema, 'schema.json');

/** @type {(t: import('tape').Test) => string} */
function tempDir(t) {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tc39-data-')));
	t.teardown(() => rmSync(dir, { force: true, recursive: true }));
	return dir;
}

/** @type {(dir: string, files: Record<string, unknown>) => string} */
function pkgDir(dir, files) {
	mkdirSync(dir, { recursive: true });
	Object.entries(files).forEach(([name, contents]) => {
		writeFileSync(join(dir, name), typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, '\t')}\n`);
	});
	return dir;
}

/** @type {(cwd: string, args?: string[]) => { status: number | null, stdout: string, stderr: string }} */
function run(cwd, args = []) {
	const { status, stdout, stderr } = spawnSync(process.execPath, [generator, ...args], { cwd, encoding: 'utf8' });
	return { status, stderr, stdout };
}

test('generate: writes the declaration file named by package.json', (t) => {
	const dir = pkgDir(tempDir(t), { 'package.json': { main: 'index.json', types: './index.d.ts' }, 'schema.json': schema });
	t.equal(generate(dir), join(dir, 'index.d.ts'), 'the output path is returned');
	t.equal(readFileSync(join(dir, 'index.d.ts'), 'utf8'), expected, 'the compiled types are written');
	t.end();
});

test('generate: derives the output path from main when types is absent', (t) => {
	const dir = pkgDir(tempDir(t), { 'package.json': { main: 'lib/data.json' }, 'schema.json': schema });
	mkdirSync(join(dir, 'lib'));
	t.equal(generate(dir), join(dir, 'lib/data.d.ts'), 'the sibling of main is returned');
	t.equal(readFileSync(join(dir, 'lib/data.d.ts'), 'utf8'), expected, 'the sibling of main is written');

	const bare = pkgDir(tempDir(t), { 'package.json': [], 'schema.json': schema });
	generate(bare);
	t.equal(readFileSync(join(bare, 'index.d.ts'), 'utf8'), expected, 'index.d.ts is the default when package.json is not an object');
	t.end();
});

test('generate: input validation', (t) => {
	const noSchema = pkgDir(tempDir(t), { 'package.json': {} });
	t.throws(() => generate(noSchema), /no schema\.json found/);

	const noPkg = pkgDir(tempDir(t), { 'schema.json': schema });
	t.throws(() => generate(noPkg), /no package\.json found/);

	const notObject = pkgDir(tempDir(t), { 'package.json': {}, 'schema.json': [] });
	t.throws(() => generate(notObject), /the root schema must be an object/);
	t.end();
});

test('generate: the package must expose the generated types', (t) => {
	/** @type {(exports: unknown, main?: string) => string} */
	const attempt = (exports, main = 'index.json') => generate(pkgDir(tempDir(t), {
		'package.json': { exports, main, types: './index.d.ts' },
		'schema.json': schema,
	}));

	t.doesNotThrow(() => attempt(undefined), 'no exports field');
	t.doesNotThrow(() => attempt('./index.json'), 'exports without a "." entry');
	t.doesNotThrow(() => attempt({ './package.json': './package.json' }), 'exports without a "." entry (object)');
	t.doesNotThrow(() => attempt({ '.': './index.js' }, 'index.js'), 'a JS entry needs no condition');
	t.doesNotThrow(() => attempt({ '.': { types: './index.d.ts', default: './index.json' } }), 'a types condition');
	t.doesNotThrow(() => attempt({ '.': [{ types: './index.d.ts', default: './index.json' }, './index.json'] }), 'an array of targets');
	t.doesNotThrow(() => attempt({ '.': { import: { types: './index.d.ts', default: './index.json' }, require: { types: './index.d.ts', default: './index.json' } } }), 'nested conditions');
	t.doesNotThrow(() => attempt({ '.': { default: null } }), 'a null target is ignored');
	t.doesNotThrow(() => generate(pkgDir(tempDir(t), {
		'package.json': { exports: { '.': { types: './index.d.ts', default: './index.json' } }, main: 'index.json' },
		'schema.json': schema,
	})), 'the default output path is compared with a ./ prefix');

	t.throws(() => attempt({ '.': './index.json' }), /must include a "types" condition pointing at \.\/index\.d\.ts/, 'a JSON entry without a condition');
	t.throws(() => attempt({ '.': { default: './index.json' } }), /must include a "types" condition/, 'a conditions object without types');
	t.throws(() => attempt({ '.': { types: './index.d.mts', default: './index.json' } }), /points at \.\/index\.d\.mts instead of \.\/index\.d\.ts/, 'a condition pointing elsewhere');
	t.throws(() => attempt({ '.': { types: './other.d.ts', default: './index.js' } }, 'index.js'), /points at \.\/other\.d\.ts instead of/, 'a wrong condition is rejected even for a JS entry');
	t.end();
});

test('cli: generates every workspace that has a schema', (t) => {
	const root = pkgDir(tempDir(t), { 'package.json': { workspaces: ['pkgs/*'] } });
	const typed = pkgDir(join(root, 'pkgs/typed'), { 'package.json': { main: 'index.json', types: './index.d.ts' }, 'schema.json': schema });
	pkgDir(join(root, 'pkgs/untyped'), { 'package.json': { main: 'index.json' } });
	mkdirSync(join(root, 'pkgs/empty'));

	const result = run(root);
	t.equal(result.status, 0, 'exits successfully');
	t.equal(result.stdout, 'generated pkgs/typed/index.d.ts\n', 'only the workspace with a schema is generated');
	t.equal(readFileSync(join(typed, 'index.d.ts'), 'utf8'), expected);
	t.end();
});

test('cli: generates the current package, or explicit directories', (t) => {
	const dir = pkgDir(tempDir(t), { 'package.json': { main: 'index.json', types: './index.d.ts' }, 'schema.json': schema });
	const inside = run(dir);
	t.equal(inside.status, 0);
	t.equal(inside.stdout, 'generated index.d.ts\n', 'a package without workspaces generates itself');

	const other = pkgDir(tempDir(t), { 'package.json': { main: 'index.json', types: './index.d.ts' }, 'schema.json': schema });
	const explicit = run(dir, [other, relative(dir, other)]);
	t.equal(explicit.status, 0);
	t.equal(explicit.stdout, `generated ${relative(dir, other)}/index.d.ts\ngenerated ${relative(dir, resolve(dir, relative(dir, other)))}/index.d.ts\n`, 'absolute and relative directories are accepted');

	const empty = tempDir(t);
	const failure = run(empty);
	t.equal(failure.status, 1, 'a directory with nothing in it fails');
	t.ok(failure.stderr.includes('no schema.json found'), 'with a useful message');
	t.end();
});
