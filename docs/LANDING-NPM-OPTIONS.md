# Landing page — npm references during the unpublish window

Context: the seven `@pdfcraft/*` packages were published to npm during
the initial rebrand, then **unpublished** so the landing page and the
live demo (at `editable-pdf.onrender.com`) can carry the story before
the package surface is locked in. The packages will be re-published
later under whatever name/scope you finalize.

While the unpublish window is open, the landing page (`apps/landing/`)
still contains three references that point at npm:

  1. **"View on npm" buttons** in the hero, in the enterprise section,
     and in the final CTA block.
  2. **The install code block** at the top of the hero: `pnpm add
     @pdfcraft/engine @pdfcraft/ui-react @pdfcraft/ui-adapter-mui`
  3. **The Packages table** listing all seven `@pdfcraft/*` package
     names with their descriptions.

If a visitor copies the install line right now, they get an `E404` and
think the project is broken. That's the problem these three options
address.

---

## Option A — Soft "Coming soon" badge

**What it does**

Leave every visible mention of `@pdfcraft/*` in place — the install
block, the packages table, all the "View on npm" buttons — but add a
small badge directly above the install code reading:

> 🛈 **npm packages — coming soon.** Publishing the 1.0 GA later this
> quarter. For early access, clone the repo and use the local-file
> approach described in [docs/ENTERPRISE-INTEGRATION.md](./ENTERPRISE-INTEGRATION.md).

The "View on npm" buttons each get a similar inline label or a
tooltip ("Coming with 1.0 GA").

**When it's useful**

- You want to keep the marketing story intact — the page still reads
  as a complete, finished product.
- You want to set expectations so a visitor who copies `pnpm add`
  knows *why* it doesn't work and has a clear next step.
- You expect to re-publish within weeks, not months — a "coming soon"
  promise that drags on for a year hurts more than helps.
- You want backers / contributors / first customers to see exactly
  what's planned without you having to write that copy somewhere else.

**When it's a bad fit**

- If your launch timeline is uncertain ("coming soon" rots fast).
- If you'd rather not advertise that you're not yet on npm at all.

**How to implement**

In `apps/landing/index.html`, find the `.hero__install` block:

```html
<pre class="hero__install"><code>...</code></pre>
```

Wrap it with a sibling badge:

```html
<p class="hero__badge">
  🛈 <strong>npm packages — coming soon.</strong>
  Publishing the 1.0 GA later this quarter.
  <a href="https://github.com/novaai0401-ui/editable-pdf/blob/main/docs/ENTERPRISE-INTEGRATION.md">
    Use locally
  </a>
  meanwhile.
</p>
<pre class="hero__install"><code>...</code></pre>
```

Add a `.hero__badge` rule in `style.css` styled like an inline alert
(amber background, dark amber text, soft border). The current
implementation of this option is shipped — see Track FF3.

**How to revert / move to B or C later**

Delete the `.hero__badge` paragraph. If you want B as well, see B's
implementation notes.

---

## Option B — Hide every npm reference

**What it does**

Strip the page back to a "product demo" story only:

- Remove the install code block from the hero.
- Remove the third hero CTA button ("View on npm").
- Remove the "View on npm" button from the enterprise section.
- Remove the "Browse on npm" button from the final CTA section.
- Remove the **Packages table** section entirely.
- Replace the in-paragraph install snippet under "Install · Three
  lines from `npm i` to live editor" with a different value-prop
  ("Try the live demo, no signup required").

**When it's useful**

- You don't yet have a public release timeline.
- You want the page to feel done and shippable today — no "soon"
  promises.
- You'd rather collect signups / leads first, then publish to npm
  once you know the API is stable.
- Lead-gen flow: visitor lands on page → clicks "Try demo" → uses
  product → fills a contact form to "get early API access".

**When it's a bad fit**

- Developers who land on the page won't know they *could* install
  it — you're hiding a key part of the proposition.
