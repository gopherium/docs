import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromMarkdown } from 'mdast-util-from-markdown';

/** The npm package that holds the Admin UI pages. */
const PACKAGE = '@gopherium/godmin';

/** The address of the docs site, the same as `site` in astro.config.mjs. */
const SITE = 'https://docs.gopherium.org';

/** The folder of the docs site that the pages are copied into. */
const SECTION = 'admin-ui';

/** The folder of the Design System pages inside the godmin docs folder. */
const DESIGN = 'design-system';

/** The Design System page that lists the others. */
const OVERVIEW = `${DESIGN}/overview.md`;

/** The docs site package.json, which holds the pinned godmin version. */
const MANIFEST = fileURLToPath(new URL('../package.json', import.meta.url));

/** The gitignored folder the pages are written to. */
const OUT = fileURLToPath(new URL(`../src/content/docs/${SECTION}/`, import.meta.url));

/** The file in the Admin UI folder that records which release and which script wrote the pages. */
const MARKER = '.godmin-version';

/** Returns the godmin version pinned in the docs site package.json. */
export function pinnedVersion(manifest) {
	const version = manifest.config?.godmin;
	if (!version) throw new Error('package.json has no config.godmin version to copy the pages from');
	return version;
}

/** Returns the web address of the repository named in a package.json. */
export function repoUrl(manifest) {
	const url = manifest.repository?.url;
	if (!url) throw new Error('the godmin package.json has no repository url');
	return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** Returns the marker text for a godmin version and the source of this script. */
export function stamp(version, source) {
	return `${version} ${createHash('sha256').update(source).digest('hex')}`;
}

/** Returns the docs site address for a link found in a godmin page. */
export function mapUrl(url, page, release) {
	if (url === release.site || url.startsWith(`${release.site}/`)) return url.slice(release.site.length) || '/';
	if (/^([a-z][a-z0-9+.-]*:|[#/])/i.test(url)) return url;
	const hashAt = url.includes('#') ? url.indexOf('#') : url.length;
	const target = posix.normalize(posix.join(posix.dirname(page), url.slice(0, hashAt)));
	const hash = url.slice(hashAt);
	if (!target.startsWith('../') && target.endsWith('.md')) return `/${SECTION}/${target.slice(0, -3)}/${hash}`;
	const path = posix.normalize(posix.join('docs', target));
	if (path.startsWith('../')) throw new Error(`the link ${url} leaves the godmin package`);
	return `${release.repo}/blob/v${release.version}/${path}${hash}`;
}

/** Returns a node followed by every node under it, in document order. */
function flatten(node) {
	return [node, ...(node.children ?? []).flatMap(flatten)];
}

/** Returns where the address of a link node sits in body, failing when it is not written as plain text. */
function urlSpan(body, node) {
	const opening = node.position.start.offset;
	const from =
		node.type === 'link' ? (node.children.at(-1)?.position.end.offset ?? opening) : body.indexOf(']:', opening);
	const start = body.indexOf(node.url, from);
	if (start === -1 || start + node.url.length > node.position.end.offset) {
		throw new Error(`the link ${node.url} is not written as plain text`);
	}
	return { start, end: start + node.url.length };
}

/** Returns body with the address of every link and link definition passed through map, angle bracket autolinks left alone. */
export function rewriteLinks(body, map) {
	const edits = flatten(fromMarkdown(body))
		.filter((node) => (node.type === 'link' || node.type === 'definition') && body[node.position.start.offset] !== '<')
		.map((node) => ({ node, url: map(node.url) }))
		.filter(({ node, url }) => url !== node.url)
		.map(({ node, url }) => ({ ...urlSpan(body, node), url }));
	return edits
		.sort((a, b) => b.start - a.start)
		.reduce((text, { start, end, url }) => text.slice(0, start) + url + text.slice(end), body);
}

/** Splits a page into the text inside its frontmatter fences and the Markdown after them. */
function splitPage(source) {
	const match = /^---\n([\s\S]*?\n)---\n/.exec(source);
	if (!match) throw new Error('the page has no frontmatter');
	return { frontmatter: match[1], body: source.slice(match[0].length) };
}

/** Returns the sidebar order of each Design System page, from the list items of the overview that open with a link. */
export function designOrder(overviewBody) {
	const names = flatten(fromMarkdown(overviewBody))
		.filter((node) => node.type === 'listItem')
		.map((item) => item.children[0]?.children?.[0])
		.filter((first) => first?.type === 'link')
		.map((link) => /^\.\/([a-z0-9-]+)\.md(#|$)/.exec(link.url)?.[1])
		.filter(Boolean);
	return new Map([...new Set(['overview', ...names])].map((name, order) => [`${DESIGN}/${name}.md`, order]));
}

/** Returns the frontmatter lines that place a page in the Design System sidebar group. */
function sidebarLines(page, order) {
	if (!order.has(page)) return [];
	const label = page === OVERVIEW ? [`  label: ${JSON.stringify('Overview')}`] : [];
	return ['sidebar:', ...label, `  order: ${order.get(page)}`];
}

/** Turns the source of one godmin page into its docs site page. */
export function convertPage(source, page, release, order) {
	const { frontmatter, body } = splitPage(source);
	const lines = [`editUrl: ${JSON.stringify(`${release.repo}/edit/main/docs/${page}`)}`, ...sidebarLines(page, order)];
	return `---\n${frontmatter}${lines.join('\n')}\n---\n${rewriteLinks(body, (url) => mapUrl(url, page, release))}`;
}

/** Returns the path of every Markdown page under a folder, sorted, failing when there is none. */
export function listPages(folder) {
	const names = existsSync(folder) ? readdirSync(folder, { recursive: true, encoding: 'utf8' }) : [];
	const pages = names.filter((name) => name.endsWith('.md')).sort();
	if (pages.length === 0) throw new Error(`found no pages in ${folder}`);
	return pages;
}

/** Returns what read returns, naming the page in front of any error it throws. */
function forPage(page, read) {
	try {
		return read();
	} catch (error) {
		throw new Error(`${page}: ${error.message}`, { cause: error });
	}
}

/** Writes every page of a godmin docs folder into out, rewritten for the docs site, and returns how many. */
export function copyDocs(docs, out, site) {
	const pages = listPages(docs);
	const manifest = JSON.parse(readFileSync(join(docs, '..', 'package.json'), 'utf8'));
	const release = { site, repo: repoUrl(manifest), version: manifest.version };
	const overview = join(docs, OVERVIEW);
	const order = designOrder(
		existsSync(overview) ? forPage(OVERVIEW, () => splitPage(readFileSync(overview, 'utf8')).body) : '',
	);
	const converted = pages.map((page) => [
		page,
		forPage(page, () => convertPage(readFileSync(join(docs, page), 'utf8'), page, release, order)),
	]);
	rmSync(out, { recursive: true, force: true });
	for (const [page, text] of converted) {
		mkdirSync(dirname(join(out, page)), { recursive: true });
		writeFileSync(join(out, page), text);
	}
	return pages.length;
}

/** Downloads and unpacks the godmin release into folder, and returns the unpacked package folder. */
export function pack(version, folder, run = execFileSync) {
	const spec = `${PACKAGE}@${version}`;
	const options = { cwd: folder, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
	try {
		const [{ filename }] = JSON.parse(
			run('npm', ['pack', spec, '--pack-destination', folder, '--ignore-scripts', '--json'], options),
		);
		run('tar', ['-xzf', join(folder, filename), '-C', folder], options);
	} catch (error) {
		throw new Error(
			`could not download and unpack ${spec}: ${error.message}. Check the version in package.json and the network.`,
			{ cause: error },
		);
	}
	return join(folder, 'package');
}

/** Fills the out folder from a local docs folder or the pinned release, and returns what it did. */
export function fill({ local, manifest, source, out, download = pack }) {
	if (local) {
		const folder = resolve(local);
		return `copied ${copyDocs(folder, out, SITE)} pages from ${folder}`;
	}
	const version = pinnedVersion(manifest);
	const current = stamp(version, source);
	const marker = join(out, MARKER);
	if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === current) {
		return `the pages of godmin ${version} are already in place`;
	}
	const folder = mkdtempSync(join(tmpdir(), 'godmin-docs-'));
	try {
		const count = copyDocs(join(download(version, folder), 'docs'), out, SITE);
		writeFileSync(marker, `${current}\n`);
		return `copied ${count} pages from godmin ${version}`;
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

/** Fills the Admin UI folder from GODMIN_DOCS_DIR or the pinned release, and prints what it did. */
function main() {
	const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
	const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
	console.log(`godmin-docs: ${fill({ local: process.env.GODMIN_DOCS_DIR, manifest, source, out: OUT })}`);
}

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		console.error(`godmin-docs: ${error.message}`);
		process.exitCode = 1;
	}
}
