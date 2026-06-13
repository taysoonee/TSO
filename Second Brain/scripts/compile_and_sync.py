#!/usr/bin/env python3
import os
import sys
import re
import json
import subprocess
import time

# Target directories and files relative to .TSO root
SYNC_DIRS = ["wiki", "Reports"]
CHAR_LIMIT = 3_000_000
WORD_LIMIT = 300_000
PREFIX = "tso_compiled_source"
NLM_PATH = "/Users/soonee.tay/.local/bin/nlm"

def strip_yaml_frontmatter(content: str) -> str:
    """Strips YAML frontmatter cleanly only at the start of the file."""
    content_clean = content.lstrip("\ufeff")
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n", content_clean, re.DOTALL)
    if match:
        return content_clean[match.end():]
    return content_clean

def split_large_entry(content: str, rel_path: str, max_chars: int, max_words: int):
    """Splits a single extremely large document on line boundaries to fit constraints."""
    lines = content.splitlines(keepends=True)
    chunks = []
    current_chunk_lines = []
    current_chunk_chars = 0
    current_chunk_words = 0
    sub_part = 1
    
    buffer_chars = 1000
    buffer_words = 100

    for line in lines:
        line_chars = len(line)
        line_words = len(line.split())
        
        if (current_chunk_chars + line_chars > max_chars - buffer_chars) or \
           (current_chunk_words + line_words > max_words - buffer_words):
            if current_chunk_lines:
                chunk_content = "".join(current_chunk_lines)
                header = f"\n\n# Source Document: {rel_path} (Part {sub_part})\n"
                chunks.append(header + chunk_content + "\n")
                sub_part += 1
                current_chunk_lines = [line]
                current_chunk_chars = line_chars
                current_chunk_words = line_words
            else:
                header = f"\n\n# Source Document: {rel_path} (Part {sub_part})\n"
                chunk_content = line[:max_chars - buffer_chars]
                chunks.append(header + chunk_content + "\n")
                sub_part += 1
                current_chunk_lines = []
                current_chunk_chars = 0
                current_chunk_words = 0
        else:
            current_chunk_lines.append(line)
            current_chunk_chars += line_chars
            current_chunk_words += line_words
            
    if current_chunk_lines:
        chunk_content = "".join(current_chunk_lines)
        header = f"\n\n# Source Document: {rel_path} (Part {sub_part})\n"
        chunks.append(header + chunk_content + "\n")
        
    return chunks

