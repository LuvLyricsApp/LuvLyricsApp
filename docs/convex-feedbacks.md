# Bug reports → Convex `feedbacks` table

The app's About sheet (Stream → ✦ at the top right) sends bug reports to the
Convex project **luvlyricsweb** — the one the website (allegravibe) already
uses, deployment `charming-jaguar-140`. The app calls one public mutation,
`feedbacks:send`, over Convex's HTTP API (`src/services/feedback.ts`); there is
no Convex SDK in the app.

**Add these files to the website repo** (`.website-production/allegra aws/convex/`),
not to this repo. A Convex deploy replaces *every* function in the deployment,
so deploying a `convex/` folder from the app repo would wipe the website's
auth, profiles and shares.

## 1. `convex/schema.ts` — add the table

Inside `defineSchema({ ... })`, next to `oauthGrants`:

```ts
  /** Bug reports from the LuvLyrics app (About → Found a bug?). Read weekly, then deleted. */
  feedbacks: defineTable({
    message: v.string(),
    contact: v.optional(v.string()),
    appVersion: v.string(),
    platform: v.string(),
    osVersion: v.string(),
    createdAt: v.number()
  }).index('by_createdAt', ['createdAt']),
```

## 2. `convex/feedbacks.ts` — new file

```ts
import { v } from 'convex/values';

import { internalMutation, internalQuery, mutation } from './_generated/server';

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 2000;
const CONTACT_MAX = 200;
const SHORT_MAX = 40;
/** A backstop against a flood: past this many unread reports, new ones are turned away. */
const TABLE_CAP = 5000;

/** The only public function: the app sends one report. Everything is checked again here. */
export const send = mutation({
  args: {
    message: v.string(),
    contact: v.optional(v.string()),
    appVersion: v.string(),
    platform: v.string(),
    osVersion: v.string()
  },
  handler: async (ctx, args) => {
    const message = args.message.trim();
    const contact = args.contact?.trim() || undefined;
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) throw new Error('Bad message length');
    if (contact && contact.length > CONTACT_MAX) throw new Error('Contact too long');
    if ([args.appVersion, args.platform, args.osVersion].some(s => s.length > SHORT_MAX)) throw new Error('Bad metadata');

    const stored = await ctx.db.query('feedbacks').take(TABLE_CAP);
    if (stored.length >= TABLE_CAP) throw new Error('Inbox full');

    await ctx.db.insert('feedbacks', {
      message,
      contact,
      appVersion: args.appVersion,
      platform: args.platform,
      osVersion: args.osVersion,
      createdAt: Date.now()
    });
    return null;
  }
});

/** Newest first. Internal: only you, from the CLI or the dashboard. */
export const list = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    ctx.db.query('feedbacks').withIndex('by_createdAt').order('desc').take(Math.min(limit ?? 100, 500))
});

/** Delete one report once it is handled. */
export const remove = internalMutation({
  args: { id: v.id('feedbacks') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return null;
  }
});

/** The weekly clear-out: deletes everything sent before `before` (ms since epoch; default now). */
export const clear = internalMutation({
  args: { before: v.optional(v.number()) },
  handler: async (ctx, { before }) => {
    const cutoff = before ?? Date.now();
    const old = await ctx.db
      .query('feedbacks')
      .withIndex('by_createdAt', q => q.lt('createdAt', cutoff))
      .take(1000);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  }
});
```

## 3. Commands

From the website repo:

```bash
cd "C:/Users/nithy/Desktop/.website-production/allegra aws"
npx convex dev --once          # pushes to the dev deployment (charming-jaguar-140) the app points at
```

When the website goes to production, deploy there and point the app at it:

```bash
npx convex deploy              # production deployment of luvlyricsweb
```

then in this repo's `.env`: `EXPO_PUBLIC_CONVEX_URL=https://<prod-deployment>.convex.cloud`
(without it the app uses `https://charming-jaguar-140.convex.cloud`).

The weekly read and clear-out:

```bash
npx convex run feedbacks:list                  # newest 100 reports
npx convex run feedbacks:remove '{"id":"<id>"}'  # one, once it is fixed
npx convex run feedbacks:clear                 # everything so far
```

(Add `--prod` to any of these for the production deployment.)

## Test it

Once `feedbacks.ts` is deployed:

```bash
curl -s https://charming-jaguar-140.convex.cloud/api/mutation \
  -H "Content-Type: application/json" \
  -d '{"path":"feedbacks:send","args":{"message":"test from curl","appVersion":"1.0.0","platform":"android","osVersion":"36"},"format":"json"}'
```

should print `{"status":"success","value":null}`.
