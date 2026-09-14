import test from 'tape';
import ajv2020 from 'ajv/dist/2020.js';
import { globSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { compile } from '../schema-to-types.mjs';

const Ajv2020 = ajv2020.default;
const root = fileURLToPath(new URL('..', import.meta.url));

/** @type {(path: string) => Record<string, unknown>} */
function readJSON(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

globSync('data/*/schema.json', { cwd: root }).sort().forEach((schemaPath) => {
	const dir = dirname(schemaPath);

	test(`${dir}: index.json matches schema.json`, (t) => {
		const schema = readJSON(join(root, schemaPath));
		const ajv = new Ajv2020({ allErrors: true, strict: true });

		t.ok(ajv.validateSchema(schema), `the schema is a valid draft 2020-12 schema: ${ajv.errorsText(ajv.errors)}`);

		const validate = ajv.compile(schema);
		const data = readJSON(join(root, dir, 'index.json'));
		t.ok(validate(data), `the data is valid: ${ajv.errorsText(validate.errors)}`);

		const pkg = readJSON(join(root, dir, 'package.json'));
		t.equal(readFileSync(join(root, dir, String(pkg.types)), 'utf8'), compile(schema, 'schema.json'), 'the generated types are up to date');
		t.end();
	});
});
