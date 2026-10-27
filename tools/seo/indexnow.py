# -*- coding: utf-8 -*-
"""Tell IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds ChatGPT search and Copilot) that pages
on querocura.com are new or changed, so they are crawled within minutes instead of days.

    python tools/seo/indexnow.py            # every URL in sitemap.xml
    python tools/seo/indexnow.py URL ...    # only these

Only run it after the pages are live (pushed and published).  The key in tools/seo/indexnow_key.txt is public by
design: the same key is served at https://querocura.com/<key>.txt to prove we own the site.
"""
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
HOST = "querocura.com"


def main(argv):
    key = open(os.path.join(HERE, "indexnow_key.txt"), encoding="utf-8").read().strip()
    if not os.path.isfile(os.path.join(ROOT, key + ".txt")):
        print("missing key file %s.txt at the site root" % key)
        return 1
    urls = argv or re.findall(r"<loc>([^<]+)</loc>", open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read())
    urls = [u for u in urls if u.startswith("https://%s/" % HOST)]
    body = json.dumps({"host": HOST, "key": key, "keyLocation": "https://%s/%s.txt" % (HOST, key), "urlList": urls[:10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("IndexNow: HTTP %d for %d URLs" % (r.status, len(urls)))
            return 0 if r.status in (200, 202) else 1
    except urllib.error.HTTPError as exc:
        print("IndexNow: HTTP %d %s" % (exc.code, exc.read()[:300]))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
