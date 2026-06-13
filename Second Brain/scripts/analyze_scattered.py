import os
from pathlib import Path

def analyze():
    inbox_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/raw/K12_Inbox")
    archive_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/raw/K12_Archive")
    
    empty_folders = []
    populated_folders = []
    
    # We walk the children of inbox_dir (depth 1 or 2) to identify folders
    for item in sorted(inbox_dir.iterdir()):
        if item.is_dir():
            # Check if empty (ignoring hidden files)
            files = [f for f in item.glob("**/*") if f.is_file() and not f.name.startswith('.')]
            if not files:
                empty_folders.append(item)
            else:
                populated_folders.append((item, len(files)))
                
    print(f"Total folders in K12_Inbox: {len(empty_folders) + len(populated_folders)}")
    print(f"Empty folders: {len(empty_folders)}")
    for folder in empty_folders[:20]:
        print(f"  - {folder.name}")
    if len(empty_folders) > 20:
        print(f"  ... and {len(empty_folders) - 20} more")
        
    print(f"\nPopulated folders: {len(populated_folders)}")
    for folder, count in populated_folders:
        print(f"  - {folder.name} ({count} files)")

if __name__ == "__main__":
    analyze()
