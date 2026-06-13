import os
from pathlib import Path

def remove_empty_dirs():
    inbox_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/raw/K12_Inbox")
    
    print(f"🧹 Scanning for empty directories under {inbox_dir}...")
    
    deleted_count = 0
    # Walk bottom-up so that nested empty directories are deleted correctly
    for root, dirs, files in os.walk(inbox_dir, topdown=False):
        # Do not delete the root inbox folder itself
        if Path(root) == inbox_dir:
            continue
            
        # Do not delete special directories
        if any(p in root for p in ["RESTORED_BY_AGENT", "K12_Manual_Action", "K12_Quarantine", "K12_Test"]):
            continue
            
        try:
            # Check if there are any files or subdirectories
            contents = os.listdir(root)
            # Filter out dotfiles like .DS_Store
            clean_contents = [c for c in contents if not c.startswith('.')]
            
            if len(clean_contents) == 0:
                # Remove dotfiles first if any
                for c in contents:
                    fpath = Path(root) / c
                    if fpath.is_file():
                        fpath.unlink()
                
                os.rmdir(root)
                print(f"  Removed empty directory: {Path(root).relative_to(inbox_dir)}")
                deleted_count += 1
        except Exception as e:
            print(f"  Failed to remove {root}: {e}")
            
    print(f"🏁 Removed {deleted_count} empty directories.")

if __name__ == "__main__":
    remove_empty_dirs()
