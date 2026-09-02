# cdn/

`feynmark.min.js` (and its sourcemap) live here **committed on purpose**, which
is unusual for build output — everything else the build produces goes to
`dist/` and is gitignored.

The reason is jsDelivr's GitHub endpoint. It serves files straight out of this
repository at a given tag:

```
https://cdn.jsdelivr.net/gh/yvvakimoto/feynmark@v0.1.0/cdn/feynmark.min.js
```

There is no package registry in that path, so the file has to exist in the
tagged commit.

**Never edit these by hand.** Regenerate them with:

```bash
npm run build && npm run sync:cdn
```

CI runs `npm run check:cdn`, which rebuilds and fails if what is committed here
differs from a fresh build — a stale copy would otherwise be served to every
user of a pinned URL.
