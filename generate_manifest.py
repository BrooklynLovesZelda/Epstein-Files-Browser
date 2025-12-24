import argparse
import json
from pathlib import Path
from typing import List, Dict


def build_manifest(root: Path) -> List[Dict[str, str]]:
  """Walk the root directory and return a list of {path, size} entries."""
  entries = []
  root = root.resolve()
  for file_path in sorted(root.rglob("*")):
    if file_path.is_file():
      rel_path = file_path.relative_to(root).as_posix()
      entries.append({"path": f"{root.name}/{rel_path}", "size": file_path.stat().st_size})
  return entries


def write_json(manifest: List[Dict[str, str]], outfile: Path) -> None:
  outfile.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def write_js(manifest: List[Dict[str, str]], outfile: Path) -> None:
  js = "window.__ASSET_MANIFEST__ = " + json.dumps(manifest, indent=2) + ";"
  outfile.write_text(js, encoding="utf-8")


def main() -> None:
  parser = argparse.ArgumentParser(description="Generate assets manifest JSON and JS.")
  parser.add_argument("--root", default="assets", help="Directory to scan (default: assets)")
  parser.add_argument("--json", default="assets-manifest.json", help="Path to write JSON manifest")
  parser.add_argument("--js", default="assets-manifest.js", help="Path to write JS manifest")
  args = parser.parse_args()

  root = Path(args.root)
  if not root.exists() or not root.is_dir():
    raise SystemExit(f"Root directory not found: {root}")

  manifest = build_manifest(root)
  write_json(manifest, Path(args.json))
  write_js(manifest, Path(args.js))
  print(f"Wrote {len(manifest)} entries to {args.json} and {args.js}")


if __name__ == "__main__":
  main()
