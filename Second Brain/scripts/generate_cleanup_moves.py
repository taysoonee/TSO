import os
import re
from pathlib import Path

def clean_filename(fname):
    # Strip prefixes like 20260608_001622_ or 232816_
    fname = re.sub(r'^\d{8}_\d{6}_', '', fname)
    fname = re.sub(r'^\d{5,6}_', '', fname)
    return fname

def generate_plan():
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
                rel = line[idx:]
                original_paths.append(rel)
                
    # Build maps of filename -> list of original relative paths
    file_to_orig_paths = {}
    for p in original_paths:
        fname = Path(p).name
        # Store under both clean and original name
        clean_f = clean_filename(fname)
        file_to_orig_paths.setdefault(clean_f, []).append(p)
        file_to_orig_paths.setdefault(fname, []).append(p)
        
    proposed_moves = []
    skipped_files = []
    
    # Walk the K12_Inbox
    for root, dirs, files in os.walk(inbox_dir):
        # Skip special directories
        if any(p in root for p in ["RESTORED_BY_AGENT", "K12_Manual_Action", "K12_Quarantine", "K12_Test"]):
            continue
            
        for fname in files:
            if fname.startswith('.'):
                continue
                
            src_file = Path(root) / fname
            
            # Look up clean filename
            cfname = clean_filename(fname)
            candidates = file_to_orig_paths.get(cfname, [])
            
            if not candidates:
                skipped_files.append((src_file, f"No historical target path found (Cleaned: {cfname})"))
                continue
                
            rel_src = src_file.relative_to(inbox_dir)
            matched_rel_path = None
            if len(candidates) == 1:
                matched_rel_path = candidates[0]
            else:
                # Disambiguation logic
                src_parts = list(rel_src.parent.parts)
                best_score = -1
                
                for cand in candidates:
                    cand_parts = list(Path(cand).parent.parts)
                    score = 0
                    for sp in src_parts:
                        sp_norm = re.sub(r'[\s_\-]', '', sp.lower())
                        for cp in cand_parts:
                            cp_norm = re.sub(r'[\s_\-]', '', cp.lower())
                            if sp_norm == cp_norm:
                                score += 10
                            elif sp_norm in cp_norm or cp_norm in sp_norm:
                                score += 2
                                
                    if score > best_score:
                        best_score = score
                        matched_rel_path = cand
                        
            if matched_rel_path:
                # If the original file had a prefix that we cleaned, we keep the prefix or use the clean name?
                # We should use the clean target filename at the destination so we clean up the messy prefixes!
                # Wait, this is perfect: we restore the clean filename! E.g. "Chatsworth - Financial Statement 2017.pdf" instead of "20260608_001622_Chatsworth..."
                target_fname = Path(matched_rel_path).name
                dest_file = archive_dir / Path(matched_rel_path).parent / target_fname
                proposed_moves.append((src_file, dest_file))
            else:
                skipped_files.append((src_file, "Could not disambiguate multiple target paths"))
                
    print(f"Total files in Inbox matched: {len(proposed_moves)}")
    print(f"Total files skipped: {len(skipped_files)}")
    
    # Save the proposed moves
    plan_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/proposed_moves.txt")
    with open(plan_file, "w") as out:
        for src, dest in proposed_moves:
            out.write(f"{src} -> {dest}\n")
    print(f"Plan written to {plan_file}")
    
    # Save skipped files for logs
    skipped_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/skipped_files.txt")
    with open(skipped_file, "w") as out:
        for src, reason in skipped_files:
            out.write(f"{src} : {reason}\n")
    print(f"Skipped files list written to {skipped_file}")

if __name__ == "__main__":
    generate_plan()
