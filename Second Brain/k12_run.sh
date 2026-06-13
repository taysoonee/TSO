#!/bin/bash
set -o pipefail
if [ -x "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Ensure gemini command is accessible
export PATH="/usr/local/bin:/Users/soonee.tay/.local/bin:$PATH"

# Resolve logical and physical directory paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHYSICAL_SCRIPT_DIR="$(cd -P "$SCRIPT_DIR" && pwd)"

# Operational paths
mkdir -p "$PHYSICAL_SCRIPT_DIR/raw"
LOCK_FILE="$PHYSICAL_SCRIPT_DIR/raw/k12_run.lock"
if [ -e "$LOCK_FILE" ]; then
    OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "❌ K-12 ingestion is already running (PID: $OLD_PID). Exiting."
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

ORIGINAL_INBOX="${1:-$PHYSICAL_SCRIPT_DIR/raw/K12_Inbox}"
ARCHIVE="$PHYSICAL_SCRIPT_DIR/raw/K12_Archive"
CACHE_FILE="$PHYSICAL_SCRIPT_DIR/raw/.k12_triage_cache.txt"
K12_BUDGET="${K12_BUDGET:-5.0}" # Daily budget in MYR

mkdir -p "$ORIGINAL_INBOX" "$ARCHIVE"
touch "$CACHE_FILE"

# Hand off to the high-efficiency Batch API ingestion engine.
# This polls for and processes previous completed runs, then submits new ones.
echo "🔍 Phase 1: Checking and retrieving completed Batch Jobs..."
python3 -u "$PHYSICAL_SCRIPT_DIR/scripts/k12_batch_retrieve.py"

echo "📤 Phase 2: Processing and submitting new files to Gemini Batch API..."
python3 -u "$PHYSICAL_SCRIPT_DIR/scripts/k12_batch_submit.py"

echo "🔄 Phase 3: Syncing latest wiki & reports to NotebookLM..."
python3 "$PHYSICAL_SCRIPT_DIR/scripts/compile_and_sync.py" || echo "⚠️ Warning: NotebookLM sync failed"

# Cleanup
echo "🧹 Cleaning up..."
find "$ORIGINAL_INBOX" -mindepth 1 -type d -empty -delete
rm -rf "$K12_STAGING_DIR"
echo "✅ K-12 RUN COMPLETED SUCCESSFULLY."