def get_notebook_id():
    """Finds a notebook with '[AGY] TSO Second Brain' in its title using nlm CLI."""
    print("🔍 Listing notebooks in NotebookLM...")
    try:
        res = subprocess.run([NLM_PATH, "list", "notebooks"], capture_output=True, text=True, check=True)
        notebooks = json.loads(res.stdout)
    except Exception as e:
        print(f"❌ Error listing notebooks: {e}")
        sys.exit(1)

    for nb in notebooks:
        title = nb.get("title", "")
        if "[AGY] TSO Second Brain" in title:
            return nb["id"], title
            
    # Fallback search for any [AGY] TSO notebook
    for nb in notebooks:
        title = nb.get("title", "")
        if "TSO Second Brain" in title:
            return nb["id"], title

    # Create if not found
    new_title = "[AGY] TSO Second Brain"
    print(f"➕ No '[AGY] TSO Second Brain' notebook found. Creating one titled '{new_title}'...")
    try:
        res = subprocess.run([NLM_PATH, "notebook", "create", new_title], capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        nb_id = data.get("notebook_id") or data.get("id")
        if nb_id:
            return nb_id, new_title
    except Exception as e:
        print(f"❌ Failed to create notebook: {e}")
        sys.exit(1)

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_root = os.path.dirname(script_dir)
    output_dir = os.path.join(script_dir, "compiled_sources")
    os.makedirs(output_dir, exist_ok=True)

    # 1. Get Notebook ID
    notebook_id, notebook_title = get_notebook_id()
    print(f"🎯 Target Notebook: '{notebook_title}' (ID: {notebook_id})")

    # 2. Compile notes into chunks
    print("🧹 Starting compilation and cleaning...")
    current_chars = 0
    current_words = 0
    part_num = 1
    accumulator = []
    seen_real_paths = set()
    total_raw_files = 0
    
    for dir_name in SYNC_DIRS:
        target_path = os.path.join(workspace_root, dir_name)
        if not os.path.exists(target_path):
            print(f"⚠️ Directory '{dir_name}' not found at {target_path}")
            continue
            
        print(f"📁 Processing '{dir_name}'...")
        if os.path.isfile(target_path):
            files_to_process = [(os.path.dirname(target_path), os.path.basename(target_path))]
        else:
            files_to_process = []
            for root, dirs, files in os.walk(target_path, followlinks=True):
                # Prune hidden directories in-place
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    files_to_process.append((root, file))
                    
        for root, file in files_to_process:
            if file.startswith('.'):
                continue
            if not file.endswith(".md") and not file.endswith(".txt"):
                continue
                
            abs_path = os.path.join(root, file)
            try:
                real_path = os.path.realpath(abs_path)
            except Exception:
                continue
                
            if real_path in seen_real_paths:
                continue
            seen_real_paths.add(real_path)
            
            try:
                with open(real_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception as e:
                print(f"⚠️ Error reading {real_path}: {e}")
                continue
                
            content = strip_yaml_frontmatter(content).strip()
            if not content:
                continue
            
            total_raw_files += 1
            rel_path = os.path.relpath(real_path, workspace_root)
            boundary = f"\n\n# Source Document: {rel_path}\n"
            entry = boundary + content + "\n"
            
            entry_chars = len(entry)
            entry_words = len(entry.split())
            
            if entry_chars > CHAR_LIMIT or entry_words > WORD_LIMIT:
                entries_to_process = split_large_entry(content, rel_path, CHAR_LIMIT, WORD_LIMIT)
            else:
                entries_to_process = [entry]
                
            for ent in entries_to_process:
                ent_chars = len(ent)
                ent_words = len(ent.split())
                
                if (current_chars + ent_chars > CHAR_LIMIT) or (current_words + ent_words > WORD_LIMIT):
                    if accumulator:
                        out_path = os.path.join(output_dir, f"{PREFIX}_{part_num}.txt")
                        with open(out_path, "w", encoding="utf-8", errors="replace") as out_f:
                            out_f.write("".join(accumulator))
                        print(f"   💾 Created local chunk {part_num}: {out_path} ({len(accumulator)} documents)")
                        part_num += 1
                        accumulator = []
                        current_chars = 0
                        current_words = 0
                
                accumulator.append(ent)
                current_chars += ent_chars
                current_words += ent_words

    if accumulator:
        out_path = os.path.join(output_dir, f"{PREFIX}_{part_num}.txt")
        with open(out_path, "w", encoding="utf-8", errors="replace") as out_f:
            out_f.write("".join(accumulator))
        print(f"   💾 Created local chunk {part_num}: {out_path} ({len(accumulator)} documents)")
    
    print(f"📊 Compilation complete! Compiled {total_raw_files} files into {part_num} super chunks.")

    # 3. Fetch current sources in NotebookLM and clean old compiled chunks
    print("🧹 Fetching current sources in NotebookLM to prune old chunks...")
    try:
        res = subprocess.run([NLM_PATH, "source", "list", notebook_id, "--json"], capture_output=True, text=True, check=True)
        current_sources = json.loads(res.stdout)
    except Exception as e:
        print(f"⚠️ Warning: Could not list sources: {e}. Skipping pruning.")
        current_sources = []

    to_delete = []
    for src in current_sources:
        title = src.get("title", "")
        if title.startswith(PREFIX) or title.endswith(".txt") and PREFIX in title:
            to_delete.append(src["id"])
            
    for src in current_sources:
        title = src.get("title", "")
        if title.endswith(".md"):
            to_delete.append(src["id"])

    if to_delete:
        print(f"🗑️ Deleting {len(to_delete)} old/stale sources from notebook...")
        try:
            subprocess.run([NLM_PATH, "source", "delete"] + to_delete + ["--confirm"], check=True)
            print("   ✅ Old sources deleted successfully.")
        except Exception as e:
            print(f"   ❌ Error deleting old sources: {e}")

    # 4. Upload fresh compiled chunks
    print("📤 Uploading fresh compiled chunks to NotebookLM...")
    for part in range(1, part_num + 1):
        chunk_file = os.path.join(output_dir, f"{PREFIX}_{part}.txt")
        if not os.path.exists(chunk_file):
            continue
            
        print(f"   🚀 Uploading chunk {part}/{part_num}: {os.path.basename(chunk_file)}...")
        try:
            subprocess.run([
                NLM_PATH, "source", "add", notebook_id,
                "--file", chunk_file,
                "--wait"
            ], check=True)
            print(f"   ✅ Chunk {part} uploaded successfully.")
        except Exception as e:
            print(f"   ❌ Failed to upload chunk {part}: {e}")

    # 5. Clean up local compiled sources directory
    print("🧹 Cleaning up temporary local chunk files...")
    for part in range(1, part_num + 1):
        chunk_file = os.path.join(output_dir, f"{PREFIX}_{part}.txt")
        if os.path.exists(chunk_file):
            try:
                os.remove(chunk_file)
            except Exception:
                pass
    try:
        os.rmdir(output_dir)
    except Exception:
        pass

    print("\n🎉 NotebookLM compilation synchronization fully complete!")

if __name__ == "__main__":
    main()
