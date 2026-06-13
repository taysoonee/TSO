from pathlib import Path

def inspect():
    traced_file = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/.TSO/scripts/traced_lines.txt")
    
    patterns = ["130566-A", "381167-P", "802643-A", "790342-W", "876687-U", "962538-P", "556354-A", "83748-A"]
    
    with open(traced_file, "r") as f:
        for line in f:
            for p in patterns:
                if p in line:
                    print(line.strip()[:200])
                    break

if __name__ == "__main__":
    inspect()
