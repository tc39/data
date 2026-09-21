import test from 'tape';
import delegates from '../data/delegates/index.json' with { type: 'json' };
import processStages from '../data/process/index.json' with { type: 'json' };
import proposalData from '../data/proposals/index.json' with { type: 'json' };
import proposalSchema from '../data/proposals/schema.json' with { type: 'json' };

/** @typedef {{ abbreviation: string, kind: 'delegate' }} DelegateReference */
/** @typedef {{ github?: string, kind: 'community', name: string }} CommunityMember */
/** @typedef {DelegateReference | CommunityMember} Person */
/** @typedef {{ date: string, notesUrl?: string }} Presentation */
/** @typedef {{ featureFlag?: string, hasTests: boolean, url?: string }} Test262Coverage */
/**
 * @typedef Proposal
 * @property {Person[]} authors
 * @property {Person[]} champions
 * @property {number} [expectedPublicationYear]
 * @property {string} id
 * @property {string} name
 * @property {Presentation[]} presentations
 * @property {string} [rationale]
 * @property {string} stage
 * @property {Person[]} [stage27Reviewers]
 * @property {Test262Coverage} [test262]
 */

// The parentheses are required for TypeScript to recognise this as a JSDoc cast.
// eslint-disable-next-line no-extra-parens
const proposals = /** @type {Proposal[]} */ (proposalData);
const activeStages = new Set(processStages
	.filter(({ isTerminal }) => !isTerminal)
	.map(({ stage }) => stage));
const offPathStages = new Set(processStages
	.filter(({ isOnPathToInclusion }) => !isOnPathToInclusion)
	.map(({ stage }) => stage));

// These proposals have known gaps in their historical champion metadata.
const championExceptions = new Set([
	'function-sent',
	'collection-normalization',
	'destructuring-private',
]);

// No formally appointed Stage 2.7 reviewers have been identified for these proposals.
const reviewerExceptions = new Set([
	'array-prototype-includes',
	'atomics-microwait',
	'collection-normalization',
	'decorator-metadata',
	'exponentiation-operator',
	'intl-datetimeformat-formatrange',
	'intl-displaynames-v2',
	'jobcallback-module',
	'module-declarations',
	'object-values-entries',
	'pipeline-operator',
	'redeclarable-global-eval-vars',
	'regex-escaping',
	'string-pad-start-end',
	'unified-intl-numberformat',
]);

/** @param {Person} person @returns {string} */
function personKey(person) {
	return person.kind === 'delegate' ? `delegate:${person.abbreviation}` : `community:${person.name}`;
}

/** @param {string} date @returns {number} */
function presentationTime(date) {
	const [year, month, day = 1] = date.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
}

/** @param {Proposal} proposal @returns {boolean} */
function hasReviewerGap(proposal) {
	return ['2', '2.7', '3', '4'].includes(proposal.stage)
		&& (proposal.stage27Reviewers?.length ?? 0) === 0
		&& !reviewerExceptions.has(proposal.id);
}

test('data/proposals: proposal identifiers are unique', (t) => {
	const counts = Map.groupBy(proposals, ({ id }) => id);
	const duplicates = [...counts].filter(([, matches]) => matches.length > 1).map(([id]) => id);

	t.deepEqual(duplicates, [], 'proposal identifiers are unique');
	t.end();
});

test('data/proposals: delegate references resolve', (t) => {
	const unknown = proposals.flatMap((proposal) => {
		const { authors, champions, stage27Reviewers = [] } = proposal;
		const people = [
			...authors,
			...champions,
			...stage27Reviewers,
		];
		return people.flatMap((person) => {
			if (person.kind === 'community' || Object.hasOwn(delegates, person.abbreviation)) {
				return [];
			}
			return [`${proposal.id}: ${person.abbreviation}`];
		});
	});

	t.deepEqual(unknown, [], 'every delegate abbreviation exists in data/delegates');
	t.end();
});

test('data/proposals: people lists do not contain duplicates', (t) => {
	const duplicates = proposals.flatMap((proposal) => [
		{ field: 'authors', people: proposal.authors },
		{ field: 'champions', people: proposal.champions },
		{ field: 'stage27Reviewers', people: proposal.stage27Reviewers ?? [] },
	].flatMap(({ field, people }) => {
		const counts = Map.groupBy(people, personKey);
		return [...counts]
			.filter(([, matches]) => matches.length > 1)
			.map(([key]) => `${proposal.id}.${field}: ${key}`);
	}));

	t.deepEqual(duplicates, [], 'authors, champions, and reviewers are unique within their lists');
	t.end();
});

test('data/proposals: Stage 2.7 reviewers are not champions', (t) => {
	const championReviewers = proposals.flatMap((proposal) => {
		const championKeys = new Set(proposal.champions.map(personKey));
		return (proposal.stage27Reviewers ?? [])
			.filter((reviewer) => championKeys.has(personKey(reviewer)))
			.map((reviewer) => `${proposal.id}: ${personKey(reviewer)}`);
	});

	t.deepEqual(championReviewers, [], 'Stage 2.7 reviewers are not in the proposal champion group');
	t.end();
});

test('data/proposals: every active proposal has a champion', (t) => {
	const unchampioned = proposals
		.filter(({ champions, id, stage }) => activeStages.has(stage)
			&& champions.length === 0
			&& !championExceptions.has(id))
		.map(({ id }) => id);

	t.deepEqual(unchampioned, [], 'no active proposal is missing a champion');
	t.end();
});

