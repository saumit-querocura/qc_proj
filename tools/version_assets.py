"""Stamp every local script and stylesheet reference in the HTML with a short content hash, e.g.
    <script src="../assets/qc-app.js?v=3f9a1c2b">
The service worker keeps files with ?v= in the browser and serves them with no network wait; when a file changes its hash changes, so
the next page load asks for the new one.  Run this after editing any .js or .css file, before committing:

    python tools/version_assets.py
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = re.compile(r'''(?P<attr>\b(?:src|href))="(?P<url>(?:\.\./)*(?:assets|curavault)/[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"''')


def digest(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def main():
    changed = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "tools", "icons")]
        for name in fn:
            if not name.endswith(".html"):
                continue
            path = os.path.join(dp, name)
            raw = open(path, "rb").read().decode("utf-8")

            def stamp(m):
                target = os.path.normpath(os.path.join(os.path.dirname(path), m.group("url")))
                if not os.path.isfile(target):
                    return m.group(0)
                return '%s="%s?v=%s"' % (m.group("attr"), m.group("url"), digest(target))

            new = REF.sub(stamp, raw)
            if new != raw:
                open(path, "wb").write(new.encode("utf-8"))
                changed += 1
    print("stamped %d page(s)" % changed)


if __name__ == "__main__":
    sys.exit(main())
