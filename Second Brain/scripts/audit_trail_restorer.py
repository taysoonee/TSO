
import os
import re
from pathlib import Path

# Paths
TRANSCRIPT_PATH = "/Users/soonee.tay/.gemini/antigravity/brain/f78b01ef-45df-444b-9b07-92168c275bd9/.system_generated/logs/transcript.jsonl"
INBOX_ROOT = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/TSO2/raw/K12_Inbox")
ARCHIVE_ROOT = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/TSO2/raw/K12_Archive")
RESTORED_DIR = INBOX_ROOT / "RESTORED_BY_AGENT" / "UNMAPPED"

def extract_mapping():
    mapping = {}
    print(f"🔍 Deep scanning transcript for audit trail...")
    # Regex to find paths like /Folder/Subfolder/Filename.ext
    # We look for strings that start with / and end with a common file extension
    path_regex = re.compile(r'/([^"\'\n\\]+\.(?:tif|tiff|pdf|zip|heic))', re.IGNORECASE)
    
    with open(TRANSCRIPT_PATH, 'r', errors='ignore') as f:
        for line in f:
            for match in path_regex.finditer(line):
                full_path = match.group(1)
                if '/' in full_path:
                    # Clean up the path (remove leading K12_Inbox or raw/K12_Inbox if present)
                    clean_path = re.sub(r'^(?:raw/)?K12_Inbox/', '', full_path)
                    # Also handle the "Nested Mess" paths
                    clean_path = re.sub(r'^.*K12_Archive/(?:raw/)?K12_Inbox/', '', clean_path)
                    
                    if '/' in clean_path:
                        parent = os.path.dirname(clean_path)
                        filename = os.path.basename(clean_path)
                        # Store the longest parent path for each filename
                        if filename not in mapping or len(parent) > len(mapping[filename]):
                            mapping[filename] = parent
    return mapping

def restore():
    mapping = extract_mapping()
    print(f"📊 Extracted audit trail for {len(mapping)} files.")
    
    # 1. Check RESTORED_BY_AGENT
    if RESTORED_DIR.exists():
        for f in RESTORED_DIR.iterdir():
            if f.is_file():
                # Remove timestamp prefix if present (e.g. 232815_00008.tif -> 00008.tif)
                clean_name = re.sub(r'^\d+_', '', f.name)
                if clean_name in mapping:
                    target_dir = INBOX_ROOT / mapping[clean_name]
                    target_dir.mkdir(parents=True, exist_ok=True)
                    target_path = target_dir / clean_name
                    print(f"✅ Restoring {f.name} -> {mapping[clean_name]}/{clean_name}")
                    f.rename(target_path)
                else:
                    print(f"❓ No trail for {f.name}")
    
    # 2. Skip ARCHIVE_ROOT scan to avoid hangs
    print("⏭️ Skipped Archive scan for scattered files.")

if __name__ == "__main__":
    restore()
