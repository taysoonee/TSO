import os
from pathlib import Path

def find_all_files_txt():
    search_dirs = [
        Path("/Users/soonee.tay/.gemini"),
        Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain")
    ]
    for d in search_dirs:
        if not d.exists():
            continue
        for root, dirs, files in os.walk(d):
            if "Second Brain" in str(root) and not any(p in str(root) for p in [".TSO", ".obsidian"]):
                dirs[:] = []
                continue
            for fname in files:
                if fname == "all_files.txt":
                    print(f"Found: {Path(root) / fname}")

if __name__ == "__main__":
    find_all_files_txt()
