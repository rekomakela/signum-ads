import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestImageUrl, cleanTitle, slugForAdPost } from '../src/ingest/reddit-adporn.js';

test('cleanTitle strips NSFW and dimension tags', () => {
  assert.equal(
    cleanTitle('[NSFW] Reality Kings does advertising [720x960]'),
    'Reality Kings does advertising',
  );
  assert.equal(cleanTitle('  Denver Water billboard. [500x700] '), 'Denver Water billboard.');
});

test('bestImageUrl prefers a direct image URL over the preview', () => {
  assert.equal(
    bestImageUrl({
      title: 'x',
      url: 'https://i.redd.it/abc.jpg',
      image: 'https://preview.redd.it/thumb.jpg',
      permalink: '/r/AdPorn/comments/1',
    }),
    'https://i.redd.it/abc.jpg',
  );
  assert.equal(
    bestImageUrl({
      title: 'x',
      url: 'https://imgur.com/a/album',
      image: 'https://external-preview.redd.it/thumb.jpg',
      permalink: '/r/AdPorn/comments/1',
    }),
    'https://external-preview.redd.it/thumb.jpg',
  );
  assert.equal(
    bestImageUrl({
      title: 'x',
      url: 'https://reddit.com/r/AdPorn/comments/1',
      image: null,
      permalink: '/r/AdPorn/comments/1',
    }),
    null,
  );
});

test('slugForAdPost is deterministic and sanitized', () => {
  const slug = slugForAdPost(
    'KFC’s apology for the chicken shortage!!',
    '/r/AdPorn/comments/abc123/',
  );
  assert.ok(slug.startsWith('real-'));
  assert.match(slug, /^real-[a-z0-9-]+-[0-9a-f]{8}$/);
  assert.equal(
    slug,
    slugForAdPost('KFC’s apology for the chicken shortage!!', '/r/AdPorn/comments/abc123/'),
  );
});
