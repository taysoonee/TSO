#!/bin/bash
# Path to your K-12 Obsidian Vault/Wiki folder
WIKI_DIR="./Wiki"

echo "🧹 Cleaning broken paths in K-12 Wiki..."
# Uses perl to find wikilinks with slashes and strip the path prefix
find "$WIKI_DIR" -name "*.md" -type f -exec perl -pi -e 's/\[\[(?:[^\/\]]*\/)+([^\]]+)\]\]/\[\[$1\]\]/g' {} +
echo "✅ K-12 links converted to Shortest Path."