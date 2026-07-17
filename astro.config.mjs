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
						{ slug: 'authentication/persistence' },
						{ slug: 'authentication/rate-limiting' },
						{ slug: 'authentication/react-integration' },
						{ slug: 'authentication/security-model' },
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
