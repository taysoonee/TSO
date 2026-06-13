import os
from pathlib import Path

def map_folders():
    inbox_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/raw/K12_Inbox")
    archive_dir = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/raw/K12_Archive")
    paths_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/original_financial_paths.txt")
    
    if not paths_file.exists():
        print("❌ original_financial_paths.txt does not exist.")
        return
        
    # Read the original paths
    original_paths = []
    with open(paths_file, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            idx = line.find("78. Financial & Audited Reports")
            if idx != -1:
                original_paths.append(line[idx:])
                
    # List of folder names in K12_Inbox that represent extracted ZIPs
    extracted_zip_dirs = [
        "1923-A", "381167-P", "556354-A", "790342-W", "802643-A", "876687-U", "962538-P"
    ]
    
    proposed_moves = []
    
    for folder_name in extracted_zip_dirs:
        src_folder = inbox_dir / folder_name
        if not src_folder.exists():
            continue
            
        # Search original paths for a ZIP file matching this prefix
        # E.g. search for "1923-A" in paths to find Alice Smith target
        matching_paths = []
        for p in original_paths:
            fname = Path(p).name
            if folder_name in fname and fname.endswith(".zip"):
                matching_paths.append(p)
                
        if len(matching_paths) >= 1:
            # We take the first match (usually they belong to the same school folder anyway)
            target_path = matching_paths[0]
            # Target folder in archive should be the parent directory of that zip file, plus the folder name
            target_parent = Path(target_path).parent
            dest_folder = archive_dir / target_parent / folder_name
            
            # Now walk the src_folder and map all files inside it to dest_folder
            for root, dirs, files in os.walk(src_folder):
                for fname in files:
                    if fname.startswith('.'):
                        continue
                    src_file = Path(root) / fname
                    # Get relative path inside src_folder
                    rel = src_file.relative_to(src_folder)
                    dest_file = dest_folder / rel
                    proposed_moves.append((src_file, dest_file))
                    
    print(f"Proposed {len(proposed_moves)} moves for extracted ZIP folder contents.")
    for src, dest in proposed_moves[:20]:
        print(f"  - {src.relative_to(inbox_dir)} -> {dest.relative_to(archive_dir)}")
        
    # Append these moves to proposed_moves.txt so execute_restoration.py can run them!
    plan_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/proposed_moves.txt")
    with open(plan_file, "a") as out:
        for src, dest in proposed_moves:
            out.write(f"{src} -> {dest}\n")
    print(f"Appended moves to {plan_file}")

if __name__ == "__main__":
    map_folders()
