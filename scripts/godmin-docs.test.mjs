import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	convertPage,
	copyDocs,
	designOrder,
	fill,
	listPages,
	mapUrl,
	pack,
	pinnedVersion,
	repoUrl,
	rewriteLinks,
	stamp,
} from './godmin-docs.mjs';

/** The release the examples copy from. */
const release = {
	site: 'https://docs.gopherium.org',
	repo: 'https://github.com/gopherium/godmin',
	version: '1.2.3',
};

/** The folders the tests create, removed when the tests end. */
const folders = [];

after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

/** Returns a new empty folder that is removed when the tests end. */
function scratch() {
	const folder = mkdtempSync(join(tmpdir(), 'godmin-docs-test-'));
	folders.push(folder);
	return folder;
}

/** Writes each file of a map from relative path to text under a folder. */
function writeTree(folder, files) {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(folder, path)), { recursive: true });
		writeFileSync(join(folder, path), text);
	}
}

/** Returns a page with a title, a description and the given body. */
function page(title, body) {
	return `---\ntitle: ${title}\ndescription: A page about ${title.toLowerCase()}.\n---\n\n${body}`;
}

/** Writes a godmin package of a version holding the given pages under root, and returns its docs folder. */
function packageAt(root, version, pages) {
	writeTree(root, {
		'package.json': JSON.stringify({ version, repository: { url: 'git+https://github.com/gopherium/godmin.git' } }),
		...Object.fromEntries(Object.entries(pages).map(([path, text]) => [`docs/${path}`, text])),
	});
	return join(root, 'docs');
}

/** Returns the docs folder of a new godmin package holding the given pages. */
function packageWith(pages) {
	return packageAt(scratch(), '1.2.3', pages);
}

describe('mapUrl', () => {
	test('a page in the same folder becomes its site address', () => {
		assert.equal(mapUrl('./lists.md', 'overview.md', release), '/admin-ui/lists/');
	});

	test('a page in the same folder keeps its anchor', () => {
		assert.equal(mapUrl('./lists.md#avatars', 'overview.md', release), '/admin-ui/lists/#avatars');
	});

	test('a usage page reaches a Design System page', () => {
		assert.equal(
			mapUrl('./design-system/color.md', 'overview.md', release),
			'/admin-ui/design-system/color/',
		);
	});

	test('a Design System page reaches another Design System page', () => {
		assert.equal(
			mapUrl('./toasts.md', 'design-system/overview.md', release),
			'/admin-ui/design-system/toasts/',
		);
	});

	test('a Design System page reaches a usage page in the parent folder', () => {
		assert.equal(
			mapUrl('../overview.md#changing-the-page-appearance', 'design-system/color.md', release),
			'/admin-ui/overview/#changing-the-page-appearance',
		);
	});

	test('an anchor on the same page stays as it is', () => {
		assert.equal(mapUrl('#the-canvas', 'design-system/layout.md', release), '#the-canvas');
	});

	test('a root address stays as it is', () => {
		assert.equal(mapUrl('/plugins/overview/', 'overview.md', release), '/plugins/overview/');
	});

	test('a docs site address becomes a root address', () => {
		assert.equal(
			mapUrl('https://docs.gopherium.org/plugins/overview/', 'overview.md', release),
			'/plugins/overview/',
		);
	});

	test('a docs site address keeps its anchor', () => {
		assert.equal(
			mapUrl('https://docs.gopherium.org/translations/health/#one-copy-of-the-runtime', 'build-and-versioning.md', release),
			'/translations/health/#one-copy-of-the-runtime',
		);
	});

	test('the docs site home becomes the root', () => {
		assert.equal(mapUrl('https://docs.gopherium.org', 'overview.md', release), '/');
		assert.equal(mapUrl('https://docs.gopherium.org/', 'overview.md', release), '/');
	});

	test('another site stays as it is', () => {
		const changelog = 'https://github.com/gopherium/godmin/blob/main/CHANGELOG.md';
		assert.equal(mapUrl(changelog, 'build-and-versioning.md', release), changelog);
		assert.equal(mapUrl('https://docs.gopherium.org.example.com/', 'overview.md', release), 'https://docs.gopherium.org.example.com/');
		assert.equal(mapUrl('mailto:maria.perez@example.com', 'overview.md', release), 'mailto:maria.perez@example.com');
	});

	test('a file outside the docs folder becomes its GitHub address at the release tag', () => {
		assert.equal(
			mapUrl('../CHANGELOG.md', 'overview.md', release),
			'https://github.com/gopherium/godmin/blob/v1.2.3/CHANGELOG.md',
		);
		assert.equal(
			mapUrl('../../src/menu-item.ts#L19', 'design-system/color.md', release),
			'https://github.com/gopherium/godmin/blob/v1.2.3/src/menu-item.ts#L19',
		);
	});

	test('a file in the docs folder that is not a page becomes its GitHub address', () => {
		assert.equal(
			mapUrl('./images/frame.png', 'overview.md', release),
			'https://github.com/gopherium/godmin/blob/v1.2.3/docs/images/frame.png',
		);
	});

	test('a link that leaves the package fails', () => {
		assert.throws(() => mapUrl('../../notes.md', 'overview.md', release), /leaves the godmin package/);
	});
});

