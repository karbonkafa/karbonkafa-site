#!/usr/bin/env python3
"""
Fetches IGDB data for games missing from igdb.json.
Handles two cases:
- Small igdbId: real IGDB ID → query directly
- Large igdbId: Steam App ID → resolve via external_games first
"""
import json, requests, time
from pathlib import Path

CLIENT_ID = 'mxnd29ey6rzdri3n77d89e6i7ps7ov'
CLIENT_SECRET = '2spo7ntyclvq6zwt4jvxanrfqis01h'
GAMES_PATH = Path('src/data/games.json')
IGDB_PATH = Path('src/data/igdb.json')
BATCH = 100

def get_token():
    r = requests.post('https://id.twitch.tv/oauth2/token', params={
        'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
        'grant_type': 'client_credentials'
    })
    return r.json()['access_token']

def igdb_post(token, endpoint, query):
    for attempt in range(3):
        r = requests.post(f'https://api.igdb.com/v4/{endpoint}',
            headers={'Client-ID': CLIENT_ID, 'Authorization': f'Bearer {token}'},
            data=query, timeout=15)
        if r.status_code == 429:
            time.sleep(1.5)
            continue
        if r.ok:
            return r.json()
        print(f'  WARN {endpoint} {r.status_code}: {r.text[:100]}')
        return []
    return []

def resolve_steam_ids(token, steam_ids):
    """Return dict: steam_id -> igdb_id"""
    result = {}
    for i in range(0, len(steam_ids), BATCH):
        chunk = steam_ids[i:i+BATCH]
        uids = ','.join(f'"{uid}"' for uid in chunk)
        rows = igdb_post(token, 'external_games',
            f'fields game,uid,category; where category = 1 & uid = ({uids}); limit 500;')
        for row in rows:
            result[int(row['uid'])] = row['game']
        time.sleep(0.35)
    return result

def fetch_games_batch(token, igdb_ids):
    ids_str = ','.join(str(i) for i in igdb_ids)
    return igdb_post(token, 'games', f"""
fields name,slug,rating,aggregated_rating,total_rating,total_rating_count,
follows,storyline,
screenshots.image_id,artworks.image_id,
videos.video_id,videos.name,
themes.name,game_modes.name,player_perspectives.name,
genres.name,keywords.name,game_engines.name,
franchises.name,collections.name,
involved_companies.company.name,involved_companies.developer,
involved_companies.publisher,involved_companies.supporting,
parent_game.name,parent_game.slug,
dlcs.name,dlcs.slug,
expansions.name,expansions.slug,
websites.url,websites.category,
similar_games.name,similar_games.slug,similar_games.cover.image_id;
where id = ({ids_str}); limit 500;
""")

def fetch_ttb(token, igdb_ids):
    ids_str = ','.join(str(i) for i in igdb_ids)
    rows = igdb_post(token, 'game_time_to_beats',
        f'fields game_id,hastily,normally,completely; where game_id = ({ids_str}); limit 500;')
    result = {}
    for t in rows:
        gid = t.get('game_id') or t.get('game')
        if gid:
            result[gid] = {
                'main': f"{t['normally']//3600}h" if t.get('normally') else None,
                'extra': f"{t['hastily']//3600}h" if t.get('hastily') else None,
                'completionist': f"{t['completely']//3600}h" if t.get('completely') else None,
            }
    return result

def fetch_languages(token, igdb_ids):
    ids_str = ','.join(str(i) for i in igdb_ids)
    rows = igdb_post(token, 'language_supports',
        f'fields game,language.name,language_support_type.name; where game = ({ids_str}); limit 500;')
    result = {}
    for l in rows:
        gid = l.get('game')
        if not gid: continue
        name = l.get('language', {}).get('name', '')
        ltype = l.get('language_support_type', {}).get('name', '').lower()
        if gid not in result:
            result[gid] = {'audio': [], 'subtitles': []}
        if 'audio' in ltype and name not in result[gid]['audio']:
            result[gid]['audio'].append(name)
        elif 'subtitle' in ltype and name not in result[gid]['subtitles']:
            result[gid]['subtitles'].append(name)
    return result

WEBSITE_CAT = {1:'official',3:'wikipedia',9:'youtube',6:'twitch',
    13:'steam',15:'itch',16:'epic',17:'gog',18:'discord',14:'reddit'}

