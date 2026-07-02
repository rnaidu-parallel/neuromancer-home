# neuromancer-home

Single-page portfolio at **neuromancer.in**. The page is styled as an agent run —
a "TRACE" that answers the query `who is rahul?` span by span as you scroll:
plan → tool calls → memory → eval → answer.

## Stack

- **Astro v6**, static output, TypeScript. No client frameworks.
- **GSAP + Lenis** for scroll-driven motion (smooth scroll + scroll triggers),
  gated behind `prefers-reduced-motion`.
- **Vanilla CSS** with design tokens (`src/styles/tokens.css`) — no Tailwind.
- Type: **Commit Mono** (machine voice) + **General Sans** (human voice),
  both self-hosted.

## Run

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run preview  # serve the built site
```

## Deploy

Hosted on Vercel — auto-deploys on push to the default branch.