describe('rewriteLinks', () => {
	/** Maps a link as it would be found in the overview page. */
	const fromOverview = (url) => mapUrl(url, 'overview.md', release);

	test('rewrites a link and leaves inline code, fenced blocks and indented blocks alone', () => {
		const body = [
			'Read [the lists page](./lists.md#avatars) first.',
			'',
			'Write `[lists](./lists.md)` to link it.',
			'',
			'```md',
			'[lists](./lists.md)',
			'```',
			'',
			'    [lists](./lists.md)',
			'',
		].join('\n');
		const expected = body.replace('(./lists.md#avatars)', '(/admin-ui/lists/#avatars)');

		assert.equal(rewriteLinks(body, fromOverview), expected);
	});

	test('rewrites a docs site address in running text to a root address', () => {
		assert.equal(
			rewriteLinks('See [plugins](https://docs.gopherium.org/plugins/overview/).\n', fromOverview),
			'See [plugins](/plugins/overview/).\n',
		);
	});

	test('rewrites the address and not link text that repeats it', () => {
		assert.equal(rewriteLinks('[./lists.md](./lists.md)\n', fromOverview), '[./lists.md](/admin-ui/lists/)\n');
	});

	test('keeps a link title', () => {
		assert.equal(
			rewriteLinks('[lists](./lists.md "The lists")\n', fromOverview),
			'[lists](/admin-ui/lists/ "The lists")\n',
		);
	});

	test('rewrites a link definition', () => {
		assert.equal(
			rewriteLinks('Read [lists][l].\n\n[l]: ./lists.md\n', fromOverview),
			'Read [lists][l].\n\n[l]: /admin-ui/lists/\n',
		);
	});

	test('rewrites the address of a link definition and not a label that repeats it', () => {
		assert.equal(
			rewriteLinks('Read [lists][./lists.md].\n\n[./lists.md]: ./lists.md\n', fromOverview),
			'Read [lists][./lists.md].\n\n[./lists.md]: /admin-ui/lists/\n',
		);
	});

	test('rewrites several links in one body', () => {
		assert.equal(
			rewriteLinks('[a](./a.md), [b](./design-system/b.md) and [c](./c.md#top)\n', fromOverview),
			'[a](/admin-ui/a/), [b](/admin-ui/design-system/b/) and [c](/admin-ui/c/#top)\n',
		);
	});

	test('leaves an angle bracket autolink alone', () => {
		const body = 'Go to <https://docs.gopherium.org/plugins/overview/>.\n';

		assert.equal(rewriteLinks(body, fromOverview), body);
	});

	test('leaves an escaped address alone when it does not change', () => {
		const body = 'See [the canvas](#the\\_canvas).\n';

		assert.equal(rewriteLinks(body, fromOverview), body);
	});

	test('fails on an address that is not written as plain text', () => {
		assert.throws(
			() => rewriteLinks('[old](./old\\_lists.md) replaced ./old_lists.md\n', fromOverview),
			/not written as plain text/,
		);
	});
});