test('data/proposals: stages resolve to process stages', (t) => {
	const processStageNames = processStages.map(({ stage }) => stage);
	const stages = new Set(processStageNames);
	const unknown = proposals
		.filter(({ stage }) => !stages.has(stage))
		.map(({ id, stage }) => `${id}: ${stage}`);
	const schemaStages = proposalSchema.$defs.ProposalStage.enum;

	t.deepEqual(unknown, [], 'every proposal stage exists in data/process');
	t.deepEqual(
		schemaStages,
		processStageNames,
		'the proposal schema has exactly the stages defined by data/process',
	);
	t.end();
});

test('data/proposals: presentation dates are valid calendar dates', (t) => {
	const invalid = proposals.flatMap((proposal) => proposal.presentations
		.filter(({ date }) => {
			const match = (/^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])(?:-(?<day>0[1-9]|[12]\d|3[01]))?$/u).exec(date);
			if (!match) {
				return true;
			}
			const { groups } = match;
			if (!groups) {
				return true;
			}
			if (!groups.day) {
				return false;
			}
			const { day, month, year } = groups;
			const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
			return Number(day) > lastDay;
		})
		.map(({ date }) => `${proposal.id}: ${date}`));

	t.deepEqual(invalid, [], 'dates use YYYY-MM or YYYY-MM-DD and identify real calendar dates');
	t.end();
});

test('data/proposals: presentations are ordered oldest to newest', (t) => {
	const outOfOrder = proposals.flatMap((proposal) => {
		const dates = proposal.presentations.map(({ date }) => date);
		const sortedDates = dates.toSorted((left, right) => presentationTime(left) - presentationTime(right));
		return dates.some((date, index) => date !== sortedDates[index]) ? [proposal.id] : [];
	});

	t.deepEqual(outOfOrder, [], 'presentation dates are in ascending order');
	t.end();
});

test('data/proposals: Test262 coverage links identify test evidence', (t) => {
	const invalid = proposals.flatMap((proposal) => {
		if (proposal.test262?.hasTests !== true) {
			return [];
		}
		if (!proposal.test262.url) {
			return [`${proposal.id}: missing URL`];
		}

		const url = new URL(proposal.test262.url);
		const isPullRequest = (/^\/tc39\/test262\/pull\/[1-9]\d*$/u).test(url.pathname);
		const isTestDirectory = (/^\/tc39\/test262\/tree\/[^/]+\/test\/.+$/u).test(url.pathname);
		const isFeatureSearch = url.pathname === '/tc39/test262/search'
			&& typeof proposal.test262.featureFlag === 'string'
			&& url.searchParams.get('q') === proposal.test262.featureFlag;

		return isPullRequest || isTestDirectory || isFeatureSearch
			? []
			: [`${proposal.id}: ${proposal.test262.url}`];
	});

	t.deepEqual(invalid, [], 'tests are evidenced by a PR, feature search, or test directory');
	t.end();
});

test('data/proposals: external data links point to their canonical repositories', (t) => {
	const invalid = proposals.flatMap((proposal) => {
		const links = proposal.presentations
			.filter(({ notesUrl }) => typeof notesUrl === 'string'
				&& !(notesUrl.startsWith('https://github.com/tc39/notes/') && notesUrl.includes('/meetings/')))
			.map(({ notesUrl }) => `${proposal.id}.presentations: ${notesUrl}`);
		if (proposal.test262?.url && !proposal.test262.url.startsWith('https://github.com/tc39/test262/')) {
			links.push(`${proposal.id}.test262: ${proposal.test262.url}`);
		}
		return links;
	});

	t.deepEqual(invalid, [], 'notes and Test262 links point to the corresponding TC39 repositories');
	t.end();
});

test('data/proposals: optional metadata agrees with proposal stages', (t) => {
	const inconsistencies = proposals.flatMap((proposal) => {
		const issues = [];
		if (offPathStages.has(proposal.stage) && !('rationale' in proposal)) {
			issues.push(`${proposal.id}: proposal without its required rationale`);
		}
		if ('rationale' in proposal && !offPathStages.has(proposal.stage)) {
			issues.push(`${proposal.id}: rationale at Stage ${proposal.stage}`);
		}
		if (['0', '1'].includes(proposal.stage) && 'stage27Reviewers' in proposal) {
			issues.push(`${proposal.id}: Stage 2.7 reviewers before Stage 2`);
		}
		if (hasReviewerGap(proposal)) {
			issues.push(`${proposal.id}: no Stage 2.7 reviewer metadata at Stage ${proposal.stage}`);
		}
		if (['3', '4'].includes(proposal.stage) && !('test262' in proposal)) {
			issues.push(`${proposal.id}: no Test262 metadata at Stage ${proposal.stage}`);
		}
		if ('expectedPublicationYear' in proposal && proposal.stage !== '4') {
			issues.push(`${proposal.id}: publication year at Stage ${proposal.stage}`);
		}
		if (proposal.stage === '4' && !('expectedPublicationYear' in proposal)) {
			issues.push(`${proposal.id}: Stage 4 proposal without a publication year`);
		}
		if (proposal.test262?.hasTests === false
			&& 'featureFlag' in proposal.test262) {
			issues.push(`${proposal.id}: feature flag recorded without tests`);
		}
		return issues;
	});

	t.deepEqual(inconsistencies, [], 'stage-specific metadata is complete and only appears at the applicable stages');
	t.end();
});
