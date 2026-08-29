// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.gopherium.org',
	integrations: [
		starlight({
			title: 'Gopherium',
			description:
				'Composable Go and React building blocks, extracted from shipping products.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/gopherium' },
			],
			editLink: {
				baseUrl: 'https://github.com/gopherium/docs/edit/main/',
			},
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ slug: 'start/what-is-gopherium' },
						{ slug: 'start/quickstart' },
					],
				},
				{
					label: 'Authentication',
					items: [
						{ slug: 'authentication/overview' },
						{ slug: 'authentication/users-and-passwords' },
						{ slug: 'authentication/sessions-over-http' },
						{ slug: 'authentication/user-administration' },
						{ slug: 'authentication/invites-and-resets' },
						{ slug: 'authentication/persistence' },
						{ slug: 'authentication/rate-limiting' },
						{ slug: 'authentication/react-integration' },
						{ slug: 'authentication/security-model' },
					],
				},
				{
					label: 'Plugins',
					items: [
						{ slug: 'plugins/overview' },
						{ slug: 'plugins/host-lifecycle' },
						{ slug: 'plugins/wiring-and-manifests' },
						{ slug: 'plugins/graphql-plugins' },
					],
				},
				{
					label: 'Admin UI',
					items: [
						{ slug: 'admin-ui/overview' },
						{ slug: 'admin-ui/framing-an-application' },
						{ slug: 'admin-ui/screens' },
						{ slug: 'admin-ui/loading-and-feedback' },
						{ slug: 'admin-ui/testing' },
						{ slug: 'admin-ui/build-and-versioning' },
					],
				},
				{
					label: 'Translations',
					items: [
						{ slug: 'translations/overview' },
						{ slug: 'translations/runtime' },
						{ slug: 'translations/building' },
						{ slug: 'translations/health' },
						{ slug: 'translations/sync' },
					],
				},
				{
					label: 'Mail',
					items: [
						{ slug: 'mail/overview' },
						{ slug: 'mail/templates' },
						{ slug: 'mail/testing' },
					],
				},
				{
					label: 'Testing',
					items: [
						{ slug: 'testing/end-to-end' },
						{ slug: 'testing/coverage-harness' },
					],
				},
				{
					label: 'Deployment',
					items: [{ slug: 'deployment/operations' }],
				},
			],
		}),
	],
});