describe('convertPage', () => {
	test('adds the godmin edit link to a usage page', () => {
		const source = page('Lists', 'See [screens](./screens.md).\n');

		assert.equal(
			convertPage(source, 'lists.md', release, new Map()),
			[
				'---',
				'title: Lists',
				'description: A page about lists.',
				'editUrl: "https://github.com/gopherium/godmin/edit/main/docs/lists.md"',
				'---',
				'',
				'See [screens](/admin-ui/screens/).',
				'',
			].join('\n'),
		);
	});

	test('adds the sidebar order to a Design System page', () => {
		const order = new Map([['design-system/overview.md', 0], ['design-system/color.md', 1]]);

		assert.equal(
			convertPage(page('Color', 'Back to [the overview](./overview.md).\n'), 'design-system/color.md', release, order),
			[
				'---',
				'title: Color',
				'description: A page about color.',
				'editUrl: "https://github.com/gopherium/godmin/edit/main/docs/design-system/color.md"',
				'sidebar:',
				'  order: 1',
				'---',
				'',
				'Back to [the overview](/admin-ui/design-system/overview/).',
				'',
			].join('\n'),
		);
	});

	test('names the Design System overview Overview in the sidebar', () => {
		const order = new Map([['design-system/overview.md', 0]]);
		const converted = convertPage(page('Design System', 'The rules.\n'), 'design-system/overview.md', release, order);

		assert.match(converted, /\nsidebar:\n {2}label: "Overview"\n {2}order: 0\n---\n/);
	});

	test('adds no sidebar order to a page the overview does not list', () => {
		const order = new Map([['design-system/overview.md', 0]]);
		const converted = convertPage(page('Spacing', 'Gaps.\n'), 'design-system/spacing.md', release, order);

		assert.doesNotMatch(converted, /sidebar:/);
	});

	test('fails on a page without frontmatter', () => {
		assert.throws(() => convertPage('# Lists\n', 'lists.md', release, new Map()), /no frontmatter/);
	});
});

describe('designOrder', () => {
	test('puts the overview first, then each page in the order the overview lists it', () => {
		const body = [
			'Some pages, such as [toasts](./toasts.md), have their own values.',
			'',
			'## The pages',
			'',
			'- [Color](./color.md): the three seeds.',
			'- [Layout](./layout.md#breakpoints): the frame.',
			'- Read [Motion](./motion.md) later.',
			'',
			'Two more pages:',
			'',
			'- [Toasts](./toasts.md): where a toast sits.',
			'- [Back to the start](../overview.md): the usage pages.',
			'- [Color again](./color.md): listed twice.',
			'',
		].join('\n');

		assert.deepEqual(
			[...designOrder(body)],
			[
				['design-system/overview.md', 0],
				['design-system/color.md', 1],
				['design-system/layout.md', 2],
				['design-system/toasts.md', 3],
			],
		);
	});
});

describe('listPages', () => {
	test('lists the Markdown pages under a folder, sorted', () => {
		const folder = scratch();
		writeTree(folder, { 'overview.md': '', 'design-system/color.md': '', 'notes.txt': '' });

		assert.deepEqual(listPages(folder), ['design-system/color.md', 'overview.md']);
	});

	test('fails when the folder holds no pages', () => {
		assert.throws(() => listPages(scratch()), /found no pages/);
	});

	test('fails when the folder does not exist', () => {
		assert.throws(() => listPages(join(scratch(), 'docs')), /found no pages/);
	});
});

