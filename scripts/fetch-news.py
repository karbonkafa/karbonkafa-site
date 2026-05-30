#!/usr/bin/env python3
"""
Fetches gaming news from RSS feeds, extracts real article content,
translates to Turkish, creates markdown files.
Runs via GitHub Actions 3x/day.
"""

import feedparser
import requests
import trafilatura
import json
import re
import hashlib
import time
from datetime import datetime
from pathlib import Path
from deep_translator import GoogleTranslator

RSS_FEEDS = {
    'IGN': 'https://feeds.feedburner.com/ign/all',
    'Eurogamer': 'https://www.eurogamer.net/feed',
    'Rock Paper Shotgun': 'https://feeds.feedburner.com/RockPaperShotgun',
}

GAMING_KEYWORDS = [
    'game', 'gaming', 'gamer', 'playstation', 'xbox', 'nintendo', 'steam',
    'pc game', 'console', 'rpg', 'fps', 'indie', 'developer', 'studio',
    'dlc', 'expansion', 'patch', 'update', 'release', 'launch', 'trailer',
    'review', 'gameplay', 'esports', 'mod', 'sequel', 'remaster',
]

CATEGORY_KEYWORDS = {
    'Çıkış':    ['release date', 'out now', 'launch', 'available now', 'now available', 'shipping'],
    'Donanım':  ['hardware', 'gpu', 'cpu', 'steam deck', 'ps5 pro', 'nintendo switch', 'handheld'],
    'Endüstri': ['studio', 'acquisition', 'layoffs', 'laid off', 'sales', 'revenue', 'closes', 'merger'],
    'Bağımsız': ['indie', 'kickstarter', 'small studio', 'solo dev', 'itch.io'],
    'Haftalık': ['weekly', 'roundup', 'best of', 'this week', 'digest'],
}

PROCESSED_PATH = Path('src/data/news-processed.json')
NEWS_DIR = Path('src/content/news')
MAX_PER_RUN = 5
# Max chars to extract from article body (avoid copyright, keep focused)
BODY_MAX_CHARS = 800


def is_gaming_relevant(title: str, summary: str) -> bool:
    text = (title + ' ' + summary).lower()
    return any(kw in text for kw in GAMING_KEYWORDS)


def detect_category(title: str, summary: str) -> str:
    text = (title + ' ' + summary).lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return cat
    return 'Duyuru'


def translate(text: str) -> str:
    if not text.strip():
        return text
    try:
        return GoogleTranslator(source='en', target='tr').translate(text[:500])
    except Exception as e:
        print(f'  Translation error: {e}')
    return text


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text[:50]


def fetch_article_body(url: str, rss_summary: str) -> str:
    """Fetch real article text. Fall back to RSS summary if extraction fails."""
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                no_fallback=False,
            )
            if text and len(text) > 100:
                # Take first BODY_MAX_CHARS worth of meaningful paragraphs
                paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
                body = ''
                for p in paragraphs:
                    if len(body) >= BODY_MAX_CHARS:
                        break
                    body += p + '\n\n'
                return body.strip()
    except Exception as e:
        print(f'  Article fetch error: {e}')
    # Fall back to RSS summary
    return rss_summary


def extract_image(entry) -> str:
    thumbs = getattr(entry, 'media_thumbnail', None)
    if thumbs:
        return thumbs[0].get('url', '')
    for mc in getattr(entry, 'media_content', []):
        if mc.get('type', '').startswith('image/') or mc.get('medium') == 'image':
            return mc.get('url', '')
    for enc in getattr(entry, 'enclosures', []):
        if enc.get('type', '').startswith('image/'):
            return enc.get('href', '')
    content = ''
    for c in getattr(entry, 'content', []):
        content += c.get('value', '')
    content = content or getattr(entry, 'summary', '')
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', content)
    if m:
        return m.group(1)
    return ''


def clean_html(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def load_processed() -> list:
    if PROCESSED_PATH.exists():
        return json.loads(PROCESSED_PATH.read_text())
    return []


def save_processed(processed: list):
    PROCESSED_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROCESSED_PATH.write_text(json.dumps(processed, indent=2))


def main():
    processed = load_processed()
    new_count = 0

    for source_name, feed_url in RSS_FEEDS.items():
        if new_count >= MAX_PER_RUN:
            break

        print(f'Fetching {source_name}...')
        try:
            feed = feedparser.parse(feed_url)
        except Exception as e:
            print(f'Feed error {source_name}: {e}')
            continue

        for entry in feed.entries[:15]:
            if new_count >= MAX_PER_RUN:
                break

            url = entry.get('link', '')
            if not url:
                continue

            url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
            if url_hash in processed:
                continue

            title_en = entry.get('title', '').strip()
            rss_summary = clean_html(entry.get('summary', '') or '')[:300]

            if not is_gaming_relevant(title_en, rss_summary):
                print(f'  Skipping (not gaming): {title_en[:60]}')
                continue

            category = detect_category(title_en, rss_summary)
            image_url = extract_image(entry)
            date_str = datetime.now().strftime('%Y-%m-%d')

            # Fetch real article content
            print(f'  Fetching article: {title_en[:60]}')
            body_en = fetch_article_body(url, rss_summary)
            time.sleep(0.5)

            # Translate title, excerpt (RSS summary), and body separately
            print(f'  Translating...')
            title_tr = translate(title_en)
            time.sleep(0.4)
            excerpt_tr = translate(rss_summary[:250]) if rss_summary else title_tr
            time.sleep(0.4)
            # Translate body in chunks if needed (Google Translate limit 500 chars)
            body_tr = ''
            if body_en:
                chunks = [body_en[i:i+480] for i in range(0, min(len(body_en), 1440), 480)]
                translated_chunks = []
                for chunk in chunks:
                    translated_chunks.append(translate(chunk))
                    time.sleep(0.4)
                body_tr = '\n\n'.join(translated_chunks)

            # Sanitize for YAML frontmatter
            title_tr = title_tr.replace('"', "'").strip()
            excerpt_tr = excerpt_tr.replace('"', "'").strip()
            source_name_clean = source_name.replace('"', "'")

            slug = f"{date_str}-{slugify(title_en)}-{url_hash}"
            filepath = NEWS_DIR / f"{slug}.md"
            image_line = f'image: "{image_url}"' if image_url else ''

            md = f'''---
title: "{title_tr}"
date: {date_str}
category: "{category}"
tags: []
source: "{source_name_clean}"
sourceUrl: "{url}"
excerpt: "{excerpt_tr}"
{image_line}
---

{body_tr or excerpt_tr}

[Kaynağı oku →]({url})
'''
            NEWS_DIR.mkdir(parents=True, exist_ok=True)
            filepath.write_text(md, encoding='utf-8')
            processed.append(url_hash)
            new_count += 1
            print(f'  Created: {slug}')

        save_processed(processed)

    print(f'\nDone. {new_count} new articles added.')


if __name__ == '__main__':
    main()
