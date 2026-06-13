import re
from pathlib import Path

def extract():
    all_files_path = Path("/Users/soonee.tay/.gemini/antigravity-cli/brain/b24be716-9958-4cc9-b8c4-b7e439493d02/scratch/all_files.txt")
    output_mapping_path = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/original_financial_paths.txt")
    
    print(f"Reading original file list from {all_files_path}...")
    mappings = []
    
    with open(all_files_path, "r", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # Look for lines containing 78. Financial & Audited Reports
            if "78. Financial & Audited Reports" in line:
                # Clean up the line (remove size info at the end)
                parts = line.split(" | ")
                full_path = parts[0].strip()
                mappings.append(full_path)
                
    print(f"Found {len(mappings)} files originally located under '78. Financial & Audited Reports'.")
    with open(output_mapping_path, "w") as out:
        for m in sorted(mappings):
            out.write(m + "\n")
            
    print(f"Successfully saved original paths to {output_mapping_path}")

if __name__ == "__main__":
    extract()