describe('copyDocs', () => {
	test('writes every page rewritten and removes pages from an older copy', () => {
		const docs = packageWith({
			'overview.md': page('Overview', 'See [color](./design-system/color.md).\n'),
			'design-system/overview.md': page('Design System', '- [Color](./color.md): the seeds.\n'),
			'design-system/color.md': page('Color', 'Back to [the start](../overview.md#setup).\n'),
		});
		const out = scratch();
		writeTree(out, { 'retired.md': page('Retired', 'Gone.\n') });

		assert.equal(copyDocs(docs, out, release.site), 3);
		assert.equal(existsSync(join(out, 'retired.md')), false);
		assert.match(readFileSync(join(out, 'overview.md'), 'utf8'), /\[color\]\(\/admin-ui\/design-system\/color\/\)/);
		assert.match(readFileSync(join(out, 'design-system/color.md'), 'utf8'), /sidebar:\n {2}order: 1\n/);
		assert.match(
			readFileSync(join(out, 'design-system/color.md'), 'utf8'),
			/editUrl: "https:\/\/github.com\/gopherium\/godmin\/edit\/main\/docs\/design-system\/color.md"/,
		);
	});

	test('fails with zero pages and keeps the older copy', () => {
		const docs = packageWith({});
		const out = scratch();
		writeTree(out, { 'lists.md': page('Lists', 'Rows.\n') });

		assert.throws(() => copyDocs(docs, out, release.site), /found no pages/);
		assert.equal(existsSync(join(out, 'lists.md')), true);
	});

	test('names the page whose link cannot be rewritten', () => {
		const docs = packageWith({ 'lists.md': page('Lists', '[old](./old\\_lists.md)\n') });

		assert.throws(() => copyDocs(docs, scratch(), release.site), /lists\.md: .*not written as plain text/);
	});

	test('names the Design System overview when it has no frontmatter', () => {
		const docs = packageWith({ 'design-system/overview.md': '# Design System\n' });

		assert.throws(
			() => copyDocs(docs, scratch(), release.site),
			/design-system\/overview\.md: the page has no frontmatter/,
		);
	});
});

describe('fill', () => {
	/** The docs site package.json fields the examples pin. */
	const manifest = { config: { godmin: '1.2.4' } };

	/** Returns a download that writes a godmin package with two pages and records each folder it is given. */
	function downloadInto(seen) {
		return (version, folder) => {
			seen.push(folder);
			packageAt(join(folder, 'package'), version, {
				'overview.md': page('Overview', `Release ${version}.\n`),
				'lists.md': page('Lists', 'Rows.\n'),
			});
			return join(folder, 'package');
		};
	}

	test('skips the download when the marker names the pinned version and this script', () => {
		const out = scratch();
		writeTree(out, { 'overview.md': 'Kept.\n', '.godmin-version': `${stamp('1.2.4', 'source')}\n` });
		const seen = [];

		assert.equal(
			fill({ manifest, source: 'source', out, download: downloadInto(seen) }),
			'the pages of godmin 1.2.4 are already in place',
		);
		assert.deepEqual(seen, []);
		assert.equal(readFileSync(join(out, 'overview.md'), 'utf8'), 'Kept.\n');
	});

	test('downloads the new release when the pin moves, then writes the marker and removes the download folder', () => {
		const out = scratch();
		writeTree(out, { 'overview.md': 'Old.\n', '.godmin-version': `${stamp('1.2.3', 'source')}\n` });
		const seen = [];

		assert.equal(
			fill({ manifest, source: 'source', out, download: downloadInto(seen) }),
			'copied 2 pages from godmin 1.2.4',
		);
		assert.equal(seen.length, 1);
		assert.equal(existsSync(seen[0]), false);
		assert.match(readFileSync(join(out, 'overview.md'), 'utf8'), /Release 1\.2\.4\./);
		assert.equal(readFileSync(join(out, '.godmin-version'), 'utf8'), `${stamp('1.2.4', 'source')}\n`);
	});

	test('copies a local docs folder without the pin, writes no marker and removes an older one', () => {
		const docs = packageWith({ 'overview.md': page('Overview', 'Local.\n'), 'lists.md': page('Lists', 'Rows.\n') });
		const out = scratch();
		writeTree(out, { '.godmin-version': `${stamp('1.2.4', 'source')}\n` });
		const seen = [];

		assert.equal(
			fill({ local: docs, manifest: {}, source: 'source', out, download: downloadInto(seen) }),
			`copied 2 pages from ${docs}`,
		);
		assert.deepEqual(seen, []);
		assert.equal(existsSync(join(out, '.godmin-version')), false);
		assert.match(readFileSync(join(out, 'overview.md'), 'utf8'), /Local\./);
	});

	test('removes the download folder when the copy fails', () => {
		const seen = [];
		const download = (version, folder) => {
			seen.push(folder);
			packageAt(join(folder, 'package'), version, {});
			return join(folder, 'package');
		};

		assert.throws(() => fill({ manifest, source: 'source', out: scratch(), download }), /found no pages/);
		assert.equal(seen.length, 1);
		assert.equal(existsSync(seen[0]), false);
	});
});

