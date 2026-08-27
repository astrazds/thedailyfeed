import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmbeddedHeadingLevels,
  normalizeFeedContentAttributes,
  normalizeFeedContentDirection,
  normalizeFeedContentLanguage,
  normalizeFeedContentUrl,
} from '../lib/feed-content-normalization';

test('embedded headings begin at h3 and preserve bounded relative structure', () => {
  assert.deepEqual(
    normalizeEmbeddedHeadingLevels([2, 4, 6, 6, 3, 4, 2, 1]),
    [3, 4, 5, 5, 3, 4, 3, 3]
  );
  assert.deepEqual(normalizeEmbeddedHeadingLevels([]), []);
});

test('feed image attributes preserve useful alt text and strip unsafe attributes', () => {
  const baseUrl = 'https://publisher.example/posts/article';

  assert.deepEqual(
    normalizeFeedContentAttributes(
      'img',
      {
        alt: 'A detailed chart',
        onerror: 'alert(1)',
        src: '/chart',
        srcset: '/chart-small 1x, /chart-large 2x',
        style: 'position:fixed',
      },
      baseUrl
    ),
    {
      alt: 'A detailed chart',
      src: 'https://publisher.example/chart',
    }
  );
  assert.deepEqual(
    normalizeFeedContentAttributes('img', { src: './photo.jpg' }, baseUrl),
    {
      alt: '',
      src: 'https://publisher.example/posts/photo.jpg',
    }
  );
  assert.equal(
    normalizeFeedContentAttributes('img', { alt: 'Unsafe', src: 'data:image/png;base64,AAAA' }, baseUrl),
    null
  );
});

test('feed links resolve safely and retain same-tab nofollow navigation', () => {
  assert.deepEqual(
    normalizeFeedContentAttributes(
      'a',
      {
        href: '../about',
        onclick: 'alert(1)',
        rel: 'opener',
        style: 'color:red',
        target: '_blank',
        title: 'About this publisher',
      },
      'https://publisher.example/posts/article'
    ),
    {
      href: 'https://publisher.example/about',
      rel: 'nofollow',
      title: 'About this publisher',
    }
  );
  assert.deepEqual(
    normalizeFeedContentAttributes(
      'a',
      { href: 'javascript:alert(1)', rel: 'opener', target: '_blank' },
      'https://publisher.example/posts/article'
    ),
    {}
  );
});

test('sanitized content canonicalizes valid language tags and rejects invalid ones', () => {
  assert.equal(normalizeFeedContentLanguage('en-us'), 'en-US');
  assert.equal(normalizeFeedContentLanguage(' zh-hant-tw '), 'zh-Hant-TW');
  assert.equal(normalizeFeedContentLanguage('not_a_language'), null);
  assert.equal(normalizeFeedContentLanguage(''), null);
});

test('sanitized content accepts only supported direction values', () => {
  assert.equal(normalizeFeedContentDirection(' RTL '), 'rtl');
  assert.equal(normalizeFeedContentDirection('ltr'), 'ltr');
  assert.equal(normalizeFeedContentDirection('auto'), 'auto');
  assert.equal(normalizeFeedContentDirection('sideways'), null);
  assert.equal(normalizeFeedContentDirection(''), null);
});

test('feed image URLs resolve against the validated article URL', () => {
  const baseUrl = 'https://publisher.example/posts/today/article.html';

  assert.equal(
    normalizeFeedContentUrl('https://cdn.example/image.jpg', baseUrl, 'image'),
    'https://cdn.example/image.jpg'
  );
  assert.equal(
    normalizeFeedContentUrl('//cdn.example/image.jpg?size=large', baseUrl, 'image'),
    'https://cdn.example/image.jpg?size=large'
  );
  assert.equal(
    normalizeFeedContentUrl('/media/image.jpg', baseUrl, 'image'),
    'https://publisher.example/media/image.jpg'
  );
  assert.equal(
    normalizeFeedContentUrl('../images/image', baseUrl, 'image'),
    'https://publisher.example/posts/images/image'
  );
});

test('feed content URLs fail closed for missing bases and unsupported schemes', () => {
  for (const value of [
    '/image.jpg',
    '../image.jpg',
    'not a valid absolute URL',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:https://publisher.example/id',
    'ftp://publisher.example/image.jpg',
    'mailto:author@publisher.example',
  ]) {
    assert.equal(normalizeFeedContentUrl(value, null, 'image'), null, value);
  }

  assert.equal(
    normalizeFeedContentUrl('mailto:author@publisher.example', null, 'link'),
    'mailto:author@publisher.example'
  );
  assert.equal(
    normalizeFeedContentUrl('/about', 'https://publisher.example/post', 'link'),
    'https://publisher.example/about'
  );
});