- If you eventually publish, you have to revert this option (mostly
  re-add everything that was removed).

**How to implement**

In `apps/landing/index.html`:

```diff
- <pre class="hero__install"><code>...pnpm add @pdfcraft/...</code></pre>
+ <!-- npm install block removed; coming with 1.0 GA -->
```

```diff
- <a class="btn btn--ghost" href="https://www.npmjs.com/package/@pdfcraft/engine"
-    target="_blank" rel="noopener">View on npm</a>
+ <!-- "View on npm" button removed during pre-publish phase -->
```

Repeat for the enterprise + CTA sections. Delete the `<section
id="packages" class="packages">…</section>` block entirely (or wrap
it in `<!-- … -->` so re-adding later is grep-friendly).

Replace the **Install section** content with a different lede:

```html
<section id="install" class="install">
  <div class="wrap">
    <h2 class="section-title">Try it now, integrate later.</h2>
    <p class="muted">The live demo above runs every feature you'd get
      from the npm packages — encrypted-PDF round-trip, form fill,
      add fields, sign, save. Get a feel for the surface and tell us
      what your stack looks like when you're ready to ship.</p>
    <a class="btn btn--primary" href="/app/">Open the demo →</a>
  </div>
</section>
```

**How to revert / move to A or C later**

Restore the lines that were removed. The simplest way is to revert
the commit that introduced B — or pull from `stable/pre-form-layout`
which retains the pre-FF3 state.

---

## Option C — Leave it as-is (broken installs, intentional)

**What it does**

Nothing. The landing page stays exactly as currently shipped: the
install command, packages table, and three "View on npm" buttons all
display, but none of them resolve to anything (404 from npm,
unresolvable `pnpm add`).

**When it's useful**

- You're publishing to npm again **today or tomorrow** with the same
  scope/names — any "coming soon" copy would be obsolete by the time
  visitors arrive.
- The landing page is for internal review / demo-day stakeholders
  only and won't be linked publicly until packages are back live.
- You have analytics in place and want to measure how many people
  actually copy the install line vs. just click the demo button —
  letting it fail and observing is the cheapest experiment.

**When it's a bad fit**

- Production traffic from devs trying to evaluate. They'll bounce.

**How to implement**

No changes needed. The current `apps/landing/index.html` is already
option C.

**How to revert / move to A or B later**

Apply A's badge or B's removal as documented above.

---

## Decision matrix

| Question | Pick |
|---|---|
| Re-publishing this week? | A or C |
| Re-publishing this month or this quarter? | A |
| Re-publishing date unknown? | B |
| Selling a vision / measurable signups before code? | B |
| Closed early-access? | B + replace install line with "Request access" |
| Internal stakeholder demo only? | C |
| Want to look polished + shippable today? | A or B |

---

## Current state (as of this commit)

**Option A is shipped.** The `apps/landing/index.html` carries the
"Coming soon" badge above the hero install block, the packages-table
section stays visible (so visitors see the full scope of what's
planned), and all three "View on npm" buttons gain a `title=`
attribute tooltip explaining the temporary state.

If you decide to switch to B or C, this doc has the exact diff. The
backup branch `stable/pre-form-layout` snapshots the state *before*
even option A was applied — if you want zero-touch C, check that out
to a new branch and deploy from there.

---

## When you're ready to re-publish

1. **Bump version** in every `packages/*/package.json` from
   `1.0.0-rc.0` to `1.0.0-rc.1` (npm refuses to re-publish the same
   version+name within 24h of an unpublish).
2. **Re-add the npm auth token** to `.npmrc` (locally, never
   committed — `.npmrc` is gitignored for this reason).
3. Run `pnpm -r publish --access public --no-git-checks`.
4. **Remove option A's badge** from `apps/landing/index.html` (one
   delete) and push.
5. Render auto-redeploys with a clean, npm-live landing page.

Total: about 10 minutes once the API surface is stable enough to
commit to.
