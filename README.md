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
pnpm test       # tests for the scripts in scripts/
```

Pushes to `main` deploy to GitHub Pages through
`.github/workflows/deploy.yml`.

## Admin UI pages

The Admin UI pages come from the
[godmin](https://github.com/gopherium/godmin) package, at the version
in `config.godmin` in `package.json`. `scripts/godmin-docs.mjs` runs
before `dev`, `start` and `build`. It downloads that release with
`npm pack` and copies its `docs/` pages into
`src/content/docs/admin-ui/`, which git ignores.

To change one of these pages, edit it in the godmin repository. The
edit link on each page goes there. Once a godmin release carries the
change, move the pin:

1. Set `config.godmin` in `package.json` to the new version.
2. Run `pnpm build` with `GODMIN_DOCS_DIR` unset, and check that the
   links check passes.
3. Commit `package.json`.

To preview godmin pages that are not released yet, set
`GODMIN_DOCS_DIR` in `.env` to the `docs` folder of a godmin checkout.

## License

Apache-2.0. Copyright © 2026 Manuel 'SirLouen' Camargo.