def parse_game(g):
    devs, supporting, pubs = [], [], []
    for ic in g.get('involved_companies', []):
        n = ic.get('company', {}).get('name', '')
        if ic.get('developer'): devs.append(n)
        if ic.get('supporting'): supporting.append(n)
        if ic.get('publisher'): pubs.append(n)
    websites = {WEBSITE_CAT[w['category']]: w['url']
        for w in g.get('websites', []) if w.get('category') in WEBSITE_CAT}
    return {
        'rating': round(g['rating'], 1) if g.get('rating') else None,
        'aggregatedRating': round(g['aggregated_rating'], 1) if g.get('aggregated_rating') else None,
        'totalRating': round(g['total_rating'], 1) if g.get('total_rating') else None,
        'follows': g.get('follows'),
        'storyline': g.get('storyline'),
        'screenshots': [s['image_id'] for s in g.get('screenshots', []) if s.get('image_id')],
        'artworks': [a['image_id'] for a in g.get('artworks', []) if a.get('image_id')],
        'videos': [{'id': v['video_id'], 'name': v.get('name', '')} for v in g.get('videos', []) if v.get('video_id')],
        'themes': [t['name'] for t in g.get('themes', [])],
        'gameModes': [m['name'] for m in g.get('game_modes', [])],
        'perspectives': [p['name'] for p in g.get('player_perspectives', [])],
        'genres': [gen['name'] for gen in g.get('genres', [])],
        'keywords': [k['name'] for k in g.get('keywords', [])[:20]],
        'engines': [e['name'] for e in g.get('game_engines', [])],
        'franchises': [f['name'] for f in g.get('franchises', [])],
        'collections': [c['name'] for c in g.get('collections', [])],
        'mainDevs': devs, 'supportingDevs': supporting, 'publishers': pubs,
        'parentGame': {'name': g['parent_game']['name'], 'slug': g['parent_game']['slug']} if g.get('parent_game') else None,
        'dlcs': [{'name': d['name'], 'slug': d.get('slug', '')} for d in g.get('dlcs', [])],
        'expansions': [{'name': e['name'], 'slug': e.get('slug', '')} for e in g.get('expansions', [])],
        'websites': websites,
        'languages': {'audio': [], 'subtitles': []},
        'similarGames': [{'name': s['name'], 'slug': s['slug'],
            'cover': s.get('cover', {}).get('image_id')}
            for s in g.get('similar_games', []) if s.get('name') and s.get('slug')],
        'timeToBeat': {},
    }

def main():
    games = json.loads(GAMES_PATH.read_text())
    igdb_data = json.loads(IGDB_PATH.read_text())

    missing = [(g['slug'], g['igdbId']) for g in games
               if g.get('igdbId') and not igdb_data.get(g['slug']) and not g.get('dlc')]
    print(f'Missing: {len(missing)} games')

    token = get_token()

    # Split: small IDs = real IGDB IDs, large IDs = Steam App IDs
    real_igdb = [(slug, iid) for slug, iid in missing if iid < 500000]
    steam_ids  = [(slug, iid) for slug, iid in missing if iid >= 500000]
    print(f'  Real IGDB IDs: {len(real_igdb)}')
    print(f'  Steam App IDs (need resolution): {len(steam_ids)}')

    # Resolve Steam App IDs → IGDB IDs
    slug_to_igdb = {slug: iid for slug, iid in real_igdb}
    if steam_ids:
        print('Resolving Steam App IDs...')
        steam_map = resolve_steam_ids(token, [iid for _, iid in steam_ids])
        resolved = 0
        for slug, steam_id in steam_ids:
            if steam_id in steam_map:
                slug_to_igdb[slug] = steam_map[steam_id]
                resolved += 1
        print(f'  Resolved {resolved}/{len(steam_ids)} Steam IDs')

    # Also try slug-based lookup for unresolved games
    unresolved_slugs = [slug for slug, iid in steam_ids if slug not in slug_to_igdb]
    if unresolved_slugs:
        print(f'Trying slug lookup for {len(unresolved_slugs)} unresolved...')
        for i in range(0, len(unresolved_slugs), 50):
            chunk = unresolved_slugs[i:i+50]
            slug_list = ','.join(f'"{s}"' for s in chunk)
            rows = igdb_post(token, 'games',
                f'fields id,slug; where slug = ({slug_list}); limit 100;')
            for row in rows:
                if row.get('slug') in chunk:
                    slug_to_igdb[row['slug']] = row['id']
            time.sleep(0.35)
        print(f'  Total with IGDB ID: {len(slug_to_igdb)}')

    # Now fetch full data in batches
    items = list(slug_to_igdb.items())
    updated = 0
    for i in range(0, len(items), BATCH):
        batch = items[i:i+BATCH]
        slugs_batch = [s for s, _ in batch]
        ids_batch = [iid for _, iid in batch]
        print(f'Fetching batch {i//BATCH+1}/{(len(items)-1)//BATCH+1} ({len(batch)} games)...')

        results = fetch_games_batch(token, ids_batch)
        time.sleep(0.35)
        ttb = fetch_ttb(token, ids_batch)
        time.sleep(0.35)
        langs = fetch_languages(token, ids_batch)
        time.sleep(0.35)

        igdb_id_to_slug = {iid: slug for slug, iid in batch}
        for g in results:
            gid = g.get('id')
            slug = igdb_id_to_slug.get(gid)
            if not slug:
                continue
            parsed = parse_game(g)
            parsed['timeToBeat'] = ttb.get(gid, {})
            parsed['languages'] = langs.get(gid, {'audio': [], 'subtitles': []})
            igdb_data[slug] = parsed
            updated += 1

        IGDB_PATH.write_text(json.dumps(igdb_data, indent=2, ensure_ascii=False))
        print(f'  {updated} enriched so far')

    print(f'\nDone. {updated}/{len(items)} games enriched.')

if __name__ == '__main__':
    main()
