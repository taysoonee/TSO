import os
from pathlib import Path
from datetime import datetime

def precise_restore():
    tso_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/TSO2")
    inbox_dir = tso_dir / "raw" / "K12_Inbox"
    restored_dir = inbox_dir / "RESTORED_BY_AGENT" / "UNMAPPED"
    
    if not restored_dir.exists():
        print("❌ No restored directory found.")
        return

    print("🔍 Indexing RESTORED candidates...")
    candidates = [] # list of (mtime, original_name, path)
    for f in restored_dir.glob("*"):
        if f.is_file():
            mtime = os.path.getmtime(f)
            name = f.name
            # Handle my timestamped prefixes: 232815_00005.tif -> 00005.tif
            if "_" in name and name.split("_")[0].isdigit() and len(name.split("_")[0]) == 6:
                name = "_".join(name.split("_")[1:])
            
            candidates.append({
                'mtime': int(mtime),
                'name': name,
                'path': f
            })

    print(f"📊 {len(candidates)} candidates indexed.")

    restored_count = 0
    # 2. Scan Inbox for Holes
    for root, dirs, filenames in os.walk(inbox_dir):
        if "RESTORED_BY_AGENT" in root: continue
        
        tif_files = [f for f in filenames if f.endswith(".tif") and f[:-4].isdigit()]
        if not tif_files: continue
        
        # Get folder's primary timestamp (median mtime of existing files)
        mtimes = [int(os.path.getmtime(Path(root) / f)) for f in tif_files]
        if not mtimes: continue
        target_mtime = sorted(mtimes)[len(mtimes)//2] # Median
        
        tif_nums = sorted([int(f[:-4]) for f in tif_files])
        max_num = max(tif_nums)
        
        # Check for holes 1..max_num
        for i in range(1, max_num + 1):
            expected_name = f"{i:05d}.tif"
            if expected_name not in filenames:
                # Hole found! Look for match in candidates
                match = None
                for c in candidates:
                    # Match by name AND timestamp (within 2 seconds tolerance for filesystem jitter)
                    if c['name'] == expected_name and abs(c['mtime'] - target_mtime) <= 2:
                        match = c
                        break
                
                if match:
                    dest = Path(root) / expected_name
                    print(f"✅ Found Match! Restoring {match['path'].name} -> {dest.relative_to(inbox_dir)}")
                    match['path'].rename(dest)
                    # Remove from candidates so we don't reuse it
                    candidates.remove(match)
                    restored_count += 1
                else:
                    # Optional: print("❓ No match for", root, expected_name)
                    pass

    print(f"🏁 Finished! Restored {restored_count} files to their original homes.")

if __name__ == "__main__":
    precise_restore()