describe('the script run from the command line', () => {
	test('runs when it is reached through a symlink', () => {
		const link = join(scratch(), 'godmin-docs.mjs');
		symlinkSync(fileURLToPath(new URL('./godmin-docs.mjs', import.meta.url)), link);

		const run = spawnSync(process.execPath, [link], {
			encoding: 'utf8',
			env: { ...process.env, GODMIN_DOCS_DIR: scratch() },
		});

		assert.equal(run.status, 1);
		assert.match(run.stderr, /^godmin-docs: found no pages in /);
	});
});

describe('pack', () => {
	test('packs the pinned release in an empty folder and unpacks it there', () => {
		const calls = [];
		const run = (command, args, options) => {
			calls.push({ command, args, cwd: options.cwd });
			return command === 'npm' ? '[{"filename":"gopherium-godmin-1.2.3.tgz"}]' : '';
		};

		assert.equal(pack('1.2.3', '/work', run), join('/work', 'package'));
		assert.deepEqual(calls, [
			{
				command: 'npm',
				args: ['pack', '@gopherium/godmin@1.2.3', '--pack-destination', '/work', '--ignore-scripts', '--json'],
				cwd: '/work',
			},
			{ command: 'tar', args: ['-xzf', join('/work', 'gopherium-godmin-1.2.3.tgz'), '-C', '/work'], cwd: '/work' },
		]);
	});

	test('fails with a plain message when npm pack fails', () => {
		const run = () => {
			throw new Error('npm error 404 Not Found');
		};

		assert.throws(() => pack('1.2.3', '/work', run), /could not download and unpack @gopherium\/godmin@1\.2\.3/);
	});

	test('names the cause when npm cannot be started', () => {
		const run = () => {
			throw new Error('spawnSync npm ENOENT');
		};

		assert.throws(
			() => pack('1.2.3', '/work', run),
			/^Error: could not download and unpack @gopherium\/godmin@1\.2\.3: spawnSync npm ENOENT\. Check /,
		);
	});
});

describe('pinnedVersion', () => {
	test('reads the version from the config field', () => {
		assert.equal(pinnedVersion({ config: { godmin: '1.2.3' } }), '1.2.3');
	});

	test('fails when the config field is missing', () => {
		assert.throws(() => pinnedVersion({}), /config\.godmin/);
	});
});

describe('repoUrl', () => {
	test('turns the repository field into a web address', () => {
		assert.equal(
			repoUrl({ repository: { url: 'git+https://github.com/gopherium/godmin.git' } }),
			'https://github.com/gopherium/godmin',
		);
	});

	test('fails when the repository field is missing', () => {
		assert.throws(() => repoUrl({}), /repository/);
	});
});

describe('stamp', () => {
	test('changes when the version or the script changes', () => {
		assert.equal(stamp('1.2.3', 'source'), stamp('1.2.3', 'source'));
		assert.notEqual(stamp('1.2.3', 'source'), stamp('1.2.4', 'source'));
		assert.notEqual(stamp('1.2.3', 'source'), stamp('1.2.3', 'changed source'));
	});
});
