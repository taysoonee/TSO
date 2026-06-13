import os
import subprocess
from pathlib import Path

def get_birthtime(path):
    try:
        # stat -f %B returns birthtime (creation time) as epoch
        result = subprocess.run(['stat', '-f', '%B', str(path)], capture_output=True, text=True, check=True)
        return int(result.stdout.strip())
    except:
        return None

def holy_grail_restore():
    tso_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/TSO2")
    inbox_dir = tso_dir / "raw" / "K12_Inbox"
    restored_dir = inbox_dir / "RESTORED_BY_AGENT" / "UNMAPPED"
    
    if not restored_dir.exists():
        print("❌ No restored directory found.")
        return

    print("🔍 Indexing RESTORED candidates...")
    candidates = []
    for f in restored_dir.glob("*"):
        if f.is_file():
            mtime = os.path.getmtime(f)
            name = f.name
            if "_" in name and name.split("_")[0].isdigit() and len(name.split("_")[0]) == 6:
                name = "_".join(name.split("_")[1:])
            
            candidates.append({
                'mtime': int(mtime),
                'name': name,
                'path': f
            })

    print(f"📊 {len(candidates)} candidates indexed.")

    # 2. Map all potential target folders in Inbox
    print("📂 Scanning Inbox folders for birthtime matches...")
    folders = []
    for root, dirs, filenames in os.walk(inbox_dir):
        if "RESTORED_BY_AGENT" in root: continue
        
        # We only care about the leaf folders (e.g. 31-12-2015)
        # Check birthtime
        btime = get_birthtime(root)
        if btime:
            folders.append({
                'path': Path(root),
                'btime': btime,
                'files': filenames
            })

    restored_count = 0
    # 3. Match and Move
    for c in candidates[:]:
        best_match = None
        # We look for a folder whose birthtime is very close to the file's mtime
        # (Usually files are scanned/added right when the folder is created)
        for folder in folders:
            # Tolerance: Files mtime is usually slightly AFTER folder birthtime
            # or exactly same if batch-copied. Let's use 10 minute window for safety.
            if abs(c['mtime'] - folder['btime']) < 600: 
                # Also check if this file is ALREADY there? (prevent duplicates)
                if c['name'] not in folder['files']:
                    best_match = folder
                    break
        
        if best_match:
            dest = best_match['path'] / c['name']
            # print(f"✅ Matching {c['path'].name} -> {dest.relative_to(inbox_dir)}")
            try:
                c['path'].rename(dest)
                candidates.remove(c)
                restored_count += 1
                # Update folder's internal file list so we don't double-match
                best_match['files'].append(c['name'])
            except Exception as e:
                print(f"❌ Failed to move {c['name']}: {e}")

    print(f"🏁 TOTAL RESTORED: {restored_count} files.")
    print(f"⚠️ Remaining in RESTORED_BY_AGENT: {len(candidates)}")

if __name__ == "__main__":
    holy_grail_restore()
