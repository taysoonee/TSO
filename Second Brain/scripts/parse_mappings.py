import re
from pathlib import Path

def parse():
    traced_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/traced_lines.txt")
    
    # We want to match:
    # Source: e.g. "v2_00001.tif", "Annual_Reports/00001.tif", "130566-A/00001.tif"
    # Destination: e.g. "78. Financial & Audited Reports/1 Local Schools/Tier-1 Schools/T1_ British School  -2019/2019/00001.tif"
    # Let's extract any paths containing "78. Financial & Audited Reports"
    
    mappings = {}
    
    path_pattern = re.compile(r'78\. Financial & Audited Reports/[^\'"\s]+', re.IGNORECASE)
    
    with open(traced_file, "r") as f:
        for line in f:
            matches = path_pattern.findall(line)
            for m in matches:
                # Clean up match
                m_clean = m.strip('[](){}\'",;:\\')
                m_clean = m_clean.replace('\\/', '/')
                m_clean = re.sub(r'\\+$', '', m_clean)
                
                parts = m_clean.split('/')
                # The filename is the last part
                if len(parts) > 1:
                    filename = parts[-1]
                    # Check if filename has an extension
                    if '.' in filename and len(filename.split('.')[-1]) in [3, 4]:
                        # Reconstruct destination directory relative to 78. Financial & Audited Reports
                        dest_dir = '/'.join(parts[:-1])
                        # Let's see if we can find where this file currently resides in K12_Inbox
                        mappings[filename] = dest_dir

    print(f"Parsed {len(mappings)} unique file mappings.")
    for fname, dest in sorted(mappings.items())[:50]:
        print(f"  {fname} -> {dest}")

if __name__ == "__main__":
    parse()
