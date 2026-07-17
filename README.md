# Gopherium docs

The documentation site for the [Gopherium](https://github.com/gopherium)
building blocks, published at [docs.gopherium.org](https://docs.gopherium.org).

Built with [Astro Starlight](https://starlight.astro.build). Content
lives in `src/content/docs/`, one Markdown file per page, with the
sidebar defined in `astro.config.mjs`.

## Development

```sh
pnpm install
pnpm dev        # local preview at localhost:4321
pnpm build      # static build into dist/
```

Pushes to `main` deploy to GitHub Pages through
`.github/workflows/deploy.yml`.

## License

Apache-2.0. Copyright © 2026 Manuel 'SirLouen' Camargo.
