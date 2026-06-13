import os
import shutil
import hashlib
from pathlib import Path

def get_sha256(path):
    """Computes SHA-256 checksum of a file to securely verify identity."""
    h = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()
    except Exception as e:
        print(f"Error hashing {path}: {e}")
        return None

def get_unique_destination(dest):
    """Finds a unique filename in case of collisions by appending v2, v3, etc."""
    if not dest.exists():
        return dest
        
    parent = dest.parent
    stem = dest.stem
    ext = dest.suffix
    
    # If the file already starts with v2_ or similar, strip it first or build on it
    # But usually we just append _vN or similar
    count = 2
    while True:
        candidate = parent / f"v{count}_{stem}{ext}"
        if not candidate.exists():
            return candidate
        count += 1

def execute_moves(dry_run=True):
    plan_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/proposed_moves.txt")
    log_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/execution_log.txt")
    
    if not plan_file.exists():
        print(f"❌ Plan file {plan_file} does not exist.")
        return
        
    moves = []
    with open(plan_file, "r") as f:
        for line in f:
            line = line.strip()
            if " -> " in line:
                src, dest = line.split(" -> ")
                moves.append((Path(src), Path(dest)))
                
    print(f"Loaded {len(moves)} proposed moves. Mode: {'DRY RUN' if dry_run else 'REAL EXECUTION'}")
    
    success_count = 0
    fail_count = 0
    skip_count = 0
    
    # Initialize incremental log file if not dry run
    if not dry_run:
        # Clear previous log file
        with open(log_file, "w") as log:
            log.write(f"--- RESTORATION START (dry_run=False) ---\n")
            
    for src, dest in moves:
        if not src.exists():
            print(f"⚠️ Source does not exist: {src}")
            fail_count += 1
            continue
            
        if dry_run:
            print(f"[DRY RUN] Would move: {src.name} -> {dest}")
            success_count += 1
        else:
            try:
                # Ensure destination folder exists
                dest.parent.mkdir(parents=True, exist_ok=True)
                
                # Check if dest already exists
                if dest.exists():
                    src_hash = get_sha256(src)
                    dest_hash = get_sha256(dest)
                    
                    if src_hash and dest_hash and src_hash == dest_hash:
                        # File is identical in content, delete source safely to avoid duplicates
                        src.unlink()
                        log_entry = f"DUPLICATE_DELETED: {src} -> {dest}"
                        skip_count += 1
                    else:
                        # File content differs, find a unique collision suffix
                        unique_dest = get_unique_destination(dest)
                        shutil.move(str(src), str(unique_dest))
                        log_entry = f"MOVED_WITH_SUFFIX: {src} -> {unique_dest}"
                        success_count += 1
                else:
                    shutil.move(str(src), str(dest))
                    log_entry = f"MOVED: {src} -> {dest}"
                    success_count += 1
                    
                # Write log entry incrementally and flush
                with open(log_file, "a") as log:
                    log.write(log_entry + "\n")
                    log.flush()
                    
            except Exception as e:
                err_msg = f"FAILED: {src} -> {dest} (Error: {e})"
                print(f"❌ {err_msg}")
                with open(log_file, "a") as log:
                    log.write(err_msg + "\n")
                    log.flush()
                fail_count += 1
                
    print(f"\n🏁 Finished. Success/Moved: {success_count}, Failed/Missing: {fail_count}, Skipped/Duplicates: {skip_count}")

if __name__ == "__main__":
    # Change to False for real execution
    execute_moves(dry_run=False)
