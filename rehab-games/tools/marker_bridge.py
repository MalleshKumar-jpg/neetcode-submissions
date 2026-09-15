#!/usr/bin/env python3
"""
WebSocket -> Lab Streaming Layer bridge for the rehab epoch games.

The browser cannot open an LSL outlet or hit a parallel port, so it posts each
marker as one JSON object over a WebSocket and this process republishes it on
an LSL stream your recorder can pick up alongside the EEG.

    pip install websockets pylsl
    python marker_bridge.py --port 8765

Then put ws://localhost:8765 in the game's "Marker socket" field.

Timing note: the browser stamps t_perf_ms inside the requestAnimationFrame
callback that draws the change. Everything after that -- compositing, the
display's own pipeline -- is unmeasured. Use the photodiode patch to find that
offset once for your machine and monitor, then correct for it offline. Do not
assume it is zero, and do not assume it is stable across machines.
"""
import argparse
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    sys.exit("pip install websockets")

try:
    from pylsl import StreamInfo, StreamOutlet, local_clock
    HAVE_LSL = True
except ImportError:
    HAVE_LSL = False
    print("pylsl not found - running in echo-only mode", file=sys.stderr)


def make_outlet(name, source_id):
    info = StreamInfo(name, "Markers", 1, 0, "string", source_id)
    desc = info.desc().append_child("marker_fields")
    for field in ("label", "trial", "side", "phase", "t_perf_ms", "t_unix_ms"):
        desc.append_child("field").append_child_value("name", field)
    return StreamOutlet(info)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--name", default="RehabEpochMarkers")
    ap.add_argument("--source-id", default="rehab-epoch-1")
    ap.add_argument("--log", default="", help="also append raw JSON lines here")
    args = ap.parse_args()

    outlet = make_outlet(args.name, args.source_id) if HAVE_LSL else None
    logfile = open(args.log, "a", buffering=1) if args.log else None

    async def handler(ws):
        peer = getattr(ws, "remote_address", "?")
        print(f"[bridge] client connected: {peer}", file=sys.stderr)
        try:
            async for raw in ws:
                try:
                    row = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if outlet:
                    # push_sample stamps with local_clock() by default, which is
                    # what the recorder aligns against.
                    outlet.push_sample([json.dumps(row, separators=(",", ":"))], local_clock())
                if logfile:
                    logfile.write(raw if isinstance(raw, str) else raw.decode() + "\n")
                label = row.get("label", "?")
                trial = row.get("trial", "-")
                print(f"[marker] trial={trial} {label}", file=sys.stderr)
        finally:
            print(f"[bridge] client gone: {peer}", file=sys.stderr)

    print(f"[bridge] listening on ws://{args.host}:{args.port}"
          f"{' -> LSL ' + args.name if outlet else ' (echo only)'}", file=sys.stderr)
    async with websockets.serve(handler, args.host, args.port):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
