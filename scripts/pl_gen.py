"""Batch PixelLab map-object generation against the v2 REST API (the MCP path mode just prints
curl commands; this runs the whole family in one pass, style-anchored to background crops).

Usage: PIXELLAB_TOKEN=... python scripts/pl_gen.py spec.json outdir
spec.json: [{"name": "bush-a", "description": "...", "bg": "crop.png", "width": 192,
             "height": 192, "inpaint": "oval", "fraction": 0.75}, ...]
bg/inpaint optional (omit for basic mode). Downloads each finished PNG to outdir/name.png.
"""
import base64
import json
import os
import sys
import time
import urllib.request

API = "https://api.pixellab.ai/v2/map-objects"


def req(url, data=None, method=None, tries=6):
    payload = json.dumps(data).encode() if data is not None else None
    for attempt in range(tries):
        r = urllib.request.Request(url, method=method)
        r.add_header("Authorization", "Bearer " + os.environ["PIXELLAB_TOKEN"])
        if payload is not None:
            r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, payload) as resp:
                body = resp.read()
                ct = resp.headers.get("Content-Type", "")
                return json.loads(body) if "json" in ct else body
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < tries - 1:
                wait = 8 * (attempt + 1)
                print(f"  429, backing off {wait}s")
                time.sleep(wait)
                continue
            raise


def main():
    spec_path, outdir = sys.argv[1], sys.argv[2]
    specs = json.load(open(spec_path))
    os.makedirs(outdir, exist_ok=True)
    jobs = []
    for s in specs:
        if os.path.exists(os.path.join(outdir, s["name"] + ".png")):
            print(f"skip {s['name']} (already downloaded)")
            continue
        if s.get("id"):  # already queued earlier — poll only
            jobs.append((s["name"], s["id"]))
            print(f"poll-only {s['name']}: {s['id']}")
            continue
        body = {
            "description": s["description"],
            "image_size": {"width": s.get("width", 192), "height": s.get("height", 192)},
            "view": s.get("view", "high top-down"),
            "outline": s.get("outline", "selective outline"),
            "shading": s.get("shading", "medium shading"),
            "detail": s.get("detail", "high detail"),
        }
        if s.get("bg"):
            with open(s["bg"], "rb") as f:
                body["background_image"] = {"base64": base64.b64encode(f.read()).decode()}
            body["inpainting"] = {"type": s.get("inpaint", "oval"), "fraction": s.get("fraction", 0.6)}
        if s.get("seed") is not None:
            body["seed"] = s["seed"]
        r = req(API, body)
        jid = r.get("id") or r.get("object_id") or r.get("data", {}).get("id")
        print(f"queued {s['name']}: {jid}")
        jobs.append((s["name"], jid))
        time.sleep(2)

    pending = dict(jobs)
    t0 = time.time()
    while pending and time.time() - t0 < 600:
        time.sleep(6)
        for name, jid in list(pending.items()):
            try:
                st = req(f"{API}/{jid}")
            except Exception as e:
                print(f"{name}: poll error {e}")
                continue
            status = st.get("status") or st.get("data", {}).get("status")
            if status in ("completed", "complete", "done"):
                png = req(f"{API}/{jid}/download")
                with open(os.path.join(outdir, name + ".png"), "wb") as f:
                    f.write(png)
                print(f"done {name} -> {outdir}/{name}.png")
                del pending[name]
            elif status in ("failed", "error"):
                print(f"FAILED {name}: {json.dumps(st)[:300]}")
                del pending[name]
    for name in pending:
        print(f"TIMEOUT {name}")


if __name__ == "__main__":
    main()
